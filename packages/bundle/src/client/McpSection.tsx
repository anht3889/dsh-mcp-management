import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { McpAuthConfig, McpLogEntry, McpManagementApi, McpServerRecord, McpServerView } from './api.ts'
import { McpSettingsStore } from './store.ts'
import type { McpSettingsKey } from './locales.ts'
import {
  navigateLoginWindow,
  openLoginWindow,
  readOAuthCompletion,
  type OAuthLoginState,
} from './oauth-login.ts'
import { Switch } from './Switch.tsx'
import styles from './McpSection.module.css'

/**
 * Callback path offered for a new OAuth server, matching the path
 * pre-registered public MCP clients most often allow.
 */
const DEFAULT_REDIRECT_PATH = '/callback'

/**
 * Secret the Host reports for a stored OAuth access token, which is how a
 * browser client tells an authorized server from one awaiting its first login.
 * The manager owns the name; this module restates it like the wire types above.
 */
const OAUTH_ACCESS_SECRET = 'OAUTH_ACCESS'

/** Props supplied while the section loads its managed servers. */
export interface McpSectionProps {
  /** API client used to read managed MCP servers. */
  api: McpManagementApi
  /** Localized product copy. */
  t: (key: McpSettingsKey) => string
}

/** Render the MCP Settings section. */
export function McpSection({ api, t }: McpSectionProps): ReactNode {
  const store = useMemo(() => new McpSettingsStore(api), [api])
  const [state, setState] = useState(store.getSnapshot())
  const [editing, setEditing] = useState<McpServerRecord | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<McpServerRecord | undefined>(undefined)
  const [detailsId, setDetailsId] = useState<string | undefined>(undefined)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const [login, setLogin] = useState<{ id: string; state: OAuthLoginState } | undefined>(undefined)
  // Read from the polled snapshot so the open dialog follows live status, tool
  // listings, and a deletion that removes the server underneath it.
  const details = state.servers.find(server => server.record.id === detailsId)

  useEffect(() => {
    const dispose = store.subscribe(() => { setState(store.getSnapshot()) })
    store.start()
    return () => {
      dispose()
      store.stop()
    }
  }, [store])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const completion = readOAuthCompletion(event)
      if (completion === undefined) return
      setLogin(previous => completion.ok || previous === undefined
        ? undefined
        : { ...previous, state: { phase: 'failed', error: completion.error } })
      void store.load()
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [store])

  const authorize = (id: string): void => {
    // Opened before the request so the browser still sees the operator's click.
    const loginWindow = openLoginWindow()
    setLogin({ id, state: { phase: 'starting' } })
    void api.startOAuth(id).then(
      ({ authorizeUrl }) => {
        setLogin({
          id,
          state: navigateLoginWindow(loginWindow, authorizeUrl)
            ? { phase: 'waiting' }
            : { phase: 'blocked', authorizeUrl },
        })
      },
      (error: unknown) => {
        loginWindow?.close()
        setLogin({ id, state: { phase: 'failed', error: error instanceof Error ? error.message : String(error) } })
      },
    )
  }

  const save = async (record: McpServerRecord, secrets: Record<string, string>): Promise<void> => {
    await api.upsert(record)
    if (Object.keys(secrets).length > 0) await api.setSecrets(record.id, secrets)
    setEditing(undefined)
    await store.load()
  }

  /** Applies a Host request, then refreshes so the UI shows the outcome. */
  const run = (request: Promise<unknown>): void => {
    setActionError(undefined)
    void request.then(
      () => store.load(),
      (error: unknown) => {
        setActionError(error instanceof Error ? error.message : String(error))
        void store.load()
      },
    )
  }

  const closeDetails = (): void => {
    setDetailsId(undefined)
    store.select(undefined)
  }

  const remove = (record: McpServerRecord): void => {
    setPendingDelete(undefined)
    run(api.remove(record.id))
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.intro}>{t('intro')}</p>
        </div>
        <Button variant="primary" onClick={() => { setEditing(newServer()) }}>{t('add')}</Button>
      </header>
      {state.error === undefined ? null : <p className={styles.error} role="alert">{state.error}</p>}
      {actionError === undefined ? null : <p className={styles.error} role="alert">{actionError}</p>}
      <div className={styles.list} aria-label={t('serverList')}>
        {state.servers.map((server) => (
          <ServerRow
            key={server.record.id}
            server={server}
            login={login?.id === server.record.id ? login.state : undefined}
            t={t}
            onOpen={() => { setDetailsId(server.record.id) }}
            onToggle={() => { run(api.setEnabled(server.record.id, !server.record.enabled)) }}
            onAuthorize={() => { authorize(server.record.id) }}
          />
        ))}
        {state.status === 'loading' && state.servers.length === 0 ? <p>{t('loading')}</p> : null}
        {state.status === 'ready' && state.servers.length === 0 ? <p>{t('empty')}</p> : null}
      </div>
      {details === undefined ? null : (
        <ServerDetails
          server={details}
          logs={state.logs}
          logsVisible={state.selectedId === details.record.id}
          t={t}
          onClose={closeDetails}
          onToggleEnabled={enabled => { run(api.setEnabled(details.record.id, enabled)) }}
          onToggleTool={(toolName, enabled) => { run(api.setToolEnabled(details.record.id, toolName, enabled)) }}
          onReload={() => { run(api.reload(details.record.id)) }}
          onShowLogs={visible => { store.select(visible ? details.record.id : undefined) }}
          onEdit={() => {
            closeDetails()
            setEditing(details.record)
          }}
          onLogout={() => { run(api.clearOAuth(details.record.id)) }}
          onDelete={() => {
            closeDetails()
            setPendingDelete(details.record)
          }}
        />
      )}
      {editing === undefined ? null : (
        <Editor
          api={api}
          record={editing}
          t={t}
          onCancel={() => { setEditing(undefined) }}
          onSave={(record, secrets) => { void save(record, secrets) }}
        />
      )}
      <Modal
        open={pendingDelete !== undefined}
        onClose={() => { setPendingDelete(undefined) }}
        title={t('deleteServer')}
        closeLabel={t('cancel')}
        description={t('deleteServerConfirm')}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setPendingDelete(undefined) }}>{t('cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => { if (pendingDelete !== undefined) remove(pendingDelete) }}
            >
              {t('delete')}
            </Button>
          </>
        )}
      >
        <strong>{pendingDelete?.serverName}</strong>
      </Modal>
    </section>
  )
}

