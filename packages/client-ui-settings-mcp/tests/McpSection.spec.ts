// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { McpManagementApi } from '../src/client/api.ts'
import { McpSection, newServer } from '../src/client/McpSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

test('shows a server name returned by the management API', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    servers: [{
      record: {
        id: 'filesystem',
        serverName: 'Filesystem',
        enabled: true,
        transport: 'stdio',
        auth: { kind: 'none' },
        toolCallTimeoutMs: 30_000,
        reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 1_000, maxAttempts: 3 },
        createdAt: '2026-08-17T00:00:00.000Z',
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
      status: { state: 'disconnected' },
      secrets: {},
    }],
  }), { status: 200 })))
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(createElement(McpSection, { api: new McpManagementApi(), t: (key) => zh[key] }))
  })

  expect(container.textContent).toContain('Filesystem')
  expect(fetch).toHaveBeenCalledWith('/mcp-management/servers', expect.any(Object))
  root.unmount()
})

test('creates a UUID for a new server', () => {
  expect(newServer().id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})
