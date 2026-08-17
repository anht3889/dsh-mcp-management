/** A non-secret MCP server record returned by the management API. */
export interface McpServerRecord {
  id: string
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

/** Supported authentication settings. */
export type McpAuthConfig =
  | { kind: 'none' }
  | { kind: 'headers'; headerNames: string[] }
  | { kind: 'oauth'; clientId: string; authorizeUrl: string; tokenUrl: string; scopes: string[]; redirectPath: string }

/** Live connection state reported for a managed server. */
export type McpConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting'; attempt: number }
  | { state: 'connected'; toolCount: number; connectedAt: string }
  | { state: 'reconnecting'; attempt: number; nextDelayMs: number }
  | { state: 'failed'; error: string; at: string }

/** Retained lifecycle entry shown in the logs panel. */
export interface McpLogEntry {
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
}

/** A server plus live status and non-secret credential state. */
export interface McpServerView {
  record: McpServerRecord
  status: McpConnectionStatus
  secrets: Record<string, { configured: boolean }>
}

/** HTTP client for the MCP management endpoints. */
export class McpManagementApi {
  /**
   * @param baseUrl - origin or relative prefix serving management routes.
   */
  constructor(private readonly baseUrl = '/mcp-management') {}

  /** @returns all managed server views. */
  list(): Promise<{ servers: McpServerView[] }> {
    return this.request('/servers')
  }

  /**
   * @param id - server identifier.
   * @returns the server view and retained logs.
   */
  get(id: string): Promise<McpServerView & { logs: McpLogEntry[] }> {
    return this.request(`/servers/${encodeURIComponent(id)}`)
  }

  /**
   * @param record - configuration to create or update.
   * @returns the persisted server view.
   */
  upsert(record: McpServerRecord): Promise<McpServerView> {
    return this.request(`/servers/${encodeURIComponent(record.id)}`, { method: 'PUT', body: record })
  }

  /** @param id - server identifier. */
  async remove(id: string): Promise<void> {
    await this.request(`/servers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  /**
   * @param id - server identifier.
   * @param enabled - target enabled state.
   * @returns the updated server view.
   */
  setEnabled(id: string, enabled: boolean): Promise<McpServerView> {
    return this.request(`/servers/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' })
  }

  /**
   * @param id - server identifier.
   * @param after - exclusive retained-log cursor.
   * @returns new entries and the next cursor.
   */
  logs(id: string, after?: number): Promise<{ next: number; entries: McpLogEntry[] }> {
    const query = after === undefined ? '' : `?after=${after}`
    return this.request(`/servers/${encodeURIComponent(id)}/logs${query}`)
  }

  /**
   * @param id - OAuth-enabled server identifier.
   * @returns the authorization URL to open.
   */
  startOAuth(id: string): Promise<{ authorizeUrl: string }> {
    return this.request(`/servers/${encodeURIComponent(id)}/oauth/start`, { method: 'POST' })
  }

  /**
   * Discovers OAuth endpoints (and optionally registers a client) from an MCP URL.
   * @param url - streamable-http MCP server URL.
   * @returns fields for the OAuth form.
   */
  discoverOAuth(url: string): Promise<{
    clientId: string
    authorizeUrl: string
    tokenUrl: string
    scopes: string[]
    clientSecret?: string
    registered: boolean
  }> {
    return this.request('/oauth/discover', { method: 'POST', body: { url } })
  }

  /** @param id - OAuth-enabled server identifier. */
  async clearOAuth(id: string): Promise<void> {
    await this.request(`/servers/${encodeURIComponent(id)}/oauth/clear`, { method: 'POST' })
  }

  /**
   * @param id - server identifier.
   * @param secrets - write-only values keyed by secret name.
   * @returns configured-state summaries.
   */
  setSecrets(id: string, secrets: Record<string, string>): Promise<{ secrets: Record<string, { configured: boolean }> }> {
    return this.request(`/servers/${encodeURIComponent(id)}/secrets`, { method: 'PUT', body: secrets })
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...(init.method === undefined ? {} : { method: init.method }),
      ...(init.body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(init.body),
          }),
    })
    if (!response.ok) throw new Error(`MCP management request failed (${response.status})`)
    if (response.status === 204) return undefined as T
    return await response.json() as T
  }
}
