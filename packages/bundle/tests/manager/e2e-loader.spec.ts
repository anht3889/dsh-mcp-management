import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

const connection = vi.hoisted(() => ({
  createTransport: undefined as undefined | (() => Transport),
}))

vi.mock('../../src/manager/connection.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/manager/connection.ts')>()
  return {
    ...original,
    startConnection(record, hooks) {
      return original.startConnection(record, {
        ...hooks,
        createTransport: connection.createTransport,
      })
    },
  }
})

import * as manager from '../../src/manager/index.ts'

describe('MCP management host smoke', () => {
  const servers: Server[] = []

  afterEach(async () => {
    connection.createTransport = undefined
    await Promise.all(servers.splice(0).map(close))
  })

  it('serves the catalog and connects an HTTP-upserted server', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-manager-smoke-'))
    const catalogPath = join(root, 'mcp', 'servers.json')
    const registered = new Map<string, unknown>()
    const tools = {
      register: vi.fn((definition: { name: string }) => {
        registered.set(definition.name, definition)
        return () => { registered.delete(definition.name) }
      }),
    }
    const transport = new FixtureTransport()
    connection.createTransport = () => transport
    const webServer = await startWebServer(servers)
    const ctx = new Context()
    const disposeTools = ctx.provide('tools', tools)
    const disposeWebServer = ctx.provide('webServer', webServer)
    const managerFiber = await ctx.plugin(manager, {
      catalogPath,
      secretsPath: join(root, 'mcp', 'secrets.yaml'),
    })

    try {
      const empty = await request(webServer, '/mcp-management/servers')
      expect(empty.body).toEqual({ servers: [] })

      const record = {
        id: 'ignored-by-path',
        serverName: 'fixture',
        enabled: false,
        transport: 'stdio',
        command: 'fixture-mcp',
        auth: { kind: 'none' },
        toolCallTimeoutMs: 1_000,
        reconnect: { enabled: false, initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 },
        createdAt: '2026-08-17T00:00:00.000Z',
        updatedAt: '2026-08-17T00:00:00.000Z',
      }
      const upserted = await request(webServer, '/mcp-management/servers/fixture', 'PUT', record)
      expect(upserted.body).toMatchObject({
        record: { ...record, id: 'fixture' },
        status: { state: 'disconnected' },
      })
      expect(JSON.parse(await readFile(catalogPath, 'utf8'))).toEqual([{ ...record, id: 'fixture' }])

      await request(webServer, '/mcp-management/servers/fixture/connect', 'POST')
      await transport.connected
      await vi.waitFor(() => {
        expect(registered.size).toBe(1)
      })

      const connected = await request(webServer, '/mcp-management/servers/fixture')
      expect(connected.body).toMatchObject({
        record: { id: 'fixture', serverName: 'fixture' },
        status: { state: 'connected', toolCount: 1 },
      })
      expect([...registered.keys()]).toEqual(['mcp__fixture__status'])
    } finally {
      await managerFiber.dispose()
      await disposeWebServer()
      await disposeTools()
    }
  })
})

async function startWebServer(servers: Server[]): Promise<{
  origin: string
  register(route: {
    kind: 'prefix'
    path: '/mcp-management'
    handler: Parameters<typeof createServer>[0]
  }): () => void
}> {
  let handler: Parameters<typeof createServer>[0] | undefined
  const server = createServer((request, response) => {
    if (handler === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    handler(request, response)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${address.port}`,
    register(route) {
      expect(route).toMatchObject({ kind: 'prefix', path: '/mcp-management' })
      handler = route.handler
      return () => { handler = undefined }
    },
  }
}

async function request(
  webServer: { origin: string },
  pathname: string,
  method = 'GET',
  body?: unknown,
): Promise<{ body: unknown }> {
  const response = await fetch(`${webServer.origin}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { body: await response.json() }
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error))
  })
}

class FixtureTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: never) => void
  readonly connected: Promise<void>
  #resolveConnected: () => void

  constructor() {
    const connected = Promise.withResolvers<void>()
    this.connected = connected.promise
    this.#resolveConnected = connected.resolve
  }

  async start(): Promise<void> {}

  async send(message: { id?: number; method?: string }): Promise<void> {
    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'fixture', version: '1.0.0' },
        },
      } as never)
      return
    }
    if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [{ name: 'status', description: 'Reports fixture status', inputSchema: { type: 'object' } }],
        },
      } as never)
      this.#resolveConnected()
    }
  }

  async close(): Promise<void> {
    this.onclose?.()
  }
}
