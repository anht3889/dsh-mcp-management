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
  const fetchMock = stubManagement([filesystemView()])
  const container = await renderSection()

  expect(container.textContent).toContain('Filesystem')
  expect(fetchMock).toHaveBeenCalledWith('/mcp-management/servers', expect.any(Object))
})

test('creates a UUID for a new server', () => {
  expect(newServer().id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})

test('summarizes how many listed tools the model can call', async () => {
  stubManagement([filesystemView()])
  const container = await renderSection()

  expect(container.textContent).toContain(`1/2 ${zh.toolsEnabled}`)
})

test('leaves the row with the enabled switch and no per-row actions', async () => {
  stubManagement([filesystemView()])
  const container = await renderSection()

  // Editing, deleting, and logs all moved into the details dialog.
  expect(labels(container)).toEqual([zh.add, `Filesystem${rowMeta()}`, zh.enabled])
})

test('drops Authorize from the row once the server holds a token', async () => {
  stubManagement([oauthView({ secrets: { OAUTH_ACCESS: { configured: true } } })])
  const container = await renderSection()

  expect(labels(container)).not.toContain(zh.authorize)
})

test('sends the login window to the provider when Authorize is clicked', async () => {
  stubManagement([oauthView()])
  const loginWindow = { location: { href: '' }, closed: false, close: vi.fn() }
  const open = vi.fn(() => loginWindow)
  vi.stubGlobal('open', open)
  const container = await renderSection()

  await act(async () => {
    clickButton(container, zh.authorize)
  })

  expect(open).toHaveBeenCalledWith('', 'dsh-mcp-oauth-login', expect.stringContaining('popup'))
  expect(loginWindow.location.href).toBe('https://idp.example/authorize?state=pending')
  expect(container.textContent).toContain(zh.authorizeWaiting)
})

test('offers the authorization link when the browser blocks the login window', async () => {
  stubManagement([oauthView()])
  vi.stubGlobal('open', vi.fn(() => null))
  const container = await renderSection()

  await act(async () => {
    clickButton(container, zh.authorize)
  })

  const link = container.querySelector('a')
  expect(container.textContent).toContain(zh.authorizeBlocked)
  expect(link?.getAttribute('href')).toBe('https://idp.example/authorize?state=pending')
})

test('reports a failed authorization posted by the login window', async () => {
  stubManagement([oauthView()])
  vi.stubGlobal('open', vi.fn(() => ({ location: { href: '' }, closed: false, close: vi.fn() })))
  const container = await renderSection()
  await act(async () => {
    clickButton(container, zh.authorize)
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

test('opens the details dialog for the server row that was clicked', async () => {
  stubManagement([filesystemView()])
  const container = await renderSection()

  await act(async () => {
    openDetails(container, 'Filesystem')
  })

  const details = dialog()
  expect(details.getAttribute('aria-label')).toBe('Filesystem')
  expect(details.textContent).toContain('read_file')
  expect(details.textContent).toContain('write_file')
  expect(labels(details)).toEqual([zh.enabled, zh.reload, 'read_file', 'write_file', zh.logsPanel, zh.edit, zh.delete, zh.done])
})

test('renders each tool as a switch that reports its registration state', async () => {
  stubManagement([filesystemView()])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })

  const switches = [...dialog().querySelectorAll('[role="switch"]')]
    .map(control => [control.textContent, control.getAttribute('aria-checked')])

  expect(switches).toEqual([
    [zh.enabled, 'true'],
    ['read_file', 'true'],
    ['write_file', 'false'],
  ])
})

test('disables a tool through the management API', async () => {
  const fetchMock = stubManagement([filesystemView()])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })

  await act(async () => {
    clickButton(dialog(), 'read_file')
  })

  expect(requests(fetchMock, 'POST')).toContain('/mcp-management/servers/filesystem/tools/read_file/disable')
})

test('reloads the server to list its tools again', async () => {
  const fetchMock = stubManagement([filesystemView()])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })

  await act(async () => {
    clickButton(dialog(), zh.reload)
  })

  expect(requests(fetchMock, 'POST')).toContain('/mcp-management/servers/filesystem/connect')
})

test('shows the connection logs the disclosure asks for', async () => {
  stubManagement([filesystemView()])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })
  expect(dialog().textContent).not.toContain('Connected to MCP server')

  await act(async () => {
    clickButton(dialog(), zh.logsPanel)
  })

  expect(dialog().textContent).toContain('Connected to MCP server')
})

test('logs out of a server holding an OAuth token', async () => {
  const fetchMock = stubManagement([oauthView({ secrets: { OAUTH_ACCESS: { configured: true } } })])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'GitHub')
  })

  await act(async () => {
    clickButton(dialog(), zh.logout)
  })

  expect(requests(fetchMock, 'POST')).toContain('/mcp-management/servers/github/oauth/clear')
})

test('offers Discover when OAuth is selected and requires a URL first', async () => {
  stubManagement([])
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
  stubManagement([])
  const container = await renderSection()

  await act(async () => {
    clickButton(container, zh.add)
  })

  expect(dialog().getAttribute('aria-modal')).toBe('true')
  expect(dialog().getAttribute('aria-label')).toBe(zh.addServer)
  // The section itself must not grow a second copy of the form below the list.
  expect(container.querySelector('form')).toBeNull()
})

