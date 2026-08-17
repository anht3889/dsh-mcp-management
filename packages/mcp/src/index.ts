/**
 * MCP management capability seam exposed as `ctx.mcp`.
 * @module @deepseek-ai/dsh-mcp-mgmt-mcp
 */

import { Service, type Context } from '@deepseek-ai/cordis'
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
 * Service definition for MCP server management.
 *
 * This stub makes the capability unavailable until a manager provider replaces
 * it with an implementation.
 */
export class McpRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'mcp')
  }

  /** @returns the configured MCP server records. */
  list(): McpServerRecord[] {
    return this.notProvided()
  }

  /**
   * @param id - the server identifier.
   * @returns the matching record, if present.
   */
  get(id: McpServerId): McpServerRecord | undefined {
    void id
    return this.notProvided()
  }

  /**
   * @param record - the record to create or replace.
   * @returns the stored record.
   */
  upsert(record: McpServerRecord): Promise<McpServerRecord> {
    void record
    return this.notProvided()
  }

  /** @param id - the server identifier to remove. */
  remove(id: McpServerId): Promise<void> {
    void id
    return this.notProvided()
  }

  /**
   * @param id - the server identifier.
   * @param enabled - whether the server is enabled.
   */
  setEnabled(id: McpServerId, enabled: boolean): Promise<void> {
    void id
    void enabled
    return this.notProvided()
  }

  /** @param id - the server identifier to connect. */
  connect(id: McpServerId): Promise<void> {
    void id
    return this.notProvided()
  }

  /** @param id - the server identifier to disconnect. */
  disconnect(id: McpServerId): Promise<void> {
    void id
    return this.notProvided()
  }

  /**
   * @param id - the server identifier.
   * @returns the server's connection state.
   */
  getStatus(id: McpServerId): McpConnectionStatus {
    void id
    return this.notProvided()
  }

  /**
   * @param id - the server identifier.
   * @param after - the exclusive log cursor.
   * @returns the next log cursor and matching entries.
   */
  getLogs(id: McpServerId, after?: number): { next: number; entries: McpLogEntry[] } {
    void id
    void after
    return this.notProvided()
  }

  /**
   * @param id - the OAuth-configured server identifier.
   * @returns the authorization URL.
   */
  startOAuth(id: McpServerId): Promise<{ authorizeUrl: string }> {
    void id
    return this.notProvided()
  }

  /** @param id - the OAuth-configured server identifier. */
  clearOAuth(id: McpServerId): Promise<void> {
    void id
    return this.notProvided()
  }

  /**
   * @param id - the server identifier.
   * @param secrets - write-only secret values keyed by name.
   */
  setSecrets(id: McpServerId, secrets: Record<string, string>): Promise<void> {
    void id
    void secrets
    return this.notProvided()
  }

  private notProvided(): never {
    throw new Error('MCP_NOT_PROVIDED')
  }
}

export default McpRuntime
