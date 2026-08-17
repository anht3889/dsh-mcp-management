/**
 * Durable MCP catalog operations and live connection supervision.
 * @module @deepseek-ai/dsh-mcp-mgmt-bundle/manager/runtime
 */

import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  McpConnectionStatus,
  McpLogEntry,
  McpRuntime,
  McpServerId,
  McpServerRecord,
} from '@deepseek-ai/dsh-mcp-mgmt-mcp'
import { OAUTH_REDIRECT_PATH, OAuthSecretKey, createOAuthController, discoverOAuthFromServerUrl, type DiscoveredOAuthConfig, type OAuthCallbackQuery, type OAuthController } from '@deepseek-ai/dsh-mcp-mgmt-oauth'
import { loadCatalog, saveCatalog, validateRecord } from './catalog.ts'
import { startConnection, type ConnectionHandle, type ConnectionHooks } from './connection.ts'
import { createLogBuffer, type LogBuffer } from './logs.ts'
import { createSecretStore, type CredentialsApi, type SecretStore } from './secrets.ts'
import type { ToolContext } from './tools.ts'

/** Filesystem locations used by the MCP manager. */
export interface McpManagerRuntimeConfig {
  /** Non-secret MCP server records. */
  catalogPath: string
  /** Fallback secret storage when no credential provider is mounted. */
  secretsPath: string
}

/** Optional test seams for the runtime's process-bound dependencies. */
export interface McpManagerRuntimeOptions extends McpManagerRuntimeConfig {
  /** Optional credential service, resolved from `ctx.get('credentials')` by the plugin. */
  credentials?: CredentialsApi
  /** Starts one connection generation. */
  startConnection?: (record: McpServerRecord, hooks: ConnectionHooks) => ConnectionHandle
  /** Resolves the browser-visible origin serving OAuth callbacks. */
  oauthRedirectOrigin?: () => string
}

/**
 * Concrete `ctx.mcp` provider that owns catalog persistence, secrets, OAuth,
 * and every live MCP connection.
 */
export class McpManagerRuntime implements McpRuntime {
  private readonly records = new Map<McpServerId, McpServerRecord>()
  private readonly statuses = new Map<McpServerId, McpConnectionStatus>()
  private readonly logs = new Map<McpServerId, LogBuffer>()
  private readonly connections = new Map<McpServerId, ConnectionHandle>()
  private readonly secrets: SecretStore
  private readonly oauth: OAuthController
  private readonly oauthRedirectOrigin: () => string
  private readonly catalogListeners = new Set<() => void>()
  private readonly start: (record: McpServerRecord, hooks: ConnectionHooks) => ConnectionHandle

  private constructor(
    private readonly ctx: Context,
    private readonly config: McpManagerRuntimeConfig,
    options: McpManagerRuntimeOptions,
  ) {
    this.secrets = createSecretStore({
      ...options.credentials === undefined ? {} : { credentials: options.credentials },
      filePath: config.secretsPath,
    })
    this.start = options.startConnection ?? startConnection
    this.oauthRedirectOrigin = options.oauthRedirectOrigin ?? (() => 'http://127.0.0.1')
    this.oauth = createOAuthController({
      getServer: id => this.records.get(id as McpServerId),
      secrets: this.secrets,
      redirectOrigin: this.oauthRedirectOrigin,
    })
  }

  /**
   * Loads the catalog then starts every enabled server.
   * @param ctx - the service-owning Cordis context.
   * @param options - persisted paths plus optional integration seams.
   * @returns the ready MCP runtime.
   */
  static async create(ctx: Context, options: McpManagerRuntimeOptions): Promise<McpManagerRuntime> {
    const runtime = new McpManagerRuntime(ctx, options, options)
    for (const record of await loadCatalog(options.catalogPath)) {
      runtime.records.set(record.id, record)
      runtime.statuses.set(record.id, { state: 'disconnected' })
      runtime.logs.set(record.id, createLogBuffer())
    }
    await Promise.all(runtime.list().filter(record => record.enabled).map(record => runtime.connect(record.id)))
    return runtime
  }

  /** @returns configured MCP server records. */
  list(): McpServerRecord[] {
    return [...this.records.values()]
  }

