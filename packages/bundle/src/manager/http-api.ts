/**
 * HTTP routes for the local MCP management UI.
 * @module @deepseek-ai/dsh-mcp-mgmt-bundle/manager/http-api
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { asMcpServerId, type McpConnectionStatus, type McpLogEntry, type McpServerId, type McpServerRecord } from '@deepseek-ai/dsh-mcp-mgmt-mcp'
import type { DiscoveredOAuthConfig, OAuthCallbackQuery } from '@deepseek-ai/dsh-mcp-mgmt-oauth'
import { validateRecord } from './catalog.ts'
import { renderOAuthCompletionPage } from './oauth-page.ts'

/** The web-server registration capability consumed by the management API. */
export interface McpManagementWebServer {
  /** The active HTTP listening port when the host exposes it. */
  readonly port?: number
  /**
   * Registers the management prefix or one exact OAuth callback path.
   * @param route - route ownership and handler.
   * @returns a disposer that unregisters the route.
   */
  register(route: {
    kind: 'prefix' | 'exact'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** MCP operations exposed through the management HTTP API. */
export interface McpManagementApi {
  /** @returns every managed MCP server record. */
  list(): McpServerRecord[]
  /** @param id - managed server identifier. @returns the matching record. */
  get(id: McpServerId): McpServerRecord | undefined
  /** @param record - record to persist. @returns the persisted record. */
  upsert(record: McpServerRecord): Promise<McpServerRecord>
  /** @param id - managed server identifier. */
  remove(id: McpServerId): Promise<void>
  /** @param id - managed server identifier. @param enabled - desired enabled state. */
  setEnabled(id: McpServerId, enabled: boolean): Promise<void>
  /** @param id - managed server identifier. */
  connect(id: McpServerId): Promise<void>
  /** @param id - managed server identifier. */
  disconnect(id: McpServerId): Promise<void>
  /** @param id - managed server identifier. @returns live connection state. */
  getStatus(id: McpServerId): McpConnectionStatus
  /** @param id - managed server identifier. @param after - exclusive log cursor. @returns retained logs. */
  getLogs(id: McpServerId, after?: number): { next: number; entries: McpLogEntry[] }
  /** @param id - managed server identifier. @returns the authorization URL. */
  startOAuth(id: McpServerId): Promise<{ authorizeUrl: string }>
  /** @param id - managed server identifier. */
  clearOAuth(id: McpServerId): Promise<void>
  /** @param id - managed server identifier. @param secrets - write-only values. */
  setSecrets(id: McpServerId, secrets: Record<string, string>): Promise<void>
  /** @param id - managed server identifier. @returns configured states without values. */
  describeSecrets(id: McpServerId): Promise<Record<string, { configured: boolean }>>
  /** @param query - OAuth redirect query. @returns the authorized server identifier. */
  handleOAuthCallback(query: OAuthCallbackQuery): Promise<{ serverId: string }>
  /** @param serverUrl - streamable-http MCP URL. @returns discovered OAuth fields. */
  discoverOAuth(serverUrl: string): Promise<DiscoveredOAuthConfig>
  /** @returns the loopback callback paths configured by OAuth servers. */
  oauthCallbackPaths(): string[]
  /** @param listener - called when records change. @returns a disposer. */
  onCatalogChanged(listener: () => void): () => void
}

/**
 * Registers the management prefix plus one exact route per configured OAuth
 * callback path, following the catalog while the API stays mounted.
 *
 * A server's callback path is fixed by its OAuth client's registration, so it
 * can sit anywhere on the origin; the paths already covered by the management
 * prefix need no route of their own.
 *
 * @param webServer - host web-server service.
 * @param mcp - managed MCP runtime.
 * @returns a disposer that unregisters every route this API owns.
 */
export function registerHttpApi(webServer: McpManagementWebServer, mcp: McpManagementApi): () => void {
  const disposePrefix = webServer.register({
    kind: 'prefix',
    path: '/mcp-management',
    handler: async (req, res) => {
      try {
        await route(req, res, mcp)
      } catch (error) {
        respondError(res, error)
      }
    },
  })

  const callbackRoutes = new Map<string, () => void>()
  const syncCallbackRoutes = (): void => {
    const wanted = new Set(mcp.oauthCallbackPaths().filter(path => !path.startsWith('/mcp-management')))
    for (const [path, dispose] of callbackRoutes) {
      if (wanted.has(path)) continue
      dispose()
      callbackRoutes.delete(path)
    }
    for (const path of wanted) {
      if (callbackRoutes.has(path)) continue
      callbackRoutes.set(path, webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          try {
            await respondCallback(req, res, mcp, queryFrom(new URL(req.url ?? '/', 'http://127.0.0.1')))
          } catch (error) {
            respondError(res, error)
          }
        },
      }))
    }
  }

  syncCallbackRoutes()
  const stopWatching = mcp.onCatalogChanged(syncCallbackRoutes)

  return () => {
    stopWatching()
    for (const dispose of callbackRoutes.values()) dispose()
    callbackRoutes.clear()
    disposePrefix()
  }
}

