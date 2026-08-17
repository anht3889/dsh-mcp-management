import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { McpManagementApi, McpServerRecord, McpServerView } from './api.ts'
import { McpSettingsStore } from './store.ts'
import styles from './McpSection.module.css'

/** Props supplied while the section loads its managed servers. */
export interface McpSectionProps {
  /** API client used to read managed MCP servers. */
  api: McpManagementApi
}

/** Render the MCP Settings section. */
export function McpSection({ api }: McpSectionProps): ReactNode {
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
          <h2 className={styles.title}>MCP 服务</h2>
          <p className={styles.intro}>管理本地 MCP 服务连接、授权和诊断日志。</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={() => { setEditing(newServer()) }}>添加服务</button>
      </header>
      {state.error === undefined ? null : <p className={styles.error} role="alert">{state.error}</p>}
      <div className={styles.content}>
        <div className={styles.list} aria-label="MCP 服务列表">
          {state.servers.map((server) => (
            <ServerRow
              key={server.record.id}
              server={server}
              selected={state.selectedId === server.record.id}
              onEdit={() => { setEditing(server.record) }}
              onLogs={() => { store.select(state.selectedId === server.record.id ? undefined : server.record.id) }}
              onToggle={() => { void api.setEnabled(server.record.id, !server.record.enabled).then(() => store.load()) }}
              onAuthorize={() => {
                void api.startOAuth(server.record.id).then(({ authorizeUrl }) => { window.open(authorizeUrl, '_blank', 'noopener,noreferrer') })
              }}
            />
          ))}
          {state.status === 'loading' && state.servers.length === 0 ? <p>正在加载 MCP 服务…</p> : null}
          {state.status === 'ready' && state.servers.length === 0 ? <p>尚未配置 MCP 服务。</p> : null}
        </div>
        {state.selectedId === undefined ? null : <LogsPanel entries={state.logs} />}
      </div>
      {editing === undefined ? null : (
        <Editor
          record={editing}
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
  onEdit,
  onLogs,
  onToggle,
  onAuthorize,
}: {
  server: McpServerView
  selected: boolean
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
        <span>{record.transport === 'stdio' ? '标准输入输出' : 'HTTP'}</span>
        <span>{status.state}</span>
      </div>
      <div className={styles.actions}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={record.enabled} onChange={onToggle} />
          已启用
        </label>
        <button type="button" className={styles.secondaryButton} onClick={onEdit}>编辑</button>
        <button type="button" className={styles.secondaryButton} onClick={onLogs}>{selected ? '隐藏日志' : '日志'}</button>
        {record.auth.kind === 'oauth'
          ? <button type="button" className={styles.secondaryButton} onClick={onAuthorize}>授权</button>
          : null}
      </div>
    </article>
  )
}

function LogsPanel({ entries }: { entries: readonly { at: string; level: string; message: string; detail?: string }[] }): ReactNode {
  return (
    <aside className={styles.logs} aria-label="连接日志">
      <h3>连接日志</h3>
      {entries.length === 0 ? <p>暂无日志。</p> : (
        <ol>
          {entries.map((entry, index) => <li key={`${entry.at}-${index}`}>{`${entry.at} [${entry.level}] ${entry.message}${entry.detail === undefined ? '' : `: ${entry.detail}`}`}</li>)}
        </ol>
      )}
    </aside>
  )
}

function Editor({ record, onCancel, onSave }: { record: McpServerRecord; onCancel: () => void; onSave: (record: McpServerRecord) => void }): ReactNode {
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
      <h3>{record.createdAt === record.updatedAt ? '添加 MCP 服务' : '编辑 MCP 服务'}</h3>
      <label>名称<input name="serverName" value={draft.serverName} onChange={update} required /></label>
      <label>标识<input name="id" value={draft.id} onChange={update} required /></label>
      <label>传输方式
        <select name="transport" value={draft.transport} onChange={update}>
          <option value="stdio">标准输入输出</option>
          <option value="streamable-http">HTTP</option>
        </select>
      </label>
      {draft.transport === 'stdio'
        ? <label>命令<input name="command" value={draft.command ?? ''} onChange={update} required /></label>
        : <label>URL<input name="url" value={draft.url ?? ''} onChange={update} required /></label>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton}>保存</button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>取消</button>
      </div>
    </form>
  )
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
