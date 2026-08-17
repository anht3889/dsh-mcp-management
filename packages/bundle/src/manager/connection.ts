/**
 * Supervises one managed MCP connection and its registered tools.
 * @module @deepseek-ai/dsh-mcp-mgmt-bundle/manager/connection
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpConnectionStatus, McpLogEntry, McpServerRecord } from '@deepseek-ai/dsh-mcp-mgmt-mcp/types'
import { syncTools, type ToolContext, type ToolDisposers } from './tools.ts'
import { createTransport } from './transport.ts'

/** Dependencies and event sinks for one supervised MCP connection. */
export interface ConnectionHooks {
  /** The tool registry where discovered MCP tools are registered. */
  ctx: ToolContext
  /** Creates a new transport for each connection generation. */
  createTransport?: () => Transport
  /** Resolves HTTP credentials when the default transport factory is used. */
  resolveHeaders?: () => Promise<Record<string, string>>
  /** Waits before the next connection generation. */
  delay?: (milliseconds: number) => Promise<void>
  /** Receives each observable connection state transition. */
  onStatus(status: McpConnectionStatus): void
  /** Receives lifecycle log entries. */
  onLog(entry: McpLogEntry): void
}

/** Handle that stops a supervised MCP connection. */
export interface ConnectionHandle {
  /** Stops future reconnects, closes the client, and unregisters its tools. */
  stop(): Promise<void>
}

/**
 * Connects to an MCP server, registers its tools, and reconnects after loss.
 *
 * @param record - The durable MCP server configuration.
 * @param hooks - Tool registry, injectable transport factory, and lifecycle event sinks.
 * @returns A handle that stops the connection and unregisters its tools.
 */
export function startConnection(record: McpServerRecord, hooks: ConnectionHooks): ConnectionHandle {
  let stopped = false
  let client: Client | undefined
  let disposers: ToolDisposers = new Map()
  let reconnectFailures = 0
  let generation = 0

  const log = (level: McpLogEntry['level'], message: string, detail?: string): void => {
    hooks.onLog({ at: new Date().toISOString(), level, message, ...detail === undefined ? {} : { detail } })
  }
  const setStatus = (status: McpConnectionStatus): void => {
    hooks.onStatus(status)
  }
  const disposeTools = (): void => {
    for (const dispose of disposers.values()) dispose()
    disposers = new Map()
  }
  const wait = hooks.delay ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const buildTransport = hooks.createTransport
    ?? (() => createTransport(record, hooks.resolveHeaders ?? (async () => ({}))))

  const run = async (attempt: number): Promise<void> => {
    const currentGeneration = ++generation
    setStatus({ state: 'connecting', attempt })
    log('info', `Connecting to MCP server "${record.serverName}" (attempt ${attempt})`)

    const nextClient = new Client(
      { name: 'dsh-mcp-manager', version: '0.0.0' },
      { capabilities: {} },
    )
    client = nextClient
    nextClient.onclose = () => {
      if (stopped || generation !== currentGeneration) return
      generation += 1
      client = undefined
      disposeTools()
      void reconnect(undefined)
    }

    try {
      await nextClient.connect(buildTransport())
      if (stopped || generation !== currentGeneration) return
      disposers = await syncTools(hooks.ctx, nextClient, {
        serverName: record.serverName,
        toolCallTimeoutMs: record.toolCallTimeoutMs,
      })
      reconnectFailures = 0
      const connectedAt = new Date().toISOString()
      setStatus({ state: 'connected', toolCount: disposers.size, connectedAt })
      log('info', `Connected to MCP server "${record.serverName}" with ${disposers.size} tools`)
    } catch (error) {
      if (stopped || generation !== currentGeneration) return
      client = undefined
      try {
        await nextClient.close()
      } catch {
        // A failed transport may already be closed.
      }
      await reconnect(error)
    }
  }

  const reconnect = async (error: unknown): Promise<void> => {
    if (stopped) return
    if (!record.reconnect.enabled) {
      const at = new Date().toISOString()
      if (error === undefined) {
        setStatus({ state: 'disconnected' })
        log('warn', `Disconnected from MCP server "${record.serverName}"`)
      } else {
        setStatus({ state: 'failed', error: String(error), at })
        log('error', `Connection to MCP server "${record.serverName}" failed`, String(error))
      }
      return
    }

    if (error !== undefined) reconnectFailures += 1
    if (reconnectFailures >= record.reconnect.maxAttempts) {
      const at = new Date().toISOString()
      disposeTools()
      setStatus({ state: 'failed', error: String(error ?? 'Connection closed'), at })
      log('error', `MCP server "${record.serverName}" failed after ${reconnectFailures} attempts`, error === undefined ? undefined : String(error))
      return
    }

    const attempt = reconnectFailures + 1
    const nextDelayMs = Math.min(
      record.reconnect.maxDelayMs,
      record.reconnect.initialDelayMs * 2 ** (attempt - 1),
    )
    setStatus({ state: 'reconnecting', attempt, nextDelayMs })
    log('warn', `Reconnecting to MCP server "${record.serverName}" in ${nextDelayMs}ms (attempt ${attempt})`)
    await wait(nextDelayMs)
    if (!stopped) await run(attempt)
  }

  void run(0)

  return {
    async stop(): Promise<void> {
      stopped = true
      generation += 1
      const current = client
      client = undefined
      if (current !== undefined) {
        try {
          await current.close()
        } catch {
          // A disconnected transport has no further resources to close.
        }
      }
      disposeTools()
      setStatus({ state: 'disconnected' })
      log('info', `Stopped MCP server "${record.serverName}" connection`)
    },
  }
}