  /**
   * @param id - server identifier.
   * @returns the configured record, if present.
   */
  get(id: McpServerId): McpServerRecord | undefined {
    return this.records.get(id)
  }

  /**
   * Persists a record and stops any prior connection generation.
   * @param record - server configuration to create or replace.
   * @returns the persisted record.
   */
  async upsert(record: McpServerRecord): Promise<McpServerRecord> {
    const next = new Map(this.records)
    next.set(record.id, record)
    await this.save(next)
    await this.disconnect(record.id)
    this.records.set(record.id, record)
    this.statuses.set(record.id, { state: 'disconnected' })
    this.logs.set(record.id, this.logs.get(record.id) ?? createLogBuffer())
    this.notifyCatalogChanged()
    if (record.enabled) await this.connect(record.id)
    return record
  }

  /**
   * Stops the server, removes its record, and wipes its owned secrets.
   * @param id - server identifier.
   */
  async remove(id: McpServerId): Promise<void> {
    this.requireRecord(id)
    const next = new Map(this.records)
    next.delete(id)
    await this.save(next)
    await this.disconnect(id)
    this.records.delete(id)
    this.statuses.delete(id)
    this.logs.delete(id)
    this.notifyCatalogChanged()
    await this.secrets.wipeServer(id)
  }

  /**
   * Persists an enabled state and aligns the live connection.
   * @param id - server identifier.
   * @param enabled - whether the server should be active.
   */
  async setEnabled(id: McpServerId, enabled: boolean): Promise<void> {
    const record = this.requireRecord(id)
    const nextRecord: McpServerRecord = {
      ...record,
      enabled,
      updatedAt: new Date().toISOString(),
    }
    const next = new Map(this.records)
    next.set(id, nextRecord)
    await this.save(next)
    this.records.set(id, nextRecord)
    if (enabled) await this.connect(id)
    else await this.disconnect(id)
  }

  /**
   * Starts a fresh connection generation for a configured server.
   * @param id - server identifier.
   */
  async connect(id: McpServerId): Promise<void> {
    const record = this.requireRecord(id)
    await this.disconnect(id)
    this.connections.set(id, this.start(record, {
      ctx: this.ctx as unknown as ToolContext,
      resolveHeaders: async () => await this.resolveHeaders(record),
      onStatus: status => { this.statuses.set(id, status) },
      onLog: entry => { this.bufferFor(id).append(entry) },
    }))
  }

  /**
   * Stops the current generation and unregisters its tools.
   * @param id - server identifier.
   */
  async disconnect(id: McpServerId): Promise<void> {
    const connection = this.connections.get(id)
    this.connections.delete(id)
    if (connection !== undefined) await connection.stop()
    if (this.records.has(id)) this.statuses.set(id, { state: 'disconnected' })
  }

  /**
   * @param id - server identifier.
   * @returns current in-memory connection state.
   */
  getStatus(id: McpServerId): McpConnectionStatus {
    return this.statuses.get(id) ?? { state: 'disconnected' }
  }

  /**
   * @param id - server identifier.
   * @param after - exclusive log cursor.
   * @returns retained log entries after the cursor.
   */
  getLogs(id: McpServerId, after?: number): { next: number; entries: McpLogEntry[] } {
    return this.bufferFor(id).read(after)
  }

  /**
   * @param id - OAuth-configured server identifier.
   * @returns authorization URL.
   */
  async startOAuth(id: McpServerId): Promise<{ authorizeUrl: string }> {
    this.requireRecord(id)
    return await this.oauth.start(id)
  }

  /**
   * Clears OAuth tokens and stops the server until it is authorized again.
   * @param id - OAuth-configured server identifier.
   */
  async clearOAuth(id: McpServerId): Promise<void> {
    this.requireRecord(id)
    await this.oauth.clear(id)
    await this.disconnect(id)
  }

  /**
   * Stores write-only server secrets.
   * @param id - server identifier.
   * @param secrets - secret values keyed by their logical names.
   */
  async setSecrets(id: McpServerId, secrets: Record<string, string>): Promise<void> {
    this.requireRecord(id)
    await Promise.all(Object.entries(secrets).map(async ([key, value]) => {
      await this.secrets.set(id, key, value)
    }))
  }

