# dsh-mcp-management

Out-of-tree MCP connection management for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Architecture and scope live in [docs/design.md](docs/design.md).

**Do not edit `deepseek-harness`.** This repository ships an installable profile bundle only.

## Install

From npm (after the packages are published):

```sh
npx @deepseek-ai/dsh plugin --profile web add @anht3889/dsh-mcp-mgmt-bundle@0.0.1-rc.2
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

## Publish to npm (GitHub Actions)

Yes — CI can build and publish. The repo includes:

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — install, build, test on push/PR
- [`.github/workflows/publish.yml`](.github/workflows/publish.yml) — publish on **workflow_dispatch** or when a **GitHub Release** is published

Both first run [`.github/actions/setup-workspace`](.github/actions/setup-workspace/action.yml), which checks out `deepseek-harness` as a sibling directory and runs its `build:lib`. That build is required: this workspace's `link:` dependencies and TypeScript project references resolve to harness `lib/types` declarations, which exist only after the harness is built.

### One-time setup

1. Create an npm [granular access token](https://www.npmjs.com/settings/~/tokens) with **Read and write** for `@anht3889/*` (or Automation classic token). Prefer a token that can publish without interactive OTP.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `NPM_TOKEN`
   - Value: the token
3. If `deepseek-ai/deepseek-harness` is private, add secret `HARNESS_TOKEN` (a PAT that can clone it). Public harness needs no extra secret.
4. Optional repo variables: `HARNESS_REPOSITORY` if the harness lives at another GitHub path (default `deepseek-ai/deepseek-harness`), and `HARNESS_REF` to pin a harness branch or tag instead of its default branch.

### Publish steps

1. Bump `version` in `packages/mcp`, `packages/mcp-oauth`, and `packages/bundle` (keep them aligned when the bundle depends on the libraries).
2. For the bundle, set dependency versions to the library versions you are releasing (not `workspace:`).
3. Commit and push.
4. Either:
   - **Actions → Publish npm → Run workflow**, or
   - Create a GitHub Release (triggers the same workflow).
5. Dry-run first if you want: enable the `dry_run` input on workflow_dispatch.

Prerelease versions (`x.y.z-rc.N`) publish under the `next` dist-tag; plain versions use `latest`. Already-published versions are skipped.
