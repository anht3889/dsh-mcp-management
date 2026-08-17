/**
 * Bridges MCP tool discovery into the harness tool registry.
 * @module @deepseek-ai/dsh-mcp-mgmt-manager/tools
 */

import type { Client } from '@modelcontextprotocol/sdk/client'
import { publicToolName } from './naming.ts'

/** Registration API consumed from the harness tool runtime. */
interface ToolRegistry {
  register(definition: ToolDefinition): () => void
}

/** Context surface needed to expose MCP tools. */
export interface ToolContext {
  tools: ToolRegistry
}

/** Options that identify an MCP server and bound each call. */
export interface SyncToolsOptions {
  serverName: string
  toolCallTimeoutMs: number
}

/** One registered MCP tool's teardown, keyed by its public name. */
export type ToolDisposers = Map<string, () => void>

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
 * Lists an MCP server's tools and registers them under public names.
 *
 * @param ctx - Harness context that owns the tool registry.
 * @param client - Connected MCP client used for discovery and invocation.
 * @param opts - Server namespace and per-tool timeout.
 * @returns Disposers for every registration created by this call.
 */
export async function syncTools(
  ctx: ToolContext,
  client: Client,
  opts: SyncToolsOptions,
): Promise<ToolDisposers> {
  const disposers: ToolDisposers = new Map()
  let cursor: string | undefined

  try {
    do {
      const result = await client.listTools(cursor === undefined ? undefined : { cursor })
      for (const tool of result.tools) {
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

  return disposers
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