function ServerRow({
  server,
  login,
  t,
  onOpen,
  onToggle,
  onAuthorize,
}: {
  server: McpServerView
  login: OAuthLoginState | undefined
  t: (key: McpSettingsKey) => string
  onOpen: () => void
  onToggle: () => void
  onAuthorize: () => void
}): ReactNode {
  const { record, status } = server
  return (
    <article className={styles.server}>
      {/* Everything except the switch and Authorize opens the details dialog,
          which is where this server's tools, logs, and destructive actions live. */}
      <button type="button" className={styles.serverOpen} aria-haspopup="dialog" onClick={onOpen}>
        <span className={styles.serverName}>{record.serverName}</span>
        <span className={styles.serverMeta}>
          {`${transportLabel(t, record)} · ${statusLabel(t, status.state)} · ${toolSummary(t, server)}`}
        </span>
      </button>
      <div className={styles.serverControls}>
        <Switch checked={record.enabled} label={t('enabled')} onChange={onToggle} />
        {needsAuthorization(server)
          ? <Button variant="outline" size="sm" onClick={onAuthorize}>{t('authorize')}</Button>
          : null}
      </div>
      {login === undefined ? null : <LoginStatus login={login} t={t} />}
    </article>
  )
}

function ServerDetails({
  server,
  logs,
  logsVisible,
  t,
  onClose,
  onToggleEnabled,
  onToggleTool,
  onReload,
  onShowLogs,
  onEdit,
  onLogout,
  onDelete,
}: {
  server: McpServerView
  logs: readonly McpLogEntry[]
  logsVisible: boolean
  t: (key: McpSettingsKey) => string
  onClose: () => void
  onToggleEnabled: (enabled: boolean) => void
  onToggleTool: (toolName: string, enabled: boolean) => void
  onReload: () => void
  onShowLogs: (visible: boolean) => void
  onEdit: () => void
  onLogout: () => void
  onDelete: () => void
}): ReactNode {
  const { record, status, tools } = server
  return (
    <Modal open onClose={onClose} title={record.serverName} headless className={styles.detailsDialog as string}>
      <div className={styles.details}>
        <header className={styles.detailsHeader}>
          <div>
            <h3 className={styles.detailsTitle}>{record.serverName}</h3>
            <p className={styles.detailsMeta}>{`${transportLabel(t, record)} · ${statusLabel(t, status.state)}`}</p>
          </div>
          <Switch checked={record.enabled} label={t('enabled')} onChange={onToggleEnabled} />
        </header>
        <div className={styles.detailsBody}>
          <section aria-label={t('tools')}>
            <div className={styles.toolsHeader}>
              <h4 className={styles.detailsSubtitle}>{`${t('tools')} · ${toolSummary(t, server)}`}</h4>
              <Button variant="outline" size="sm" disabled={!record.enabled} onClick={onReload}>{t('reload')}</Button>
            </div>
            {tools.length === 0
              ? <p className={styles.detailsMeta}>{t('toolsUnlisted')}</p>
              : (
                <ul className={styles.toolList}>
                  {tools.map(tool => (
                    <li key={tool.name} className={styles.tool}>
                      <Switch
                        checked={tool.enabled}
                        label={tool.name}
                        onChange={enabled => { onToggleTool(tool.name, enabled) }}
                      />
                    </li>
                  ))}
                </ul>
              )}
          </section>
          <section>
            <button
              type="button"
              className={styles.advancedToggle}
              aria-expanded={logsVisible}
              onClick={() => { onShowLogs(!logsVisible) }}
            >
              {t('logsPanel')}
            </button>
            {logsVisible ? <LogsPanel entries={logs} t={t} /> : null}
          </section>
        </div>
        <footer className={styles.detailsFooter}>
          <div className={styles.detailsActions}>
            <Button variant="outline" onClick={onEdit}>{t('edit')}</Button>
            {isAuthorized(server) ? <Button variant="outline" onClick={onLogout}>{t('logout')}</Button> : null}
            <Button variant="outline" onClick={onDelete}>{t('delete')}</Button>
          </div>
          <Button variant="primary" onClick={onClose}>{t('done')}</Button>
        </footer>
      </div>
    </Modal>
  )
}

