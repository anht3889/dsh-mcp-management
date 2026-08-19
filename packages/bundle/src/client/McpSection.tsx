import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { McpAuthConfig, McpManagementApi, McpServerRecord, McpServerView } from './api.ts'
import { McpSettingsStore } from './store.ts'
import type { McpSettingsKey } from './locales.ts'
import {
  navigateLoginWindow,
  openLoginWindow,
  readOAuthCompletion,
  type OAuthLoginState,
} from './oauth-login.ts'
import styles from './McpSection.module.css'

/**
 * Callback path offered for a new OAuth server, matching the path
 * pre-registered public MCP clients most often allow.
 */
const DEFAULT_REDIRECT_PATH = '/callback'

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
  const [login, setLogin] = useState<{ id: string; state: OAuthLoginState } | undefined>(undefined)

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

  const remove = async (record: McpServerRecord): Promise<void> => {
    setPendingDelete(undefined)
    await api.remove(record.id)
    await store.load()
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.intro}>{t('intro')}</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={() => { setEditing(newServer()) }}>{t('add')}</button>
      </header>
      {state.error === undefined ? null : <p className={styles.error} role="alert">{state.error}</p>}
      <div className={styles.content}>
        <div className={styles.list} aria-label={t('serverList')}>
          {state.servers.map((server) => (
            <ServerRow
              key={server.record.id}
              server={server}
              selected={state.selectedId === server.record.id}
              login={login?.id === server.record.id ? login.state : undefined}
              t={t}
              onEdit={() => { setEditing(server.record) }}
              onLogs={() => { store.select(state.selectedId === server.record.id ? undefined : server.record.id) }}
              onToggle={() => { void api.setEnabled(server.record.id, !server.record.enabled).then(() => store.load()) }}
              onAuthorize={() => { authorize(server.record.id) }}
              onDelete={() => { setPendingDelete(server.record) }}
            />
          ))}
          {state.status === 'loading' && state.servers.length === 0 ? <p>{t('loading')}</p> : null}
          {state.status === 'ready' && state.servers.length === 0 ? <p>{t('empty')}</p> : null}
        </div>
        {state.selectedId === undefined ? null : <LogsPanel entries={state.logs} t={t} />}
      </div>
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
              onClick={() => { if (pendingDelete !== undefined) void remove(pendingDelete) }}
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
  selected,
  login,
  t,
  onEdit,
  onLogs,
  onToggle,
  onAuthorize,
  onDelete,
}: {
  server: McpServerView
  selected: boolean
  login: OAuthLoginState | undefined
  t: (key: McpSettingsKey) => string
  onEdit: () => void
  onLogs: () => void
  onToggle: () => void
  onAuthorize: () => void
  onDelete: () => void
}): ReactNode {
  const { record, status } = server
  return (
    <article className={styles.server}>
      <div className={styles.serverSummary}>
        <strong>{record.serverName}</strong>
        <span>{record.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}</span>
        <span>{statusLabel(t, status.state)}</span>
      </div>
      <div className={styles.actions}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={record.enabled} onChange={onToggle} />
          {t('enabled')}
        </label>
        <button type="button" className={styles.secondaryButton} onClick={onEdit}>{t('edit')}</button>
        <button type="button" className={styles.secondaryButton} onClick={onDelete}>{t('delete')}</button>
        <button type="button" className={styles.secondaryButton} onClick={onLogs}>{selected ? t('hideLogs') : t('logs')}</button>
        {record.auth.kind === 'oauth'
          ? <button type="button" className={styles.secondaryButton} onClick={onAuthorize}>{t('authorize')}</button>
          : null}
      </div>
      {login === undefined ? null : <LoginStatus login={login} t={t} />}
    </article>
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

function LogsPanel({ entries, t }: { entries: readonly { at: string; level: string; message: string; detail?: string }[]; t: (key: McpSettingsKey) => string }): ReactNode {
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
            ? <label>{t('command')}<input name="command" value={draft.command ?? ''} onChange={update} required /></label>
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
                <button type="button" className={styles.secondaryButton} disabled={discovering} onClick={discover}>
                  {discovering ? t('discoveringOAuth') : t('discoverOAuth')}
                </button>
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
