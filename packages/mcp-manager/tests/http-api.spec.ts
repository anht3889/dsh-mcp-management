import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { asMcpServerId } from '@deepseek-ai/dsh-mcp-mgmt-mcp/brand'
import type { McpServerRecord } from '@deepseek-ai/dsh-mcp-mgmt-mcp/types'
import { registerHttpApi, type McpManagementApi } from '../src/http-api.ts'

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
        secrets: { authorization: { configured: true } },
      }],
    })
    expect(JSON.stringify(response.body)).not.toContain('Bearer secret')
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

    expect(response).toEqual({ status: 404, body: { error: 'not found' } })
  })
})

function fakeApi(): McpManagementApi & { secretValues: Record<string, string>; upserted?: McpServerRecord } {
  const server = record()
  return {
    secretValues: {},
    list: () => [server],
    get: id => id === server.id ? server : undefined,
    async upsert(value) { this.upserted = value; return value },
    async remove() {},
    async setEnabled() {},
    async connect() {},
    async disconnect() {},
    getStatus: () => ({ state: 'disconnected' }),
    getLogs: () => ({ next: 0, entries: [] }),
    async startOAuth() { return { authorizeUrl: 'https://idp.example/authorize' } },
    async clearOAuth() {},
    async setSecrets(_id, secrets) { this.secretValues = secrets },
    async describeSecrets() {
      return Object.fromEntries(Object.keys(this.secretValues).map(key => [key, { configured: true }]))
    },
    async handleOAuthCallback() { return { serverId: 'server' } },
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

async function start(api: McpManagementApi, servers: ReturnType<typeof createServer>[]) {
  const server = createServer()
  const dispose = registerHttpApi({
    register: route => {
      server.on('request', route.handler)
      return () => server.removeListener('request', route.handler)
    },
  }, api)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  return async (pathname: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
}