test('closes the editor when Escape is pressed', async () => {
  stubManagement([])
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
  stubManagement([])
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

test('edits the server the details dialog was opened for', async () => {
  stubManagement([filesystemView()])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })

  await act(async () => {
    clickButton(dialog(), zh.edit)
  })

  expect(dialog().getAttribute('aria-label')).toBe(zh.editServer)
  expect(editorForm().querySelector('input[name="serverName"]')).toHaveProperty('value', 'Filesystem')
})

test('deletes a server only after the confirmation is accepted', async () => {
  const fetchMock = stubManagement([filesystemView()])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })

  await act(async () => {
    clickButton(dialog(), zh.delete)
  })

  expect(dialog().textContent).toContain('Filesystem')
  expect(requests(fetchMock, 'DELETE')).toHaveLength(0)

  await act(async () => {
    clickButton(dialog(), zh.delete)
  })

  expect(requests(fetchMock, 'DELETE')).toEqual(['/mcp-management/servers/filesystem'])
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
})

test('edits stdio arguments as a list, one per line', async () => {
  // A command field alone forces the operator to paste a whole command line,
  // which spawning cannot split.
  const view = filesystemView() as { record: Record<string, unknown> }
  view.record.args = ['--root', '/srv']
  const fetchMock = stubManagement([view])
  const container = await renderSection()
  await act(async () => {
    openDetails(container, 'Filesystem')
  })
  await act(async () => {
    clickButton(dialog(), zh.edit)
  })

  const form = editorForm()
  const args = form.querySelector('textarea[name="args"]') as HTMLTextAreaElement
  expect(args.value).toBe('--root\n/srv')

  await act(async () => {
    type(args, '--root\n/data\n')
  })
  await act(async () => {
    clickButton(form, zh.save)
  })

  expect(body(fetchMock, 'PUT').args).toEqual(['--root', '/data'])
})

/** Answers every management route this section calls, from fixed server views. */
function stubManagement(views: unknown[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string, init?: { method?: string }) => {
    if (input.endsWith('/oauth/start')) {
      return json({ authorizeUrl: 'https://idp.example/authorize?state=pending' })
    }
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    if (input.includes('/logs')) {
      return json({ next: 1, entries: [{ at: '2026-08-17T00:00:00.000Z', level: 'info', message: 'Connected to MCP server' }] })
    }
    if (init?.method === 'POST' || init?.method === 'PUT') return json(views[0])
    return json({ servers: views })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function filesystemView(overrides: Record<string, unknown> = {}): unknown {
  return {
    record: {
      id: 'filesystem',
      serverName: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'filesystem-mcp',
      auth: { kind: 'none' },
      toolCallTimeoutMs: 30_000,
      reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 1_000, maxAttempts: 3 },
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:01.000Z',
    },
    status: { state: 'connected', toolCount: 1, connectedAt: '2026-08-17T00:00:00.000Z' },
    tools: [
      { name: 'read_file', description: 'Read a file', enabled: true },
      { name: 'write_file', description: '', enabled: false },
    ],
    secrets: {},
    ...overrides,
  }
}

function oauthView(overrides: Record<string, unknown> = {}): unknown {
  return {
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
    tools: [],
    secrets: {},
    ...overrides,
  }
}

/** The summary line the Filesystem fixture renders beside its name. */
function rowMeta(): string {
  return `${zh.transportStdio} · ${zh.statusConnected} · 1/2 ${zh.toolsEnabled}`
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

/** Text of every button in a scope, which is how the UI exposes its actions. */
function labels(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('button')].map(button => button.textContent ?? '')
}

/** Clicks the button carrying exactly this label, failing loudly when absent. */
function clickButton(scope: HTMLElement, label: string): void {
  const button = [...scope.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  if (button === undefined) throw new Error(`no button labelled ${label}`)
  button.click()
}

/** Clicks the row summary, the control that opens a server's details dialog. */
function openDetails(container: HTMLElement, serverName: string): void {
  const row = [...container.querySelectorAll('button')].find(candidate => candidate.textContent?.startsWith(serverName) === true)
  if (row === undefined) throw new Error(`no server row for ${serverName}`)
  row.click()
}

/** The open dialog, which every Modal portals outside the section container. */
function dialog(): HTMLElement {
  const open = document.body.querySelector('[role="dialog"]')
  if (open === null) throw new Error('no dialog is open')
  return open as HTMLElement
}

/** Paths of the requests the section has issued with this method. */
function requests(fetchMock: { mock: { calls: unknown[][] } }, method: string): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as { method?: string } | undefined)?.method === method)
    .map(([path]) => path as string)
}

/**
 * Replaces a field's text the way a keystroke does. Assigning `value` directly
 * runs React's own setter, which records the new text as already seen and then
 * treats the event as a no-op, so the prototype setter has to write it.
 */
function type(field: HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  descriptor?.set?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Parsed body of the first request the section issued with this method. */
function body(fetchMock: { mock: { calls: unknown[][] } }, method: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([, init]) => (init as { method?: string } | undefined)?.method === method)
  if (call === undefined) throw new Error(`no ${method} request was issued`)
  return JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>
}

/** The editor form, which the dialog portals outside the section container. */
function editorForm(): HTMLFormElement {
  const form = document.body.querySelector('[role="dialog"] form')
  if (form === null) throw new Error('the editor dialog is not open')
  return form as HTMLFormElement
}
