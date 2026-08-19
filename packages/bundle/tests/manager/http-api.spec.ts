import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { asMcpServerId } from '@anht3889/dsh-mcp-mgmt-mcp/brand'
import type { McpServerRecord } from '@anht3889/dsh-mcp-mgmt-mcp/types'
import { registerHttpApi, type McpManagementApi } from '../../src/manager/http-api.ts'

describe('registerHttpApi', () => {
  const servers: ReturnType<typeof createServer>[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async server => await new Promise<void>((resolve, reject) => {
      server.close(error => error === undefined ? resolve() : reject(error))
    })))
  })

  it('lists managed servers without secret values', async () => {
    const api = fakeApi()
    api.setSecrets = async (_id, secrets) => { api.secretValues = secrets }
    const request = await start(api, servers)

    const secrets = await request('/mcp-management/servers/server/secrets', 'PUT', { authorization: 'Bearer secret' })
    const response = await request('/mcp-management/servers')

    expect(secrets.body).toEqual({ secrets: { authorization: { configured: true } } })
    expect(response.body).toEqual({
      servers: [{
        record: record(),
        status: { state: 'disconnected' },
        tools: [{ name: 'status', description: 'Reports status', enabled: true }],
        secrets: { authorization: { configured: true } },
      }],
    })
    expect(JSON.stringify(response.body)).not.toContain('Bearer secret')
  })

  it('persists a tool selection the connected server has listed', async () => {
    const api = fakeApi()
    const request = await start(api, servers)

    const response = await request('/mcp-management/servers/server/tools/status/disable', 'POST')

    expect(response.status).toBe(200)
    expect(api.toolSelection).toEqual([{ toolName: 'status', enabled: false }])
  })

  it('refuses a tool the server has not listed rather than storing the name', async () => {
    const api = fakeApi()
    const request = await start(api, servers)

    const response = await request('/mcp-management/servers/server/tools/typo/disable', 'POST')

    expect(response.status).toBe(404)
    expect(api.toolSelection).toEqual([])
  })

  it('upserts the record identified by the request path', async () => {
    const api = fakeApi()
    const request = await start(api, servers)
    const body = { ...record(), id: 'other-server', serverName: 'edited' }

    const response = await request('/mcp-management/servers/server', 'PUT', body)

    expect(response.status).toBe(200)
    expect(api.upserted).toMatchObject({ id: asMcpServerId('server'), serverName: 'edited' })
  })

  it('returns a 4xx response for an invalid upsert record', async () => {
    const api = fakeApi()
    const request = await start(api, servers)

    const response = await request('/mcp-management/servers/server', 'PUT', { serverName: '' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(api.upserted).toBeUndefined()
  })

  it('returns not found for unrecognized routes', async () => {
    const request = await start(fakeApi(), servers)

    const response = await request('/mcp-management/unknown')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('answers a browser OAuth redirect with the login completion page', async () => {
    const request = await start(fakeApi(), servers)

    const response = await request('/mcp-management/oauth/callback?code=granted&state=pending', 'GET', undefined, 'text/html')

    expect(response.status).toBe(200)
    expect(response.contentType).toContain('text/html')
    expect(response.text).toContain('Authorization complete')
    expect(response.text).toContain('dsh-mcp-management/oauth')
  })

  it('reports a failed exchange as a page for a browser and as JSON otherwise', async () => {
    const api = fakeApi()
    api.handleOAuthCallback = async () => { throw new Error('state does not match a pending authorization') }
    const request = await start(api, servers)

    const page = await request('/mcp-management/oauth/callback?code=granted&state=stale', 'GET', undefined, 'text/html')
    const json = await request('/mcp-management/oauth/callback?code=granted&state=stale')

    expect(page.status).toBe(400)
    expect(page.text).toContain('Authorization failed')
    expect(page.text).toContain('state does not match a pending authorization')
    expect(json.contentType).toContain('json')
    expect(json.body).toEqual({ error: 'state does not match a pending authorization' })
  })

  it('discovers OAuth endpoints from an MCP server URL', async () => {
    const request = await start(fakeApi(), servers)

    const response = await request('/mcp-management/oauth/discover', 'POST', { url: 'https://mcp.example/sse' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      clientId: 'discovered-client',
      authorizeUrl: 'https://idp.example/authorize',
      tokenUrl: 'https://idp.example/token',
      scopes: ['mcp'],
      registered: false,
    })
  })

  it('answers a redirect on the callback path a server configures, and follows the catalog', async () => {
    const paths = ['/callback']
    const api = fakeApi(paths)
    const request = await start(api, servers)

    const configured = await request('/callback?code=granted&state=pending')
    expect(configured.status).toBe(200)
    expect(configured.body).toEqual({ serverId: 'server' })

    paths.length = 0
    api.catalogChanged()

    expect((await request('/callback?code=granted&state=pending')).status).toBe(404)
  })

  it('leaves a callback path under the management prefix to the prefix route', async () => {
    const api = fakeApi(['/mcp-management/oauth/callback'])
    const registered: string[] = []
    const request = await start(api, servers, registered)

    expect(registered).toEqual(['/mcp-management'])
    expect((await request('/mcp-management/oauth/callback?code=granted&state=pending')).body)
      .toEqual({ serverId: 'server' })
  })

  it('rejects discovery without a url', async () => {
    const request = await start(fakeApi(), servers)

    const response = await request('/mcp-management/oauth/discover', 'POST', {})

    expect(response.status).toBe(400)
  })
})

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

function fakeApi(callbackPaths: string[] = []): McpManagementApi & {
  secretValues: Record<string, string>
  upserted?: McpServerRecord
  toolSelection: { toolName: string; enabled: boolean }[]
  catalogChanged: () => void
} {
  const server = record()
  const listeners = new Set<() => void>()
  return {
    secretValues: {},
    toolSelection: [],
    catalogChanged: () => { for (const listener of listeners) listener() },
    oauthCallbackPaths: () => callbackPaths,
    onCatalogChanged(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    list: () => [server],
    get: id => id === server.id ? server : undefined,
    async upsert(value) { this.upserted = value; return value },
    async remove() {},
    async setEnabled() {},
    async connect() {},
    async disconnect() {},
    getStatus: () => ({ state: 'disconnected' }),
    getLogs: () => ({ next: 0, entries: [] }),
    getTools: () => [{ name: 'status', description: 'Reports status', enabled: true }],
    async setToolEnabled(_id, toolName, enabled) { this.toolSelection.push({ toolName, enabled }) },
    async startOAuth() { return { authorizeUrl: 'https://idp.example/authorize' } },
    async clearOAuth() {},
    async setSecrets(_id, secrets) { this.secretValues = secrets },
    async describeSecrets() {
      return Object.fromEntries(Object.keys(this.secretValues).map(key => [key, { configured: true }]))
    },
    async handleOAuthCallback() { return { serverId: 'server' } },
    async discoverOAuth(serverUrl) {
      return {
        clientId: 'discovered-client',
        authorizeUrl: 'https://idp.example/authorize',
        tokenUrl: 'https://idp.example/token',
        scopes: ['mcp'],
        registered: false,
        ...(serverUrl.includes('register')
          ? { clientSecret: 'discovered-secret', registered: true, clientId: 'registered-client' }
          : {}),
      }
    },
  }
}

function record(): McpServerRecord {
  return {
    id: asMcpServerId('server'),
    serverName: 'example',
    enabled: false,
    transport: 'stdio',
    command: 'example-mcp',
    auth: { kind: 'headers', headerNames: ['authorization'] },
    toolCallTimeoutMs: 1_000,
    reconnect: { enabled: false, initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 },
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  }
}

async function start(
  api: McpManagementApi,
  servers: ReturnType<typeof createServer>[],
  registeredPaths: string[] = [],
) {
  const server = createServer()
  const routes: { kind: 'prefix' | 'exact'; path: string; handler: RouteHandler }[] = []
  server.on('request', (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1')
    const match = routes.find(route => route.kind === 'exact'
      ? route.path === pathname
      : pathname === route.path || pathname.startsWith(`${route.path}/`))
    if (match === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    void match.handler(req, res)
  })
  registerHttpApi({
    register: route => {
      routes.push(route)
      registeredPaths.push(route.path)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
  }, api)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  return async (pathname: string, method = 'GET', body?: unknown, accept?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, {
      method,
      headers: {
        ...body === undefined ? {} : { 'content-type': 'application/json' },
        ...accept === undefined ? {} : { accept },
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    return {
      status: response.status,
      contentType,
      text,
      body: contentType.includes('json') ? JSON.parse(text) as unknown : undefined,
    }
  }
}
