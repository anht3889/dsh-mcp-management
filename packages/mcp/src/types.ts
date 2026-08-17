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
