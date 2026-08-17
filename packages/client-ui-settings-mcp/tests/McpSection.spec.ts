// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { McpManagementApi } from '../src/client/api.ts'
import { McpSection } from '../src/client/McpSection.tsx'

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
    root.render(createElement(McpSection, { api: new McpManagementApi() }))
  })

  expect(container.textContent).toContain('Filesystem')
  expect(fetch).toHaveBeenCalledWith('/mcp-management/servers', expect.any(Object))
  root.unmount()
})
