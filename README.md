# dsh-mcp-management

Out-of-tree MCP connection management for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Architecture and scope live in [docs/design.md](https://github.com/anht3889/dsh-mcp-management/blob/master/docs/design.md).

## Install

From npm (after the packages are published):

```sh
npx @deepseek-ai/dsh plugin --profile web add @anht3889/dsh-mcp-mgmt-bundle@0.0.2
```

From a local checkout (development):

```sh
pnpm install && pnpm run build
npx @deepseek-ai/dsh plugin --profile web add ./packages/bundle
```

Restart the Web profile after installation.

Do not also mount `@deepseek-ai/dsh-mcp-client` for the same `serverName` — both register MCP tools and will conflict.

## Settings UI

**Add a server.** Open Settings → MCP Servers and choose **Add server**. Fill in the name, transport (stdio or HTTP), command or URL, and authentication, then **Save**. Timeout and reconnect options live under **Advanced settings**.

![Add MCP server](https://raw.githubusercontent.com/anht3889/dsh-mcp-management/master/docs/assets/mcp-add-server.png)

**Server list.** Each row shows the server name, an Enabled switch, and a summary of transport, connection state, and how many tools are enabled. **Authorize** appears only while an OAuth server has no token. Click the row to open details.

![MCP Servers list](https://raw.githubusercontent.com/anht3889/dsh-mcp-management/master/docs/assets/mcp-servers.png)

**Server details.** Toggle the server or individual tools, **Reload** to reconnect and re-list tools, open **Connection logs**, or use **Edit configuration**, **Log out**, and **Delete**. Disabling a tool unregisters it without dropping the connection; the choice is stored in the server record and survives a restart.

![MCP server details](https://raw.githubusercontent.com/anht3889/dsh-mcp-management/master/docs/assets/mcp-server-details.png)

## Storage

| Data | Default path |
|---|---|
| Non-secret server records, including disabled tool names | `~/.dsh/mcp/servers.json` |
| Secrets (tokens, header values, client secret) | `~/.dsh/mcp/secrets.yaml`, or `ctx.credentials` when mounted |

Override with the manager plugin's `catalogPath` / `secretsPath` config.

## OAuth

Each server's callback URL is the live web origin plus that server's `auth.redirectPath` (default `/callback`). Set `publicOrigin` on the manager when the browser reaches the host through a different origin. Authorization servers match the redirect URI exactly; a pre-registered public client usually allows `/callback` on any loopback port. The manager serves every configured path. Authorize and token requests also send the MCP URL as the RFC 8707 `resource` indicator.

## Packages

| Package | Role |
|---|---|
| [`@anht3889/dsh-mcp-mgmt-bundle`](https://www.npmjs.com/package/@anht3889/dsh-mcp-mgmt-bundle) | Installable surface: patch, manager, Settings UI |
| [`@anht3889/dsh-mcp-mgmt-mcp`](https://www.npmjs.com/package/@anht3889/dsh-mcp-mgmt-mcp) | `ctx.mcp` vocabulary (library) |
| [`@anht3889/dsh-mcp-mgmt-oauth`](https://www.npmjs.com/package/@anht3889/dsh-mcp-mgmt-oauth) | PKCE OAuth + discovery (library) |