function LoginStatus({ login, t }: { login: OAuthLoginState; t: (key: McpSettingsKey) => string }): ReactNode {
  switch (login.phase) {
    case 'starting':
      return <p className={styles.loginStatus}>{t('authorizeStarting')}</p>
    case 'waiting':
      return <p className={styles.loginStatus}>{t('authorizeWaiting')}</p>
    case 'blocked':
      return (
        <p className={styles.loginStatus}>
          {`${t('authorizeBlocked')} `}
          {/* The login page reports its outcome through window.opener, which rel="noopener" would sever. */}
          <a href={login.authorizeUrl} target="_blank" rel="noreferrer">{t('openLoginPage')}</a>
        </p>
      )
    case 'failed':
      return <p className={styles.loginError} role="alert">{`${t('authorizeFailed')}: ${login.error}`}</p>
  }
}

function LogsPanel({ entries, t }: { entries: readonly McpLogEntry[]; t: (key: McpSettingsKey) => string }): ReactNode {
  return (
    <aside className={styles.logs} aria-label={t('logsPanel')}>
      <h3>{t('logsPanel')}</h3>
      {entries.length === 0 ? <p>{t('noLogs')}</p> : (
        <ol>
          {entries.map((entry, index) => <li key={`${entry.at}-${index}`}>{`${entry.at} [${entry.level}] ${entry.message}${entry.detail === undefined ? '' : `: ${entry.detail}`}`}</li>)}
        </ol>
      )}
    </aside>
  )
}