  /**
   * Returns configured states for the secrets associated with a server.
   * @param id - server identifier.
   * @returns value-free configured states keyed by logical secret name.
   */
  async describeSecrets(id: McpServerId): Promise<Record<string, { configured: boolean }>> {
    const record = this.requireRecord(id)
    const keys = record.auth.kind === 'headers'
      ? record.auth.headerNames
      : record.auth.kind === 'oauth'
        ? Object.values(OAuthSecretKey)
        : []
    return Object.fromEntries(await Promise.all(keys.map(async key => [key, await this.secrets.describe(id, key)] as const)))
  }

  /**
   * Discovers OAuth endpoints from an MCP HTTP URL and registers a public
   * client when the authorization server supports Dynamic Client Registration.
   * @param serverUrl - streamable-http MCP server URL.
   * @returns fields for the Settings editor's OAuth form.
   */
  async discoverOAuth(serverUrl: string): Promise<DiscoveredOAuthConfig> {
    return await discoverOAuthFromServerUrl({
      serverUrl,
      redirectUri: `${this.oauthRedirectOrigin().replace(/\/$/, '')}${OAUTH_REDIRECT_PATH}`,
      clientName: 'DeepSeek Harness',
    })
  }

  /**
   * @returns the distinct loopback callback paths configured by OAuth servers,
   *   which the HTTP API must serve as routes of their own.
   */
  oauthCallbackPaths(): string[] {
    const paths = this.list()
      .map(record => record.auth)
      .filter(auth => auth.kind === 'oauth')
      .map(auth => auth.redirectPath)
    return [...new Set(paths)]
  }

  /**
   * Observes catalog membership so callback routes follow configuration.
   * @param listener - called after any record is added, replaced, or removed.
   * @returns a disposer that removes the listener.
   */
  onCatalogChanged(listener: () => void): () => void {
    this.catalogListeners.add(listener)
    return () => { this.catalogListeners.delete(listener) }
  }

  /**
   * Exchanges a browser OAuth callback and starts an enabled server.
   * @param query - authorization response fields from the redirect URI.
   * @returns the authorized server identifier.
   */
  async handleOAuthCallback(query: OAuthCallbackQuery): Promise<{ serverId: string }> {
    const result = await this.oauth.handleCallback(query)
    const id = result.serverId as McpServerId
    if (this.requireRecord(id).enabled) await this.connect(id)
    return result
  }

  /** Stops all live server generations. */
  async dispose(): Promise<void> {
    await Promise.all([...this.connections.keys()].map(async id => await this.disconnect(id)))
  }

  private async save(records: ReadonlyMap<McpServerId, McpServerRecord>): Promise<void> {
    const entries = [...records.values()]
    for (const record of entries) validateRecord(record, entries)
    await mkdir(dirname(this.config.catalogPath), { recursive: true })
    await saveCatalog(this.config.catalogPath, entries)
  }

  private notifyCatalogChanged(): void {
    for (const listener of this.catalogListeners) listener()
  }

  private bufferFor(id: McpServerId): LogBuffer {
    let buffer = this.logs.get(id)
    if (buffer === undefined) {
      buffer = createLogBuffer()
      this.logs.set(id, buffer)
    }
    return buffer
  }

  private requireRecord(id: McpServerId): McpServerRecord {
    const record = this.records.get(id)
    if (record === undefined) throw new Error(`MCP server ${id} was not found`)
    return record
  }

  private async resolveHeaders(record: McpServerRecord): Promise<Record<string, string>> {
    if (record.auth.kind === 'none') return {}
    if (record.auth.kind === 'oauth') {
      const authorization = await this.oauth.authorizeHeader(record.id)
      return authorization === undefined ? {} : { authorization }
    }

    const headers = await Promise.all(record.auth.headerNames.map(async name => {
      const value = await this.secrets.get(record.id, name)
      return value === undefined ? undefined : [name, value] as const
    }))
    return Object.fromEntries(headers.filter((header): header is readonly [string, string] => header !== undefined))
  }
}
