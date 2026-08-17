/** MCP Settings copy keys. */
export type McpSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'add'
  | 'edit'
  | 'delete'
  | 'logs'
  | 'authorize'
  | 'enabled'
  | 'empty'
  | 'serverList'
  | 'loading'
  | 'hideLogs'
  | 'logsPanel'
  | 'noLogs'
  | 'addServer'
  | 'editServer'
  | 'serverName'
  | 'serverId'
  | 'transport'
  | 'transportStdio'
  | 'transportHttp'
  | 'command'
  | 'url'
  | 'authKind'
  | 'authNone'
  | 'authHeaders'
  | 'authOAuth'
  | 'headerNames'
  | 'headerValue'
  | 'clientId'
  | 'authorizeUrl'
  | 'tokenUrl'
  | 'scopes'
  | 'clientSecret'
  | 'timeout'
  | 'reconnectEnabled'
  | 'reconnectInitialDelay'
  | 'reconnectMaxDelay'
  | 'reconnectMaxAttempts'
  | 'save'
  | 'cancel'
  | 'statusDisconnected'
  | 'statusConnecting'
  | 'statusConnected'
  | 'statusReconnecting'
  | 'statusFailed'

/** Chinese product copy. */
export const zh: Record<McpSettingsKey, string> = {
  nav: 'MCP 服务',
  title: 'MCP 服务',
  intro: '管理本地 MCP 服务连接、授权和诊断日志。',
  add: '添加服务',
  edit: '编辑',
  delete: '删除',
  logs: '日志',
  authorize: '授权',
  enabled: '已启用',
  empty: '尚未配置 MCP 服务。',
  serverList: 'MCP 服务列表',
  loading: '正在加载 MCP 服务…',
  hideLogs: '隐藏日志',
  logsPanel: '连接日志',
  noLogs: '暂无日志。',
  addServer: '添加 MCP 服务',
  editServer: '编辑 MCP 服务',
  serverName: '名称',
  serverId: '标识',
  transport: '传输方式',
  transportStdio: '标准输入输出',
  transportHttp: 'HTTP',
  command: '命令',
  url: 'URL',
  authKind: '认证方式',
  authNone: '无认证',
  authHeaders: '请求头',
  authOAuth: 'OAuth',
  headerNames: '请求头名称（逗号分隔）',
  headerValue: '请求头值',
  clientId: '客户端 ID',
  authorizeUrl: '授权 URL',
  tokenUrl: '令牌 URL',
  scopes: '权限范围（空格分隔）',
  clientSecret: '客户端密钥',
  timeout: '工具调用超时（毫秒）',
  reconnectEnabled: '自动重连',
  reconnectInitialDelay: '初始重连延迟（毫秒）',
  reconnectMaxDelay: '最大重连延迟（毫秒）',
  reconnectMaxAttempts: '最大重连次数',
  save: '保存',
  cancel: '取消',
  statusDisconnected: '未连接',
  statusConnecting: '正在连接',
  statusConnected: '已连接',
  statusReconnecting: '正在重连',
  statusFailed: '连接失败',
}

/** English fallback copy. */
export const en: Record<McpSettingsKey, string> = {
  nav: 'MCP Servers',
  title: 'MCP Servers',
  intro: 'Manage local MCP connections, authorization, and diagnostic logs.',
  add: 'Add server',
  edit: 'Edit',
  delete: 'Delete',
  logs: 'Logs',
  authorize: 'Authorize',
  enabled: 'Enabled',
  empty: 'No MCP servers are configured.',
  serverList: 'MCP server list',
  loading: 'Loading MCP servers…',
  hideLogs: 'Hide logs',
  logsPanel: 'Connection logs',
  noLogs: 'No logs yet.',
  addServer: 'Add MCP server',
  editServer: 'Edit MCP server',
  serverName: 'Name',
  serverId: 'Identifier',
  transport: 'Transport',
  transportStdio: 'Standard input/output',
  transportHttp: 'HTTP',
  command: 'Command',
  url: 'URL',
  authKind: 'Authentication',
  authNone: 'None',
  authHeaders: 'Headers',
  authOAuth: 'OAuth',
  headerNames: 'Header names (comma-separated)',
  headerValue: 'Header value',
  clientId: 'Client ID',
  authorizeUrl: 'Authorize URL',
  tokenUrl: 'Token URL',
  scopes: 'Scopes (space-separated)',
  clientSecret: 'Client secret',
  timeout: 'Tool timeout (ms)',
  reconnectEnabled: 'Reconnect automatically',
  reconnectInitialDelay: 'Initial reconnect delay (ms)',
  reconnectMaxDelay: 'Maximum reconnect delay (ms)',
  reconnectMaxAttempts: 'Maximum reconnect attempts',
  save: 'Save',
  cancel: 'Cancel',
  statusDisconnected: 'Disconnected',
  statusConnecting: 'Connecting',
  statusConnected: 'Connected',
  statusReconnecting: 'Reconnecting',
  statusFailed: 'Connection failed',
}