function Editor({
  api,
  record,
  t,
  onCancel,
  onSave,
}: {
  api: McpManagementApi
  record: McpServerRecord
  t: (key: McpSettingsKey) => string
  onCancel: () => void
  onSave: (record: McpServerRecord, secrets: Record<string, string>) => void
}): ReactNode {
  const [draft, setDraft] = useState(record)
  // Editing the text rather than the parsed list keeps a half-typed line, and
  // the blank line that starts the next argument, on screen.
  const [argsText, setArgsText] = useState((record.args ?? []).join('\n'))
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | undefined>(undefined)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const update = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value } = event.target
    setDraft(previous => ({ ...previous, [name]: value }))
  }
  const updateAuth = (auth: McpAuthConfig): void => {
    setDraft(previous => ({ ...previous, auth }))
  }
  const updateArgs = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const { value } = event.target
    setArgsText(value)
    const args = value.split('\n').map(line => line.trim()).filter(line => line !== '')
    setDraft(previous => {
      if (args.length > 0) return { ...previous, args }
      const next = { ...previous }
      delete next.args
      return next
    })
  }
  const setNumber = (name: 'toolCallTimeoutMs' | 'initialDelayMs' | 'maxDelayMs' | 'maxAttempts', value: string): void => {
    const number = Number(value)
    if (!Number.isFinite(number)) return
    if (name === 'toolCallTimeoutMs') setDraft(previous => ({ ...previous, toolCallTimeoutMs: number }))
    else setDraft(previous => ({ ...previous, reconnect: { ...previous.reconnect, [name === 'initialDelayMs' ? 'initialDelayMs' : name === 'maxDelayMs' ? 'maxDelayMs' : 'maxAttempts']: number } }))
  }
  const headerAuth = draft.auth.kind === 'headers' ? draft.auth : undefined
  const oauthAuth = draft.auth.kind === 'oauth' ? draft.auth : undefined
  const discover = (): void => {
    if (draft.url === undefined || draft.url.trim() === '') {
      setDiscoverError(t('discoverOAuthNeedUrl'))
      return
    }
    setDiscovering(true)
    setDiscoverError(undefined)
    void api.discoverOAuth(draft.url).then(
      discovered => {
        setDraft(previous => ({
          ...previous,
          auth: {
            kind: 'oauth',
            clientId: discovered.clientId,
            authorizeUrl: discovered.authorizeUrl,
            tokenUrl: discovered.tokenUrl,
            scopes: discovered.scopes,
            redirectPath: previous.auth.kind === 'oauth' ? previous.auth.redirectPath : DEFAULT_REDIRECT_PATH,
          },
        }))
        if (discovered.clientSecret !== undefined) {
          setSecrets(previous => ({ ...previous, OAUTH_CLIENT_SECRET: discovered.clientSecret! }))
        }
        setDiscovering(false)
      },
      (error: unknown) => {
        setDiscovering(false)
        setDiscoverError(error instanceof Error ? error.message : String(error))
      },
    )
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onSave(draft, Object.fromEntries(Object.entries(secrets).filter(([, value]) => value !== '')))
  }
  const heading = record.createdAt === record.updatedAt ? t('addServer') : t('editServer')
  return (
    <Modal open onClose={onCancel} title={heading} headless className={styles.editorDialog as string}>
      <form className={styles.editor} onSubmit={submit}>
        <h3 className={styles.editorTitle}>{heading}</h3>
        <div className={styles.editorFields}>
          {/* The dialog opens from a click elsewhere on the page, so the first field takes focus. */}
          <label>{t('serverName')}<input name="serverName" value={draft.serverName} onChange={update} required autoFocus /></label>
          <label className={styles.toggle}><input type="checkbox" checked={draft.enabled} onChange={event => { setDraft(previous => ({ ...previous, enabled: event.target.checked })) }} />{t('enabled')}</label>
          <label>{t('transport')}
            <select name="transport" value={draft.transport} onChange={update}>
              <option value="stdio">{t('transportStdio')}</option>
              <option value="streamable-http">{t('transportHttp')}</option>
            </select>
          </label>
          {draft.transport === 'stdio'
            ? (
                <>
                  <label>{t('command')}<input name="command" value={draft.command ?? ''} onChange={update} required /></label>
                  <label>{t('commandArgs')}<textarea name="args" value={argsText} onChange={updateArgs} rows={3} /></label>
                </>
              )
            : <label>{t('url')}<input name="url" value={draft.url ?? ''} onChange={update} required /></label>}
          <label>{t('authKind')}
            <select value={draft.auth.kind} onChange={event => {
              const kind = event.target.value as McpAuthConfig['kind']
              updateAuth(kind === 'headers'
                ? { kind, headerNames: [] }
                : kind === 'oauth'
                  ? { kind, clientId: '', authorizeUrl: '', tokenUrl: '', scopes: [], redirectPath: DEFAULT_REDIRECT_PATH }
                  : { kind: 'none' })
            }}>
              <option value="none">{t('authNone')}</option>
              <option value="headers">{t('authHeaders')}</option>
              <option value="oauth">{t('authOAuth')}</option>
            </select>
          </label>
          {headerAuth === undefined ? null : (
            <>
              <label>{t('headerNames')}<input value={headerAuth.headerNames.join(', ')} onChange={event => { updateAuth({ kind: 'headers', headerNames: event.target.value.split(',').map(name => name.trim()).filter(Boolean) }) }} /></label>
              {headerAuth.headerNames.map(name => <label key={name}>{`${t('headerValue')}: ${name}`}<input type="password" value={secrets[name] ?? ''} onChange={event => { setSecrets(previous => ({ ...previous, [name]: event.target.value })) }} /></label>)}
            </>
          )}
          {oauthAuth === undefined ? null : (
            <>
              <p className={styles.loginStatus}>{t('discoverOAuthHint')}</p>
              <div className={styles.actions}>
                <Button variant="outline" size="sm" disabled={discovering} onClick={discover}>
                  {discovering ? t('discoveringOAuth') : t('discoverOAuth')}
                </Button>
              </div>
              {discoverError === undefined ? null : <p className={styles.error} role="alert">{discoverError}</p>}
              <label>{t('clientId')}<input value={oauthAuth.clientId} onChange={event => { updateAuth({ ...oauthAuth, clientId: event.target.value }) }} required /></label>
              <label>{t('authorizeUrl')}<input type="url" value={oauthAuth.authorizeUrl} onChange={event => { updateAuth({ ...oauthAuth, authorizeUrl: event.target.value }) }} required /></label>
              <label>{t('tokenUrl')}<input type="url" value={oauthAuth.tokenUrl} onChange={event => { updateAuth({ ...oauthAuth, tokenUrl: event.target.value }) }} required /></label>
              <label>{t('scopes')}<input value={oauthAuth.scopes.join(' ')} onChange={event => { updateAuth({ ...oauthAuth, scopes: event.target.value.split(/\s+/).filter(Boolean) }) }} /></label>
              <label>{t('redirectPath')}<input value={oauthAuth.redirectPath} onChange={event => { updateAuth({ ...oauthAuth, redirectPath: event.target.value }) }} pattern="/.*" required /></label>
              <p className={styles.loginStatus}>{t('redirectPathHint')}<code>{`${location.origin}${oauthAuth.redirectPath}`}</code></p>
              <label>{t('clientSecret')}<input type="password" value={secrets.OAUTH_CLIENT_SECRET ?? ''} onChange={event => { setSecrets(previous => ({ ...previous, OAUTH_CLIENT_SECRET: event.target.value })) }} /></label>
            </>
          )}
          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={advancedOpen}
            onClick={() => { setAdvancedOpen(open => !open) }}
          >
            {t('advanced')}
          </button>
          {!advancedOpen ? null : (
            <>
              <label>{t('serverId')}<input name="id" value={draft.id} readOnly /></label>
              <label>{t('timeout')}<input type="number" value={draft.toolCallTimeoutMs} onChange={event => { setNumber('toolCallTimeoutMs', event.target.value) }} min="1" required /></label>
              <label className={styles.toggle}><input type="checkbox" checked={draft.reconnect.enabled} onChange={event => { setDraft(previous => ({ ...previous, reconnect: { ...previous.reconnect, enabled: event.target.checked } })) }} />{t('reconnectEnabled')}</label>
              <label>{t('reconnectInitialDelay')}<input type="number" value={draft.reconnect.initialDelayMs} onChange={event => { setNumber('initialDelayMs', event.target.value) }} min="0" required /></label>
              <label>{t('reconnectMaxDelay')}<input type="number" value={draft.reconnect.maxDelayMs} onChange={event => { setNumber('maxDelayMs', event.target.value) }} min="0" required /></label>
              <label>{t('reconnectMaxAttempts')}<input type="number" value={draft.reconnect.maxAttempts} onChange={event => { setNumber('maxAttempts', event.target.value) }} min="0" required /></label>
            </>
          )}
        </div>
        <div className={styles.editorFooter}>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" type="submit">{t('save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function transportLabel(t: (key: McpSettingsKey) => string, record: McpServerRecord): string {
  return record.transport === 'stdio' ? t('transportStdio') : t('transportHttp')
}

