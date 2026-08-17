/** MCP Settings copy keys. */
export type McpSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'add'
  | 'edit'
  | 'logs'
  | 'authorize'
  | 'enabled'
  | 'empty'

/** Chinese product copy. */
export const zh: Record<McpSettingsKey, string> = {
  nav: 'MCP 服务',
  title: 'MCP 服务',
  intro: '管理本地 MCP 服务连接、授权和诊断日志。',
  add: '添加服务',
  edit: '编辑',
  logs: '日志',
  authorize: '授权',
  enabled: '已启用',
  empty: '尚未配置 MCP 服务。',
}

/** English fallback copy. */
export const en: Record<McpSettingsKey, string> = {
  nav: 'MCP Servers',
  title: 'MCP Servers',
  intro: 'Manage local MCP connections, authorization, and diagnostic logs.',
  add: 'Add server',
  edit: 'Edit',
  logs: 'Logs',
  authorize: 'Authorize',
  enabled: 'Enabled',
  empty: 'No MCP servers are configured.',
}
