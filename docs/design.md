# MCP Management for DeepSeek Harness — Design

**Date:** 2026-08-17  
**Repo:** `dsh-mcp-management` (out-of-tree only; **no** changes to `deepseek-harness`)

## Goal

Ship an installable DeepSeek Harness profile bundle that provides first-class MCP connection management in the Web Settings UI: add / update / delete / enable servers, view connection logs, and complete OAuth for HTTP MCP servers. This bundle is the supported MCP path (“full replace” of stock `@deepseek-ai/dsh-mcp-client` usage).

## Non-goals (v1)

- Any edit to the `deepseek-harness` repository (including apiproxy allowlists and `mcp-client`).
- Using Host `settings.*` wire APIs for this feature’s persistence or UI (those namespaces are allowlisted in-repo).
- MCP Resources / Prompts bridging.
- Dedicated full-page MCP route (Settings section only).
- Device-code OAuth; durable on-disk log files.
- Multi-user / remote (non-loopback) secret administration.

## Constraints

| Constraint | Implication |
|---|---|
| Zero harness source changes | Deliver as profile bundle + plugins only |
| Settings UI slot system exists | Register `settings.section`; no shell fork |
| Apiproxy settings allowlist fixed | UI ↔ Host via custom `/mcp-management/*` HTTP routes on `webserver` |
| Stock `mcp-client` has no CRUD/OAuth | This repo owns connection lifecycle and tool registration on `ctx.tools` |
| Default web/base bundles do not mount `mcp-client` | Document: do not also add `mcp-client` rows for managed servers |
| A profile plugin cannot resolve the installation's cordis | Seam types only; publish with `ctx.provide('mcp', runtime)`, never `extends Service` |
| The profile loader imports plugins by name from the profile directory | Mount plugins as exports of the installable bundle package |
| The sibling harness checkout ships no built JavaScript | Runtime harness dependencies use published releases; links stay type-only |

## Architecture

```text
┌─ browser (Settings → MCP) ─────────────────────────────┐
│  bundle/client  (dsh.client)                           │
│    list / details / tools / logs / edit / Authorize    │
└─────────────── HTTP /mcp-management/* ─────────────────┘
                         │
┌─ Host (profile bundle) ────────────────────────────────┐
│  bundle/manager → catalog, connections, tool bridge    │
│  mcp-oauth      → OAuth library used by the manager    │
│  mcp            → ctx.mcp vocabulary (types)           │
│       ├─ durable catalog  ($DSH_HOME/mcp/servers.json) │
│       ├─ secrets          (ctx.credentials when live)  │
│       ├─ ctx.tools.register(mcp__server__tool)         │
│       └─ ring buffer logs per server                   │
└────────────────────────────────────────────────────────┘
```

**Rules**

- Bundle inserts Host + client Loader rows; `client-modules` scans `dsh.client` packages into the browser roster.
- UI talks only to `/mcp-management/*`, never harness `settings.*`.
- Manager owns MCP end-to-end; stock `mcp-client` is unsupported alongside this bundle for the same servers.
- Public tool names stay `mcp__<serverName>__<rawName>` (same normalization contract as harness `mcp-client`).
- OAuth tokens and header secret values never appear in the durable catalog JSON.

## Package layout

```text
packages/
  bundle/                   # Installable surface: patch + ./manager + ./client
  mcp/                      # ctx.mcp vocabulary (library)
  mcp-oauth/                # OAuth + discovery (library)
```

**npm scope:** `@anht3889/dsh-mcp-mgmt-<name>` (personal publish scope; avoids collision with `@deepseek-ai/dsh-mcp-client`).

**Peers / deps (align to a documented harness release):** `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-host-webserver`, `@deepseek-ai/dsh-credentials` (optional at runtime), `@deepseek-ai/schemastery`, `@modelcontextprotocol/sdk`, client slot/UI peers as required by the Settings section pattern.

## Data model

### Durable catalog

Path: `$DSH_HOME/mcp/servers.json` — array of server records. Config only; no secrets.

```ts
type McpServerId = string // branded uuid in implementation

type McpServerRecord = {
  id: McpServerId
  serverName: string // [A-Za-z0-9_-]{1,32}, unique among enabled servers
  enabled: boolean
  transport: 'stdio' | 'streamable-http'
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string> // non-secret only
  cwd?: string
  // http
  url?: string
  auth:
    | { kind: 'none' }
    | { kind: 'headers'; headerNames: string[] }
    | {
        kind: 'oauth'
        clientId: string
        authorizeUrl: string
        tokenUrl: string
        scopes: string[]
      }
  disabledTools?: string[] // raw MCP tool names listed but never registered
  toolCallTimeoutMs: number
  reconnect: {
    enabled: boolean
    initialDelayMs: number
    maxDelayMs: number
    maxAttempts: number
  }
  createdAt: string
  updatedAt: string
}
```

### Secrets

