/**
 * Data-only vocabulary for managed MCP servers.
 * @module @anht3889/dsh-mcp-mgmt-mcp/types
 */

import type { McpServerId } from './brand.ts'

/** Authentication configuration for an MCP server. */
export type McpAuthConfig =
  | { kind: 'none' }
  | { kind: 'headers'; headerNames: string[] }
  | {
      kind: 'oauth'
      clientId: string
      authorizeUrl: string
      tokenUrl: string
      scopes: string[]
      /**
       * Loopback path that receives the authorization redirect. Authorization
       * servers match a client's registered redirect URIs exactly, so a
       * pre-registered public client accepts only the path it was registered
       * with; a client obtained by Dynamic Client Registration accepts the
       * default.
       */
      redirectPath: string
    }

/** A durable, non-secret MCP server configuration. */
export interface McpServerRecord {
  id: McpServerId
  serverName: string
  enabled: boolean
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  auth: McpAuthConfig
  /**
   * Raw MCP tool names the manager withholds from the harness registry. An
   * absent list registers every tool the server lists.
   */
  disabledTools?: string[]
  toolCallTimeoutMs: number
  reconnect: {
    enabled: boolean
    initialDelayMs: number
    maxDelayMs: number
    maxAttempts: number
  }
  createdAt: string
  updatedAt: string
}

/** One tool an MCP server listed, with the state of its registration. */
export interface McpToolInfo {
  /** The tool name as the MCP server lists it. */
  name: string
  /** The description the server advertises, empty when it advertises none. */
  description: string
  /** Whether the manager registers this tool on the harness tool registry. */
  enabled: boolean
}

/** The in-memory connection state of an MCP server. */
export type McpConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting'; attempt: number }
  | { state: 'connected'; toolCount: number; connectedAt: string }
  | { state: 'reconnecting'; attempt: number; nextDelayMs: number }
  | { state: 'failed'; error: string; at: string }

/** One in-memory MCP lifecycle log entry. */
export interface McpLogEntry {
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
}
