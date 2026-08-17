import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { McpManagementApi, McpServerRecord, McpServerView } from './api.ts'
import { McpSettingsStore } from './store.ts'
import type { McpSettingsKey } from './locales.ts'
import styles from './McpSection.module.css'

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

  useEffect(() => {
    const dispose = store.subscribe(() => { setState(store.getSnapshot()) })
    store.start()
    return () => {
      dispose()
      store.stop()
    }
  }, [store])

  const save = async (record: McpServerRecord): Promise<void> => {
    await api.upsert(record)
    setEditing(undefined)
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
              t={t}
              onEdit={() => { setEditing(server.record) }}
              onLogs={() => { store.select(state.selectedId === server.record.id ? undefined : server.record.id) }}
              onToggle={() => { void api.setEnabled(server.record.id, !server.record.enabled).then(() => store.load()) }}
              onAuthorize={() => {
                void api.startOAuth(server.record.id).then(({ authorizeUrl }) => { window.open(authorizeUrl, '_blank', 'noopener,noreferrer') })
              }}
            />
          ))}
          {state.status === 'loading' && state.servers.length === 0 ? <p>{t('loading')}</p> : null}
          {state.status === 'ready' && state.servers.length === 0 ? <p>{t('empty')}</p> : null}
        </div>
        {state.selectedId === undefined ? null : <LogsPanel entries={state.logs} t={t} />}
      </div>
      {editing === undefined ? null : (
        <Editor
          record={editing}
          t={t}
          onCancel={() => { setEditing(undefined) }}
          onSave={(record) => { void save(record) }}
        />
      )}
    </section>
  )
}

function ServerRow({
  server,
  selected,
  t,
  onEdit,
  onLogs,
  onToggle,
  onAuthorize,
}: {
  server: McpServerView
  selected: boolean
  t: (key: McpSettingsKey) => string
  onEdit: () => void
  onLogs: () => void
  onToggle: () => void
  onAuthorize: () => void
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
        <button type="button" className={styles.secondaryButton} onClick={onLogs}>{selected ? t('hideLogs') : t('logs')}</button>
        {record.auth.kind === 'oauth'
          ? <button type="button" className={styles.secondaryButton} onClick={onAuthorize}>{t('authorize')}</button>
          : null}
      </div>
    </article>
  )
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

function Editor({ record, t, onCancel, onSave }: { record: McpServerRecord; t: (key: McpSettingsKey) => string; onCancel: () => void; onSave: (record: McpServerRecord) => void }): ReactNode {
  const [draft, setDraft] = useState(record)
  const update = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value } = event.target
    setDraft(previous => ({ ...previous, [name]: value }))
  }
  const submit = (event: ChangeEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onSave(draft)
  }
  return (
    <form className={styles.editor} onSubmit={submit}>
      <h3>{record.createdAt === record.updatedAt ? t('addServer') : t('editServer')}</h3>
      <label>{t('serverName')}<input name="serverName" value={draft.serverName} onChange={update} required /></label>
      <label>{t('serverId')}<input name="id" value={draft.id} onChange={update} required /></label>
      <label>{t('transport')}
        <select name="transport" value={draft.transport} onChange={update}>
          <option value="stdio">{t('transportStdio')}</option>
          <option value="streamable-http">{t('transportHttp')}</option>
        </select>
      </label>
      {draft.transport === 'stdio'
        ? <label>{t('command')}<input name="command" value={draft.command ?? ''} onChange={update} required /></label>
        : <label>{t('url')}<input name="url" value={draft.url ?? ''} onChange={update} required /></label>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton}>{t('save')}</button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </form>
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

function newServer(): McpServerRecord {
  const now = new Date().toISOString()
  return {
    id: '',
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
