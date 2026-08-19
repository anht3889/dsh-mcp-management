/**
 * Bridges MCP tool discovery into the harness tool registry.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager/tools
 */

import type { Client } from '@modelcontextprotocol/sdk/client'
import type { McpToolInfo } from '@anht3889/dsh-mcp-mgmt-mcp/types'
import { publicToolName } from './naming.ts'

/** Registration API consumed from the harness tool runtime. */
interface ToolRegistry {
  register(definition: ToolDefinition): () => void
}

/** Context surface needed to expose MCP tools. */
export interface ToolContext {
  tools: ToolRegistry
}

/** Options that identify an MCP server, select its tools, and bound each call. */
export interface SyncToolsOptions {
  serverName: string
  toolCallTimeoutMs: number
  /** Raw tool names to list without registering. */
  disabledTools: readonly string[]
}

/** One registered MCP tool's teardown, keyed by its public name. */
export type ToolDisposers = Map<string, () => void>

/** The outcome of one tool-discovery pass. */
export interface SyncedTools {
  /** Disposers for the tools this pass registered, keyed by public name. */
  disposers: ToolDisposers
  /** Every tool the server listed, registered or not, in listing order. */
  listed: McpToolInfo[]
}

interface ToolDefinition {
  name: string
  description: string
  parameters: unknown
  timeoutMs: number
  output: {
    schema: object
    render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }>
  }
  execute(args: unknown, exec: { signal: AbortSignal }): Promise<unknown>
}

interface McpResult {
  content: unknown[]
  structuredContent?: unknown
}

/**
 * Lists an MCP server's tools and registers the selected ones under public
 * names. A disabled tool is still reported, so the settings UI can offer it
 * without a reconnect.
 *
 * @param ctx - Harness context that owns the tool registry.
 * @param client - Connected MCP client used for discovery and invocation.
 * @param opts - Server namespace, disabled tool names, and per-tool timeout.
 * @returns Disposers for every registration created by this call, plus every
 *   listed tool.
 */
export async function syncTools(
  ctx: ToolContext,
  client: Client,
  opts: SyncToolsOptions,
): Promise<SyncedTools> {
  const disposers: ToolDisposers = new Map()
  const listed: McpToolInfo[] = []
  const disabled = new Set(opts.disabledTools)
  let cursor: string | undefined

  try {
    do {
      const result = await client.listTools(cursor === undefined ? undefined : { cursor })
      for (const tool of result.tools) {
        const enabled = !disabled.has(tool.name)
        listed.push({ name: tool.name, description: tool.description ?? '', enabled })
        if (!enabled) continue
        const name = publicToolName(opts.serverName, tool.name)
        if (disposers.has(name)) {
          throw new Error(`MCP server "${opts.serverName}" listed duplicate tool "${tool.name}"`)
        }
        const definition = createToolDefinition(client, tool, opts, name)
        disposers.set(name, ctx.tools.register(definition))
      }
      cursor = result.nextCursor
    } while (cursor !== undefined)
  } catch (error) {
    for (const dispose of disposers.values()) dispose()
    throw error
  }

  return { disposers, listed }
}

/** Builds the harness registration for one MCP tool. */
function createToolDefinition(
  client: Client,
  tool: { name: string; description?: string; inputSchema: unknown },
  opts: SyncToolsOptions,
  name: string,
): ToolDefinition {
  return {
    name,
    description: tool.description ?? '',
    parameters: tool.inputSchema,
    timeoutMs: opts.toolCallTimeoutMs,
    output: {
      schema: {
        type: 'object',
        properties: {
          content: { type: 'array', items: {} },
          structuredContent: {},
        },
        required: ['content'],
        additionalProperties: false,
      },
      render(_args, value) {
        const result = value as McpResult
        return [{ type: 'text', text: JSON.stringify(result.content) }]
      },
    },
    async execute(args, exec) {
      const result = await client.callTool(
        {
          name: tool.name,
          arguments: isRecord(args) ? args : {},
        },
        undefined,
        { signal: exec.signal, timeout: opts.toolCallTimeoutMs },
      )
      return {
        content: result.content,
        ...result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent },
      }
    },
  }
}

/** Narrows model arguments to the MCP tool-call object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