Never stored in `servers.json`.

- Header values, OAuth `client_secret`, access/refresh tokens → `ctx.credentials` refs keyed by server id (e.g. `MCP_<id>_HEADER_AUTHORIZATION`, `MCP_<id>_OAUTH_REFRESH`, `MCP_<id>_OAUTH_ACCESS`).
- If `credentials` is not mounted: fall back to `$DSH_HOME/mcp/secrets.yaml` with the same logical ref names (documented limitation).

### Live status (in-memory)

```ts
type McpConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting'; attempt: number }
  | { state: 'connected'; toolCount: number; connectedAt: string }
  | { state: 'reconnecting'; attempt: number; nextDelayMs: number }
  | { state: 'failed'; error: string; at: string }
```

Everything that goes wrong before a connection's first successful tool registration counts as a failed attempt, never as a lost connection: the MCP client closes a client whose initialization failed, and crediting that close to a live connection would hide the error and retry at the initial delay without ever spending the reconnect budget. `error` carries the rejection's nested causes, because Node reports a TLS or DNS failure as `TypeError: fetch failed` and names the reason only in `cause`.

### Logs

Per-server ring buffer (v1: last 500 entries): `{ at, level: 'info' | 'warn' | 'error', message, detail? }`. Not durable across process restart.

### Listed tools (in-memory)

```ts
type McpToolInfo = { name: string; description: string; enabled: boolean }
```

Each server keeps the tools its most recent successful connection listed; `enabled` is derived from the record's `disabledTools`. A listing outlives a disconnect so tools can be selected before the server is reachable again, and is dropped when the record is replaced or removed.

### Service API (`ctx.mcp`)

Operations: `list`, `get`, `upsert`, `remove`, `setEnabled`, `connect`, `disconnect`, `getStatus`, `getLogs`, `getTools`, `setToolEnabled`, `startOAuth`, `clearOAuth`, plus secret write helpers used by the HTTP layer.

Events (for HTTP bridge / future push): `mcp/changed`, `mcp/status`, `mcp/log`.

## OAuth

Applies when `auth.kind === 'oauth'` (HTTP transport).

1. Fill the MCP HTTP **URL**, choose **OAuth**, then press **Discover from server URL**. The Host probes RFC 9728 protected-resource metadata and authorization-server metadata, fills authorize/token URLs (and scopes when advertised), and registers a public client when the IdP exposes Dynamic Client Registration.
2. **Authorize** opens a blank login window inside the click handler — a window opened after the `await` would be blocked as unrequested — then calls `POST /mcp-management/servers/:id/oauth/start`. The Host builds the authorize URL with PKCE, stores pending state, and returns `{ authorizeUrl }`, which the UI loads into the waiting window. A blocked window degrades to an `Open login page` link.
3. The operator signs in; the IdP redirects the login window to the server's configured callback path with `?code&state` — `/callback` by default, and the manager serves a route for every path in use.
4. The Host exchanges the code at `tokenUrl`, stores tokens via credentials, and auto-connects if `enabled`.
5. The callback answers a browser navigation with a completion page that posts `dsh-mcp-management/oauth` to its opener and closes itself; the section refreshes on that message instead of waiting for its poll. Other clients still receive JSON. A failed exchange renders the reason in the login window and in the server row.
6. On 401 / expiry: refresh; failure → `failed` + UI “Re-authorize”.
7. `POST .../oauth/clear` drops tokens and disconnects until re-authorized.

**v1 assumptions:** authorization-code + PKCE; optional confidential client via stored `client_secret`; redirect URI formed from the live webserver origin (loopback) plus the server's `auth.redirectPath`. No device-code flow.

The redirect path is per server because an authorization server compares the redirect URI to the client registration verbatim and otherwise answers `redirect_uri not allowed for this client`: a pre-registered public client accepts only the path it was registered for, while a Dynamic Client Registration client accepts the default. Authorization and token requests carry the MCP endpoint URL as the RFC 8707 `resource` indicator, which the MCP authorization specification requires so the token is audience-restricted.

## HTTP API

