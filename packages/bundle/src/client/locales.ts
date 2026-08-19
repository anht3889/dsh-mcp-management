/** MCP Settings copy keys. */
export type McpSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'add'
  | 'edit'
  | 'delete'
  | 'done'
  | 'reload'
  | 'logout'
  | 'tools'
  | 'toolsEnabled'
  | 'toolsNone'
  | 'toolsUnlisted'
  | 'authorize'
  | 'authorizeStarting'
  | 'authorizeWaiting'
  | 'authorizeBlocked'
  | 'openLoginPage'
  | 'authorizeFailed'
  | 'enabled'
  | 'empty'
  | 'serverList'
  | 'loading'
  | 'logsPanel'
  | 'noLogs'
  | 'addServer'
  | 'editServer'
  | 'deleteServer'
  | 'deleteServerConfirm'
  | 'advanced'
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
  | 'redirectPath'
  | 'redirectPathHint'
  | 'discoverOAuth'
  | 'discoveringOAuth'
  | 'discoverOAuthHint'
  | 'discoverOAuthNeedUrl'
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
  edit: '编辑配置',
  delete: '删除',
  done: '完成',
  reload: '重新加载',
  logout: '退出登录',
  tools: '工具',
  toolsEnabled: '个工具已启用',
  toolsNone: '该服务未提供工具',
  toolsUnlisted: '连接成功后显示工具列表',
  authorize: '授权',
  authorizeStarting: '正在打开登录窗口…',
  authorizeWaiting: '请在登录窗口中完成授权。',
  authorizeBlocked: '浏览器拦截了登录窗口。',
  openLoginPage: '打开登录页面',
  authorizeFailed: '授权失败',
  enabled: '已启用',
  empty: '尚未配置 MCP 服务。',
  serverList: 'MCP 服务列表',
  loading: '正在加载 MCP 服务…',
  logsPanel: '连接日志',
  noLogs: '暂无日志。',
  addServer: '添加 MCP 服务',
  editServer: '编辑 MCP 服务',
  deleteServer: '删除 MCP 服务',
  deleteServerConfirm: '删除后将断开连接并移除该服务的工具，此操作无法撤销。',
  advanced: '高级设置',
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
  redirectPath: '回调路径',
  redirectPathHint: '身份提供方按注册值精确匹配回调地址。请填写该客户端已注册的路径，常见值为 /callback。完整回调地址：',
  discoverOAuth: '从服务 URL 自动发现',
  discoveringOAuth: '正在发现…',
  discoverOAuthHint: '根据 MCP 服务 URL 自动填写授权端点；若身份提供方支持动态客户端注册，还会自动填写客户端 ID。',
  discoverOAuthNeedUrl: '请先填写 HTTP 服务 URL。',
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
  edit: 'Edit configuration',
  delete: 'Delete',
  done: 'Done',
  reload: 'Reload',
  logout: 'Log out',
  tools: 'Tools',
  toolsEnabled: 'tools enabled',
  toolsNone: 'This server exposes no tools',
  toolsUnlisted: 'Tools are listed after the server connects',
  authorize: 'Authorize',
  authorizeStarting: 'Opening the login window…',
  authorizeWaiting: 'Finish signing in the login window.',
  authorizeBlocked: 'The browser blocked the login window.',
  openLoginPage: 'Open login page',
  authorizeFailed: 'Authorization failed',
  enabled: 'Enabled',
  empty: 'No MCP servers are configured.',
  serverList: 'MCP server list',
  loading: 'Loading MCP servers…',
  logsPanel: 'Connection logs',
  noLogs: 'No logs yet.',
  addServer: 'Add MCP server',
  editServer: 'Edit MCP server',
  deleteServer: 'Delete MCP server',
  deleteServerConfirm: 'Deleting disconnects the server and removes its tools. This cannot be undone.',
  advanced: 'Advanced settings',
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
  redirectPath: 'Redirect path',
  redirectPathHint: 'Identity providers match the redirect URI against the client registration exactly. Use the path this client is registered for, commonly /callback. Full redirect URI: ',
  discoverOAuth: 'Discover from server URL',
  discoveringOAuth: 'Discovering…',
  discoverOAuthHint: 'Fills authorize and token endpoints from the MCP server URL. When the identity provider supports Dynamic Client Registration, also fills the client ID.',
  discoverOAuthNeedUrl: 'Enter the HTTP server URL first.',
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