async function route(req: IncomingMessage, res: ServerResponse, mcp: McpManagementApi): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const parts = url.pathname.slice('/mcp-management'.length).split('/').filter(Boolean)

  if (req.method === 'GET' && parts.length === 1 && parts[0] === 'servers') {
    respond(res, 200, { servers: await Promise.all(mcp.list().map(async record => await serverView(mcp, record))) })
    return
  }
  if (req.method === 'GET' && parts.length === 2 && parts[0] === 'servers') {
    const record = requireServer(mcp, parts[1])
    respond(res, 200, { ...(await serverView(mcp, record)), logs: mcp.getLogs(record.id).entries })
    return
  }
  if (req.method === 'GET' && parts.length === 3 && parts[0] === 'servers' && parts[2] === 'logs') {
    const id = requireServer(mcp, parts[1]).id
    const after = url.searchParams.get('after')
    respond(res, 200, mcp.getLogs(id, after === null ? undefined : parseCursor(after)))
    return
  }
  if (req.method === 'GET' && parts.length === 2 && parts[0] === 'oauth' && parts[1] === 'callback') {
    await respondCallback(req, res, mcp, queryFrom(url))
    return
  }
  if (req.method === 'POST' && parts.length === 2 && parts[0] === 'oauth' && parts[1] === 'discover') {
    const body = requireDiscoverBody(await readJson(req))
    respond(res, 200, await mcp.discoverOAuth(body.url))
    return
  }
  if (req.method === 'PUT' && parts.length === 2 && parts[0] === 'servers') {
    const id = asMcpServerId(parts[1])
    const record = requireRecord(await readJson(req))
    const candidate = { ...record, id }
    validateRecord(candidate, mcp.list())
    const persisted = await mcp.upsert(candidate)
    respond(res, 200, await serverView(mcp, persisted))
    return
  }

  const id = parts.length >= 2 && parts[0] === 'servers' ? requireServer(mcp, parts[1]).id : undefined
  if (id === undefined) {
    respond(res, 404, { error: 'not found' })
    return
  }
  if (req.method === 'DELETE' && parts.length === 2) {
    await mcp.remove(id)
    respond(res, 204)
    return
  }
  if (req.method === 'PUT' && parts.length === 3 && parts[2] === 'secrets') {
    const secrets = requireSecrets(await readJson(req))
    await mcp.setSecrets(id, secrets)
    respond(res, 200, { secrets: await mcp.describeSecrets(id) })
    return
  }
  if (req.method === 'POST' && parts.length === 3) {
    if (parts[2] === 'enable') await mcp.setEnabled(id, true)
    else if (parts[2] === 'disable') await mcp.setEnabled(id, false)
    else if (parts[2] === 'connect') await mcp.connect(id)
    else if (parts[2] === 'disconnect') await mcp.disconnect(id)
    else {
      respond(res, 404, { error: 'not found' })
      return
    }
    respond(res, 200, await serverView(mcp, requireServer(mcp, id)))
    return
  }
  if (req.method === 'POST' && parts.length === 4 && parts[2] === 'oauth') {
    if (parts[3] === 'start') respond(res, 200, await mcp.startOAuth(id))
    else if (parts[3] === 'clear') {
      await mcp.clearOAuth(id)
      respond(res, 204)
    } else respond(res, 404, { error: 'not found' })
    return
  }
  respond(res, 404, { error: 'not found' })
}

/**
 * Complete an authorization and answer in the caller's medium: a browser
 * navigation gets the login window's completion page, any other client gets
 * JSON. An exchange failure reaches the browser as a page, never a bare error
 * body, because the operator is looking at the login window.
 */
async function respondCallback(
  req: IncomingMessage,
  res: ServerResponse,
  mcp: McpManagementApi,
  query: OAuthCallbackQuery,
): Promise<void> {
  const wantsHtml = req.headers.accept?.includes('text/html') === true
  if (!wantsHtml) {
    respond(res, 200, await mcp.handleOAuthCallback(query))
    return
  }
  try {
    const { serverId } = await mcp.handleOAuthCallback(query)
    respondHtml(res, 200, renderOAuthCompletionPage({ ok: true, serverId }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'authorization failed'
    respondHtml(res, 400, renderOAuthCompletionPage({ ok: false, error: message }))
  }
}

async function serverView(mcp: McpManagementApi, record: McpServerRecord) {
  return { record, status: mcp.getStatus(record.id), secrets: await mcp.describeSecrets(record.id) }
}

function requireServer(mcp: McpManagementApi, rawId: string): McpServerRecord {
  const id = asMcpServerId(rawId)
  const record = mcp.get(id)
  if (record === undefined) throw new HttpError(404, `MCP server ${rawId} was not found`)
  return record
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'request body must be valid JSON')
  }
}

function requireRecord(value: unknown): McpServerRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'request body must be an MCP server record')
  }
  return value as McpServerRecord
}

function requireSecrets(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.values(value).some(secret => typeof secret !== 'string')) {
    throw new HttpError(400, 'request body must contain string secret values')
  }
  return value as Record<string, string>
}

function requireDiscoverBody(value: unknown): { url: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !('url' in value) || typeof value.url !== 'string' || value.url.trim() === '') {
    throw new HttpError(400, 'request body must include a non-empty url')
  }
  return { url: value.url }
}

function queryFrom(url: URL): OAuthCallbackQuery {
  return Object.fromEntries(['code', 'state', 'error', 'error_description']
    .flatMap(key => {
      const value = url.searchParams.get(key)
      return value === null ? [] : [[key, value]]
    })) as OAuthCallbackQuery
}

function parseCursor(value: string): number {
  const cursor = Number(value)
  if (!Number.isInteger(cursor) || cursor < 0) throw new HttpError(400, 'after must be a non-negative integer')
  return cursor
}

function respond(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status)
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function respondHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
}

function respondError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    respond(res, error.status, { error: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'request failed'
  const status = message.includes('was not found') ? 404 : 400
  respond(res, status, { error: message })
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}
