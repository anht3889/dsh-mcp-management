# dsh-mcp-management

Out-of-tree MCP connection management for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Architecture and scope live in [docs/design.md](docs/design.md).

**Do not edit `deepseek-harness`.** This repository ships an installable profile bundle only.

## Install

From npm (after the packages are published):

```sh
npx @deepseek-ai/dsh plugin --profile web add @anht3889/dsh-mcp-mgmt-bundle@0.0.1-rc.1
```

From a local checkout (development):

```sh
pnpm install && pnpm run build
npx @deepseek-ai/dsh plugin --profile web add ./packages/bundle
```

Restart the Web profile after installation.

Do not also mount `@deepseek-ai/dsh-mcp-client` for the same `serverName`s — both register MCP tools and will conflict.

## Storage

| Data | Default path |
|---|---|
| Non-secret server records | `~/.dsh/mcp/servers.json` |
| Secrets (tokens, header values, client secret) | `~/.dsh/mcp/secrets.yaml`, or `ctx.credentials` when mounted |

Override with the manager plugin's `catalogPath` / `secretsPath` config.

## OAuth

Each server's callback URL is the live web origin plus that server's `auth.redirectPath` (default `/callback`). Set `publicOrigin` on the manager when the browser reaches the host through a different origin. Authorization servers match the redirect URI exactly; a pre-registered public client usually allows `/callback` on any loopback port. The manager serves every configured path. Authorize and token requests also send the MCP URL as the RFC 8707 `resource` indicator.

## Packages

| Package | Role |
|---|---|
| [`@anht3889/dsh-mcp-mgmt-bundle`](packages/bundle/) | Installable surface: patch, manager, Settings UI |
| [`@anht3889/dsh-mcp-mgmt-mcp`](packages/mcp/) | `ctx.mcp` vocabulary (library) |
| [`@anht3889/dsh-mcp-mgmt-oauth`](packages/mcp-oauth/) | PKCE OAuth + discovery (library) |

## Smoke check

1. `npx @deepseek-ai/dsh --profile web`
2. `curl http://127.0.0.1:3080/mcp-management/servers` returns a `servers` array
3. Open **Settings → MCP**, add and enable a stdio fixture, confirm tools as `mcp__<serverName>__<toolName>`
4. Optional: OAuth HTTP server → **Authorize** → login window completes and the row shows Connected