/** One line describing how many of a server's listed tools the model can call. */
function toolSummary(t: (key: McpSettingsKey) => string, server: McpServerView): string {
  if (server.tools.length > 0) {
    return `${server.tools.filter(tool => tool.enabled).length}/${server.tools.length} ${t('toolsEnabled')}`
  }
  return server.status.state === 'connected' ? t('toolsNone') : t('toolsUnlisted')
}

/** Whether the Host holds an OAuth access token for this server. */
function isAuthorized(server: McpServerView): boolean {
  return server.secrets[OAUTH_ACCESS_SECRET]?.configured === true
}

function needsAuthorization(server: McpServerView): boolean {
  return server.record.auth.kind === 'oauth' && !isAuthorized(server)
}

function statusLabel(t: (key: McpSettingsKey) => string, status: McpServerView['status']['state']): string {
  switch (status) {
    case 'disconnected': return t('statusDisconnected')
    case 'connecting': return t('statusConnecting')
    case 'connected': return t('statusConnected')
    case 'reconnecting': return t('statusReconnecting')
    case 'failed': return t('statusFailed')
  }
}

/** Creates a new server draft with a stable identifier before its first save. */
export function newServer(): McpServerRecord {
  const now = new Date().toISOString()
  return {
    id: globalThis.crypto.randomUUID(),
    serverName: '',
    enabled: true,
    transport: 'stdio',
    auth: { kind: 'none' },
    toolCallTimeoutMs: 30_000,
    reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
    createdAt: now,
    updatedAt: now,
  }
}
