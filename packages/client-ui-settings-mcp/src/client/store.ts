import type { McpLogEntry, McpManagementApi, McpServerView } from './api.ts'

/** State rendered by the MCP settings section. */
export interface McpSettingsState {
  status: 'loading' | 'ready' | 'error'
  error: string | undefined
  servers: readonly McpServerView[]
  selectedId: string | undefined
  logs: readonly McpLogEntry[]
  logCursor: number | undefined
}

const INITIAL_STATE: McpSettingsState = {
  status: 'loading',
  error: undefined,
  servers: [],
  selectedId: undefined,
  logs: [],
  logCursor: undefined,
}

/** Polls the management API while the settings page is mounted. */
export class McpSettingsStore {
  private state = INITIAL_STATE
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | undefined

  /**
   * @param api - HTTP client for the local management API.
   */
  constructor(private readonly api: McpManagementApi) {}

  /** @returns the current page snapshot. */
  getSnapshot(): McpSettingsState {
    return this.state
  }

  /**
   * @param listener - observer notified after state changes.
   * @returns a disposer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Begin immediate and approximately two-second refreshes. */
  start(): void {
    void this.load()
    this.timer = setInterval(() => { void this.load() }, 2_000)
  }

  /** Stop polling when the settings section unmounts. */
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  /**
   * @param id - server whose retained logs should be shown.
   */
  select(id: string | undefined): void {
    this.publish({ ...this.state, selectedId: id, logs: [], logCursor: undefined })
    if (id !== undefined) void this.loadLogs(id)
  }

  /** Reload server views and the selected server's newer log entries. */
  async load(): Promise<void> {
    this.publish({ ...this.state, status: 'loading', error: undefined })
    try {
      const { servers } = await this.api.list()
      this.publish({ ...this.state, status: 'ready', error: undefined, servers })
      if (this.state.selectedId !== undefined) await this.loadLogs(this.state.selectedId)
    } catch (error) {
      this.publish({
        ...this.state,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async loadLogs(id: string): Promise<void> {
    try {
      const logs = await this.api.logs(id, this.state.logCursor)
      if (this.state.selectedId !== id) return
      this.publish({
        ...this.state,
        logs: this.state.logCursor === undefined ? logs.entries : [...this.state.logs, ...logs.entries],
        logCursor: logs.next,
      })
    } catch {
      // A transient log request must not hide already-loaded server controls.
    }
  }

  private publish(state: McpSettingsState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
