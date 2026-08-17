/**
 * MCP management capability seam exposed as `ctx.mcp`.
 * @module @anht3889/dsh-mcp-mgmt-mcp
 */

import type { Context } from '@deepseek-ai/cordis'
import type { McpServerId } from './brand.ts'
import type {
  McpConnectionStatus,
  McpLogEntry,
  McpServerRecord,
} from './types.ts'

export { asMcpServerId, SERVER_NAME_PATTERN } from './brand.ts'
export type { McpServerId } from './brand.ts'
export type {
  McpAuthConfig,
  McpConnectionStatus,
  McpLogEntry,
  McpServerRecord,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcp: McpRuntime
  }
}

/**
 * Service Definition for MCP server management, published on `ctx.mcp` by a
 * provider that calls `ctx.provide('mcp', runtime)`.
 *
 * The seam is a type, not a `Service` subclass: an out-of-tree plugin installed
 * into a `dsh` profile cannot resolve the installation's `@deepseek-ai/cordis`
 * copy at runtime, and a second copy would register the service against a
 * foreign context store.
 */
export interface McpRuntime {
  /** @returns the configured MCP server records. */
  list(): McpServerRecord[]

  /**
   * @param id - the server identifier.
   * @returns the matching record, if present.
   */
  get(id: McpServerId): McpServerRecord | undefined

  /**
   * @param record - the record to create or replace.
   * @returns the stored record.
   */
  upsert(record: McpServerRecord): Promise<McpServerRecord>

  /** @param id - the server identifier to remove. */
  remove(id: McpServerId): Promise<void>

  /**
   * @param id - the server identifier.
   * @param enabled - whether the server is enabled.
   */
  setEnabled(id: McpServerId, enabled: boolean): Promise<void>

  /** @param id - the server identifier to connect. */
  connect(id: McpServerId): Promise<void>

  /** @param id - the server identifier to disconnect. */
  disconnect(id: McpServerId): Promise<void>

  /**
   * @param id - the server identifier.
   * @returns the server's connection state.
   */
  getStatus(id: McpServerId): McpConnectionStatus

  /**
   * @param id - the server identifier.
   * @param after - the exclusive log cursor.
   * @returns the next log cursor and matching entries.
   */
  getLogs(id: McpServerId, after?: number): { next: number; entries: McpLogEntry[] }

  /**
   * @param id - the OAuth-configured server identifier.
   * @returns the authorization URL.
   */
  startOAuth(id: McpServerId): Promise<{ authorizeUrl: string }>

  /** @param id - the OAuth-configured server identifier. */
  clearOAuth(id: McpServerId): Promise<void>

  /**
   * @param id - the server identifier.
   * @param secrets - write-only secret values keyed by name.
   */
  setSecrets(id: McpServerId, secrets: Record<string, string>): Promise<void>
}

/**
 * Read the MCP seam from a context without requiring the provider to be mounted.
 * @param ctx - the context to read.
 * @returns the mounted runtime, or `undefined` when no provider published one.
 */
export function mcpRuntimeOf(ctx: Context): McpRuntime | undefined {
  return ctx.get('mcp')
}
