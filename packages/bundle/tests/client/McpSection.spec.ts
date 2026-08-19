// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { McpManagementApi } from '../../src/client/api.ts'
import { McpSection, newServer } from '../../src/client/McpSection.tsx'
import { zh } from '../../src/client/locales.ts'

// React 18 requires this flag before act() outside a framework test runner.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Roots rendered by the current test. The dialog listens for Escape on the
 * document, so a root left mounted would answer a later test's key press and
 * then fail to detach its portal from the emptied body.
 */
const roots: { unmount: () => void }[] = []

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
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

test('sends the login window to the provider when Authorize is clicked', async () => {
  stubOAuthServer()
  const loginWindow = { location: { href: '' }, closed: false, close: vi.fn() }
  const open = vi.fn(() => loginWindow)
  vi.stubGlobal('open', open)
  const container = await renderSection()

  await act(async () => {
    authorizeButton(container).click()
  })

  expect(open).toHaveBeenCalledWith('', 'dsh-mcp-oauth-login', expect.stringContaining('popup'))
  expect(loginWindow.location.href).toBe('https://idp.example/authorize?state=pending')
  expect(container.textContent).toContain(zh.authorizeWaiting)
})

test('offers the authorization link when the browser blocks the login window', async () => {
  stubOAuthServer()
  vi.stubGlobal('open', vi.fn(() => null))
  const container = await renderSection()

  await act(async () => {
    authorizeButton(container).click()
  })

  const link = container.querySelector('a')
  expect(container.textContent).toContain(zh.authorizeBlocked)
  expect(link?.getAttribute('href')).toBe('https://idp.example/authorize?state=pending')
})

test('reports a failed authorization posted by the login window', async () => {
  stubOAuthServer()
  vi.stubGlobal('open', vi.fn(() => ({ location: { href: '' }, closed: false, close: vi.fn() })))
  const container = await renderSection()
  await act(async () => {
    authorizeButton(container).click()
  })

  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { source: 'dsh-mcp-management/oauth', completion: { ok: false, error: 'code was rejected' } },
    }))
  })

  expect(container.textContent).toContain(zh.authorizeFailed)
  expect(container.textContent).toContain('code was rejected')
})

test('offers Discover when OAuth is selected and requires a URL first', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ servers: [] }), { status: 200 })))
  const container = await renderSection()

  await act(async () => {
    clickButton(container, zh.add)
  })
  const form = editorForm()
  await act(async () => {
    const transport = form.querySelector('select[name="transport"]') as HTMLSelectElement
    transport.value = 'streamable-http'
    transport.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => {
    const auth = [...form.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'oauth'))
    if (auth === undefined) throw new Error('auth select missing')
    auth.value = 'oauth'
    auth.dispatchEvent(new Event('change', { bubbles: true }))
  })

  expect(form.textContent).toContain(zh.discoverOAuthHint)
  // The redirect URI must be visible verbatim: an identity provider rejects an
  // authorization whose redirect URI is absent from the client registration.
  expect(form.textContent).toContain(`${location.origin}/callback`)
  await act(async () => {
    clickButton(form, zh.discoverOAuth)
  })
  expect(form.textContent).toContain(zh.discoverOAuthNeedUrl)
})

test('opens the editor in a dialog instead of below the server list', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ servers: [] }), { status: 200 })))
  const container = await renderSection()

  await act(async () => {
    clickButton(container, zh.add)
  })

  const dialog = document.body.querySelector('[role="dialog"]')
  expect(dialog?.getAttribute('aria-modal')).toBe('true')
  expect(dialog?.getAttribute('aria-label')).toBe(zh.addServer)
  // The section itself must not grow a second copy of the form below the list.
  expect(container.querySelector('form')).toBeNull()
})

test('closes the editor when Escape is pressed', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ servers: [] }), { status: 200 })))
  const container = await renderSection()
  await act(async () => {
    clickButton(container, zh.add)
  })

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })

  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
})

test('keeps reconnect settings behind the advanced disclosure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ servers: [] }), { status: 200 })))
  const container = await renderSection()
  await act(async () => {
    clickButton(container, zh.add)
  })

  expect(editorForm().textContent).not.toContain(zh.reconnectMaxAttempts)

  await act(async () => {
    clickButton(editorForm(), zh.advanced)
  })

  expect(editorForm().textContent).toContain(zh.reconnectMaxAttempts)
})

test('deletes a server only after the confirmation is accepted', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
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
  }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const container = await renderSection()

  await act(async () => {
    clickButton(container, zh.delete)
  })

  const confirmation = document.body.querySelector('[role="dialog"]')
  expect(confirmation?.textContent).toContain('Filesystem')
  expect(deleteRequests(fetchMock)).toHaveLength(0)

  await act(async () => {
    clickButton(confirmation as HTMLElement, zh.delete)
  })

  expect(deleteRequests(fetchMock)).toEqual(['/mcp-management/servers/filesystem'])
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
})

function stubOAuthServer(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: { method?: string }) => {
    if (init?.method === 'POST' && input.endsWith('/oauth/start')) {
      return new Response(JSON.stringify({ authorizeUrl: 'https://idp.example/authorize?state=pending' }), { status: 200 })
    }
    return new Response(JSON.stringify({
      servers: [{
        record: {
          id: 'github',
          serverName: 'GitHub',
          enabled: true,
          transport: 'streamable-http',
          url: 'https://mcp.example/sse',
          auth: { kind: 'oauth', clientId: 'client', authorizeUrl: 'https://idp.example/authorize', tokenUrl: 'https://idp.example/token', scopes: [], redirectPath: '/callback' },
          toolCallTimeoutMs: 30_000,
          reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 1_000, maxAttempts: 3 },
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
        status: { state: 'disconnected' },
        secrets: {},
      }],
    }), { status: 200 })
  }))
}

async function renderSection(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(createElement(McpSection, { api: new McpManagementApi(), t: key => zh[key] }))
  })
  return container
}

function authorizeButton(container: HTMLElement): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(candidate => candidate.textContent === zh.authorize)
  if (button === undefined) throw new Error('the Authorize button is not rendered')
  return button
}

/** Clicks the button carrying exactly this label, failing loudly when absent. */
function clickButton(scope: HTMLElement, label: string): void {
  const button = [...scope.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  if (button === undefined) throw new Error(`no button labelled ${label}`)
  button.click()
}

/** The editor form, which the dialog portals outside the section container. */
function editorForm(): HTMLFormElement {
  const form = document.body.querySelector('[role="dialog"] form')
  if (form === null) throw new Error('the editor dialog is not open')
  return form as HTMLFormElement
}

/** Paths of the DELETE calls the section has issued so far. */
function deleteRequests(fetchMock: { mock: { calls: unknown[][] } }): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE')
    .map(([path]) => path as string)
}
