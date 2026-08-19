import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { describe, expect, it, vi } from 'vitest'
import { asMcpServerId } from '@anht3889/dsh-mcp-mgmt-mcp/brand'
import type { McpConnectionStatus, McpServerRecord, McpToolInfo } from '@anht3889/dsh-mcp-mgmt-mcp/types'
import { startConnection } from '../../src/manager/connection.ts'

describe('startConnection', () => {
  it('reconnects after a transport closes and reports the backoff states', async () => {
    const first = new MockTransport()
    const second = new MockTransport()
    const statuses: McpConnectionStatus[] = []
    const delays: number[] = []

    startConnection(record(), {
      ctx: emptyToolContext(),
      disabledTools: [],
      createTransport: transportFactory(first, second),
      delay: async (milliseconds) => { delays.push(milliseconds) },
      onStatus: (status) => { statuses.push(status) },
      onTools: vi.fn(),
      onLog: vi.fn(),
    })

    await first.connected
    await vi.waitFor(() => {
      expect(statuses.filter((status) => status.state === 'connected')).toHaveLength(1)
    })
    first.disconnect()
    await second.connected
    await vi.waitFor(() => {
      expect(statuses.filter((status) => status.state === 'connected')).toHaveLength(2)
    })

    expect(delays).toEqual([5])
    expect(statuses.map((status) => status.state)).toEqual([
      'connecting',
      'connected',
      'reconnecting',
      'connecting',
      'connected',
    ])
  })

  it('marks the connection failed and unregisters tools after its retry budget', async () => {
    const first = new MockTransport([{ name: 'status', inputSchema: { type: 'object' } }])
    const firstRegistration = vi.fn()
    const statuses: McpConnectionStatus[] = []

    startConnection(record({ reconnect: { enabled: true, initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 2 } }), {
      ctx: { tools: { register: vi.fn(() => firstRegistration) } },
      disabledTools: [],
      createTransport: transportFactory(first, new FailingTransport(), new FailingTransport()),
      delay: async () => {},
      onStatus: (status) => { statuses.push(status) },
      onTools: vi.fn(),
      onLog: vi.fn(),
    })

    await first.connected
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toMatchObject({ state: 'connected' })
    })
    first.disconnect()
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toMatchObject({ state: 'failed' })
    })

    expect(firstRegistration).toHaveBeenCalledOnce()
  })

  it('applies a new tool selection on the transport it is already connected to', async () => {
    const transport = new MockTransport([
      { name: 'read', inputSchema: { type: 'object' } },
      { name: 'write', inputSchema: { type: 'object' } },
    ])
    const registered: string[] = []
    const statuses: McpConnectionStatus[] = []
    const listings: McpToolInfo[][] = []

    const connection = startConnection(record(), {
      ctx: { tools: { register: (definition: { name: string }) => {
        registered.push(definition.name)
        return () => {}
      } } } as never,
      disabledTools: [],
      // A second transport would mean a reconnect, which for stdio restarts the
      // server process the operator is only reconfiguring.
      createTransport: transportFactory(transport),
      delay: async () => {},
      onStatus: (status) => { statuses.push(status) },
      onTools: (tools) => { listings.push(tools) },
      onLog: vi.fn(),
    })

    await transport.connected
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toMatchObject({ state: 'connected', toolCount: 2 })
    })

    await connection.applyToolSelection(['write'])

    expect(listings.at(-1)).toEqual([
      { name: 'read', description: '', enabled: true },
      { name: 'write', description: '', enabled: false },
    ])
    expect(registered.filter(name => name.startsWith('mcp__server__write'))).toHaveLength(1)
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', toolCount: 1 })
  })
})

function record(overrides: Partial<McpServerRecord> = {}): McpServerRecord {
  return {
    id: asMcpServerId('server'),
    serverName: 'server',
    enabled: true,
    transport: 'stdio',
    command: 'server',
    auth: { kind: 'none' },
    toolCallTimeoutMs: 1_000,
    reconnect: { enabled: true, initialDelayMs: 5, maxDelayMs: 20, maxAttempts: 2 },
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  }
}

function emptyToolContext(): { tools: { register: () => () => void } } {
  return { tools: { register: () => () => {} } }
}

function transportFactory(...transports: Transport[]): () => Transport {
  let index = 0
  return () => {
    const transport = transports[index]
    index += 1
    if (transport === undefined) throw new Error('Unexpected connection attempt')
    return transport
  }
}

class MockTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: never) => void
  readonly connected: Promise<void>
  #resolveConnected: () => void

  constructor(private readonly tools: Array<{ name: string; inputSchema: object }> = []) {
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
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      } as never)
      return
    }
    if (message.method === 'notifications/initialized') {
      return
    }
    if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: { tools: this.tools },
      } as never)
      this.#resolveConnected()
    }
  }

  async close(): Promise<void> {
    this.disconnect()
  }

  disconnect(): void {
    this.onclose?.()
  }
}

class FailingTransport implements Transport {
  async start(): Promise<void> {
    throw new Error('server unavailable')
  }

  async send(): Promise<void> {
    throw new Error('Cannot send from an unavailable transport')
  }

  async close(): Promise<void> {}
}