Prefix: `/mcp-management` on `ctx` webserver. Loopback-trusted like the rest of the web host. No secret values in GET bodies — only `{ configured: boolean }` flags.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/servers` | Catalog + status summary |
| `GET` | `/servers/:id` | Record + status + log tail |
| `PUT` | `/servers/:id` | Upsert (create if new id) |
| `DELETE` | `/servers/:id` | Remove, disconnect, drop secrets |
| `POST` | `/servers/:id/enable` | Enable + connect |
| `POST` | `/servers/:id/disable` | Disable + disconnect |
| `POST` | `/servers/:id/connect` | Manual connect |
| `POST` | `/servers/:id/disconnect` | Manual disconnect |
| `GET` | `/servers/:id/logs?after=` | Ring-buffer poll |
| `POST` | `/servers/:id/tools/:name/enable` | Register a listed tool |
| `POST` | `/servers/:id/tools/:name/disable` | Withhold a listed tool (404 for a name the server never listed) |
| `POST` | `/servers/:id/oauth/start` | Begin OAuth |
| `POST` | `/servers/:id/oauth/clear` | Clear local tokens |
| `POST` | `/oauth/discover` | Fill OAuth fields from MCP URL |
| `GET` | `/oauth/callback` | IdP redirect (also served at each server's configured path, such as `/callback`) |
| `PUT` | `/servers/:id/secrets` | Write-only secret values |

## Tool bridge

On successful connect: `listTools` → register each selected tool on `ctx.tools` under `mcp__<serverName>__<rawName>` (apply the same 64-char / hash-suffix normalization rules as harness `mcp-client`). Execute calls the MCP server with the **raw** tool name. Disconnect, disable, remove, or exhausted reconnect budget unregisters the generation. Re-sync / reconnect replaces rather than accumulates.

A tool named in `disabledTools` is reported to the UI but never registered. Changing the selection re-registers over the live transport instead of reconnecting, because a reconnect would restart a stdio server's process; a server that then fails to re-list its tools is closed so the supervisor reconnects, and the error reaches the caller.

## Settings UI

- Nav section **MCP** via `settings.section`.
- **List:** one full-width row per server. The name line carries the Enabled switch; a summary line carries transport, status, and enabled/listed tool counts. Authorize is the only row action, and only while an OAuth server holds no access token. The rest of the row opens the details dialog.
- **Details dialog:** Enabled switch, one switch per listed tool, Reload (`POST .../connect`), the connection logs behind a disclosure, then Edit configuration, Log out (OAuth servers holding a token), Delete, and Done.
- **Switch, not checkbox:** every toggle in the list and details dialog applies immediately, so it reads as state rather than a selection staged for a later Save. The editor keeps checkboxes because its draft is applied by Save.
- **Editor:** a `Modal` dialog from `@deepseek-ai/dsh-client-ui-primitives` (a platform module the web shell shares, so the bundle imports it as an external). stdio vs HTTP fields; auth kind; write-only secret controls; tool timeout and reconnect fields behind an Advanced disclosure; Save → `PUT` (+ connect when enabled). Escape, the mask, and Cancel all discard the draft.
- **Delete:** a confirmation dialog naming the server; the `DELETE` request is issued only after it is accepted. Opening it, or the editor, closes the details dialog rather than stacking dialogs.
- **Logs:** poll with `?after=` while the disclosure is open; clear is UI-local in v1.
- Poll list/status ~2s while the section is open, which is also what keeps an open details dialog current.
- Authorize opens `authorizeUrl` in a new tab; UI polls until connected or failed.
- Chinese product copy; CSS Modules + `--dsw-*` tokens; no new component library.

## Install

1. Add the bundle to the `web` profile (`dsh plugin --profile web add <bundle-package>` or manual profile `dependencies` + `dsh.profile.bundles`).
2. Bundle patch inserts `…/manager` and the package root (UI host stub with `dsh.client`).
3. Restart (or Loader HMR) → Settings shows **MCP**.
4. README warning: do not also mount `@deepseek-ai/dsh-mcp-client` for the same `serverName`s.

## Testing

| Layer | Coverage |
|---|---|
| Unit | Catalog CRUD, naming, reconnect budget, OAuth state machine, secret redaction |
| Host integration | Mini cordis tree with `tools` + fake MCP server; register/unregister tools |
| Client | jsdom list/editor/logs against mocked `fetch` |
| Manual | Linked workspace bundle under `dsh --profile web` |

## Error handling (summary)

- Catalog I/O / validation failures: fail loud at write; keep last-good catalog in memory.
- Connect / discovery failure: `failed` status + error log; tools unregistered for that server.
- Registration conflict on `serverName` or foreign tool squat: refuse connect, log error (parity with harness loud-fail posture).
- OAuth state mismatch / exchange failure: `failed` + clear pending state; tokens unchanged.
- Missing webserver: Host manager still runs headless connect-from-catalog; UI and OAuth callback unavailable (document).
- Server behind a private certificate authority: `failed` with the TLS cause, until the manager's `trustSystemCertificates` config adds the host's authorities to Node's bundled ones. The trust store is process-global, so the config defaults to off and a Node build without `tls.setDefaultCACertificates` fails loud at load rather than connecting on bundled trust alone.

## Success criteria

1. With only this bundle installed (no harness edits), Web Settings shows an MCP section that can CRUD servers and show live status/logs.
2. Enabled stdio and HTTP servers expose tools to the model under `mcp__…` names.
3. OAuth HTTP servers can authorize via browser redirect and keep tokens out of `servers.json`.
4. Disabling or deleting a server removes its tools from `ctx.tools`; disabling one tool removes only that tool and survives a restart.
5. README documents coexistence rule vs stock `mcp-client`.
