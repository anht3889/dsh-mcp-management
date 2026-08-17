import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { asMcpServerId } from '@anht3889/dsh-mcp-mgmt-mcp/brand'
import type { McpServerRecord } from '@anht3889/dsh-mcp-mgmt-mcp/types'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { startConnection } from '../../src/manager/connection.ts'
import { McpManagerRuntime } from '../../src/manager/runtime.ts'

describe('McpManagerRuntime', () => {
  it('registers a connected server tools and removes them on disconnect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-manager-runtime-'))
    const register = vi.fn(() => dispose)
    const dispose = vi.fn()
    const ctx = new Context()
    ctx.provide('tools', { register })
    const transport = new ToolTransport()
    const runtime = await McpManagerRuntime.create(ctx, {
      catalogPath: join(root, 'servers.json'),
      secretsPath: join(root, 'secrets.yaml'),
      startConnection: (record, hooks) => startConnection(record, {
        ...hooks,
        createTransport: () => transport,
      }),
    })

    await runtime.upsert(record())
    await runtime.connect(asMcpServerId('server'))
    await transport.connected
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce())

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      name: 'mcp__example__status',
    }))
    expect(runtime.getStatus(asMcpServerId('server'))).toMatchObject({
      state: 'connected',
      toolCount: 1,
    })

    await runtime.disconnect(asMcpServerId('server'))

    expect(dispose).toHaveBeenCalledOnce()
    expect(runtime.getStatus(asMcpServerId('server'))).toEqual({ state: 'disconnected' })
  })

  it('connects an enabled server after upserting it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-manager-runtime-'))
    const startConnection = vi.fn(() => ({ stop: vi.fn(async () => {}) }))
    const ctx = new Context()
    ctx.provide('tools', { register: vi.fn(() => vi.fn()) })
    const runtime = await McpManagerRuntime.create(ctx, {
      catalogPath: join(root, 'servers.json'),
      secretsPath: join(root, 'secrets.yaml'),
      startConnection,
    })

    await runtime.upsert({ ...record(), enabled: true })

    expect(startConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: asMcpServerId('server'), enabled: true }),
      expect.any(Object),
    )
  })
})

function record(): McpServerRecord {
  return {
    id: asMcpServerId('server'),
    serverName: 'example',
    enabled: false,
    transport: 'stdio',
    command: 'example-mcp',
    auth: { kind: 'none' },
    toolCallTimeoutMs: 1_000,
    reconnect: { enabled: false, initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 },
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  }
}

class ToolTransport implements Transport {
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
          serverInfo: { name: 'example', version: '1.0.0' },
        },
      } as never)
      return
    }
    if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [{ name: 'status', description: 'Reports status', inputSchema: { type: 'object' } }],
        },
      } as never)
      this.#resolveConnected()
    }
  }

  async close(): Promise<void> {
    this.onclose?.()
  }
}
