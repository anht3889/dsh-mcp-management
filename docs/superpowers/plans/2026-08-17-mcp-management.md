# MCP Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an out-of-tree DeepSeek Harness profile bundle that manages MCP connections (CRUD, logs, OAuth) from a Settings UI section, registering tools on `ctx.tools` without modifying `deepseek-harness`.

**Architecture:** Five packages — `mcp` (Service Definition), `mcp-manager` (catalog + connections + tool bridge + HTTP), `mcp-oauth` (PKCE OAuth), `client-ui-settings-mcp` (Settings section), `bundle` (installable patch). UI talks to `/mcp-management/*` on `webserver`; secrets stay out of `servers.json`.

**Tech Stack:** TypeScript ESM, pnpm workspaces, Cordis plugins, Vitest, `@modelcontextprotocol/sdk` ^1.12, React + harness client slots (`dsh.client`), schemastery.

**Spec:** [docs/superpowers/specs/2026-08-17-mcp-management-design.md](../specs/2026-08-17-mcp-management-design.md)

## Global Constraints

- **Zero edits** to `/Users/anhtra/workspace/deepseek-harness` (or any published harness source).
- Package names: `@deepseek-ai/dsh-mcp-mgmt-<name>` only.
- Tool public names: `mcp__<serverName>__<rawName>` with the same 64-char / hash-suffix rules as harness `mcp-client`.
- No Host `settings.*` apiproxy usage for this feature’s data.
- Product UI copy: Chinese; code comments: English.
- Node: `^22.19 || >=24`; packageManager: `pnpm@11.7.0`.
- Catalog path: `$DSH_HOME/mcp/servers.json`; secrets via `ctx.credentials` or `$DSH_HOME/mcp/secrets.yaml` fallback.
- Do not mount stock `@deepseek-ai/dsh-mcp-client` for the same servers (document in README).

## File map (create)

```text
package.json                          # pnpm workspace root
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
README.md
packages/mcp/
  package.json, tsconfig.json
  src/index.ts, types.ts, brand.ts
  tests/mcp-service.spec.ts
packages/mcp-manager/
  package.json, tsconfig.json
  src/index.ts, catalog.ts, secrets.ts, naming.ts, tools.ts
  src/connection.ts, http-api.ts, logs.ts
  tests/*.spec.ts
packages/mcp-oauth/
  package.json, tsconfig.json
  src/index.ts, pkce.ts, pending.ts
  tests/oauth.spec.ts
packages/client-ui-settings-mcp/
  package.json, tsconfig.json, tsdown.config.ts
  src/index.ts, invariant.ts
  src/client/index.ts, McpSection.tsx, store.ts, locales.ts, api.ts
  src/client/*.module.css
  tests/*.client.spec.ts(x)
packages/bundle/
  package.json
  cordis.patch.yml
  src/index.ts                      # empty / re-export marker if needed
  README.md
```

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `README.md`

**Interfaces:**
- Consumes: none
- Produces: runnable `pnpm install` / `pnpm test` (empty suite OK)

- [ ] **Step 1: Write root manifests**

`package.json`:

```json
{
  "name": "dsh-mcp-management",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.7.0",
  "engines": { "node": "^22.19 || >=24" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -b",
    "build": "pnpm -r run build"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`.gitignore`: `node_modules`, `lib`, `dist`, `*.tsbuildinfo`, `.DS_Store`.

- [ ] **Step 2: Add base tsconfig + vitest**

`tsconfig.base.json` — `strict: true`, `module`/`moduleResolution`: `NodeNext`, `target`: `ES2022`, `declaration`: true, `skipLibCheck`: true.

`vitest.config.ts` — include `packages/*/tests/**/*.spec.ts`.

- [ ] **Step 3: Root README stub**

State: out-of-tree MCP management for DeepSeek Harness; link the design spec; “do not edit deepseek-harness”; install via profile bundle (details filled in Task 11).

- [ ] **Step 4: Install and verify**

```bash
cd /Users/anhtra/workspace/dsh-mcp-management && pnpm install && pnpm test
```

Expected: install OK; vitest exits 0 with no tests (or “no test files”).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore README.md pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: scaffold pnpm workspace for MCP management

EOF
)"
```

---

### Task 2: `@deepseek-ai/dsh-mcp-mgmt-mcp` Service Definition

**Files:**
- Create: `packages/mcp/package.json`, `tsconfig.json`, `src/types.ts`, `src/brand.ts`, `src/index.ts`, `tests/mcp-service.spec.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/cordis` (peer), `@deepseek-ai/schemastery`
- Produces:
  - `McpServerId` branded string helpers `asMcpServerId(s: string): McpServerId`
  - Types: `McpServerRecord`, `McpConnectionStatus`, `McpLogEntry`, `McpAuthConfig` (exact shapes from the spec)
  - `class McpRuntime extends Service` on `ctx.mcp` with methods declared below (manager implements by subclass or by providing the service instance)

```ts
// Method signatures the manager must satisfy
interface McpRuntimeApi {
  list(): McpServerRecord[]
  get(id: McpServerId): McpServerRecord | undefined
  upsert(record: McpServerRecord): Promise<McpServerRecord>
  remove(id: McpServerId): Promise<void>
  setEnabled(id: McpServerId, enabled: boolean): Promise<void>
  connect(id: McpServerId): Promise<void>
  disconnect(id: McpServerId): Promise<void>
  getStatus(id: McpServerId): McpConnectionStatus
  getLogs(id: McpServerId, after?: number): { next: number; entries: McpLogEntry[] }
  startOAuth(id: McpServerId): Promise<{ authorizeUrl: string }>
  clearOAuth(id: McpServerId): Promise<void>
  setSecrets(id: McpServerId, secrets: Record<string, string>): Promise<void>
}
```

- [ ] **Step 1: Write failing test for brand + type exports**

```ts
import { describe, it, expect } from 'vitest'
import { asMcpServerId, SERVER_NAME_PATTERN } from '../src/brand.ts'

describe('McpServerId', () => {
  it('accepts uuid-shaped ids', () => {
    const id = asMcpServerId('11111111-1111-4111-8111-111111111111')
    expect(id).toBe('11111111-1111-4111-8111-111111111111')
  })
  it('rejects empty', () => {
    expect(() => asMcpServerId('')).toThrow(/McpServerId/)
  })
})

describe('SERVER_NAME_PATTERN', () => {
  it('matches harness serverName rules', () => {
    expect(SERVER_NAME_PATTERN.test('github')).toBe(true)
    expect(SERVER_NAME_PATTERN.test('bad name')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/mcp/tests/mcp-service.spec.ts
```

Expected: cannot resolve module / pattern not found.

- [ ] **Step 3: Implement types + brand + stub Service**

`src/brand.ts`: `SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`, `asMcpServerId`.

`src/types.ts`: copy record/status/log/auth unions from the spec (no runtime code).

`src/index.ts`: default-export `McpRuntime` Service class that throws `MCP_NOT_PROVIDED` on every mutating method until the manager mounts (or export only types + abstract API and let manager `ctx.provide('mcp', …)` — prefer **default-export Service** with abstract methods throwing, manager replaces via providing subclass instance).

Declare:

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    mcp: McpRuntime
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp
git commit -m "$(cat <<'EOF'
feat(mcp): add MCP management service types and brand helpers

EOF
)"
```

---

### Task 3: Catalog persistence

**Files:**
- Create: `packages/mcp-manager/src/catalog.ts`, `tests/catalog.spec.ts`
- Create: `packages/mcp-manager/package.json`, `tsconfig.json` (minimal)

**Interfaces:**
- Consumes: `McpServerRecord`, `McpServerId`, `SERVER_NAME_PATTERN` from `@deepseek-ai/dsh-mcp-mgmt-mcp`
- Produces:
  - `loadCatalog(path: string): Promise<McpServerRecord[]>`
  - `saveCatalog(path: string, records: readonly McpServerRecord[]): Promise<void>`
  - `validateRecord(record: McpServerRecord, existing: readonly McpServerRecord[]): void` — throws on bad `serverName`, duplicate enabled `serverName`, missing transport fields

- [ ] **Step 1: Failing tests**

```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadCatalog, saveCatalog, validateRecord } from '../src/catalog.ts'
import { asMcpServerId } from '@deepseek-ai/dsh-mcp-mgmt-mcp'

const base = () => ({
  id: asMcpServerId('11111111-1111-4111-8111-111111111111'),
  serverName: 'github',
  enabled: true,
  transport: 'stdio' as const,
  command: 'npx',
  args: [],
  env: {},
  cwd: '',
  auth: { kind: 'none' as const },
  toolCallTimeoutMs: 60_000,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('catalog', () => {
  it('round-trips JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-cat-'))
    const path = join(dir, 'servers.json')
    await saveCatalog(path, [base()])
    const loaded = await loadCatalog(path)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.serverName).toBe('github')
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([base()])
  })
  it('returns [] when file missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-cat-'))
    expect(await loadCatalog(join(dir, 'missing.json'))).toEqual([])
  })
  it('rejects duplicate enabled serverName', () => {
    const a = base()
    const b = { ...base(), id: asMcpServerId('22222222-2222-4222-8222-222222222222') }
    expect(() => validateRecord(b, [a])).toThrow(/serverName/)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `catalog.ts`** — atomic write (write temp + rename); validate transport-required fields; never write secret fields.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-manager
git commit -m "$(cat <<'EOF'
feat(mcp-manager): persist MCP server catalog to JSON

EOF
)"
```

---

### Task 4: Tool naming + bridge helpers

**Files:**
- Create: `packages/mcp-manager/src/naming.ts`, `src/tools.ts`, `tests/naming.spec.ts`

**Interfaces:**
- Consumes: `ctx.tools` (`@deepseek-ai/dsh-tools`), MCP SDK `Client`
- Produces:
  - `publicToolName(serverName: string, rawName: string): string` — identical algorithm to harness `mcp-client` (`mcp__…`, invalid chars → `_`, truncate + 12-hex sha256 of `serverName\0rawName`)
  - `syncTools(ctx, client, opts): Promise<Map<string, () => void>>` — list tools, register, return disposers

- [ ] **Step 1: Failing naming tests (pin harness-compatible vectors)**

```ts
import { describe, it, expect } from 'vitest'
import { publicToolName } from '../src/naming.ts'

describe('publicToolName', () => {
  it('keeps clean names', () => {
    expect(publicToolName('github', 'create_issue')).toBe('mcp__github__create_issue')
  })
  it('hashes when normalized', () => {
    const name = publicToolName('srv', 'admin reset!')
    expect(name).toMatch(/^mcp__srv__admin_reset_[0-9a-f]{12}$/)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement naming + minimal `syncTools`** (register with raw JSON schema; execute via `client.callTool` with raw name; honor `toolCallTimeoutMs` + `exec.signal`). Port behavior from harness `packages/mcp/mcp-client/src/tools.ts` by reimplementation in this repo (do not import harness package sources as a file dependency that requires editing harness).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-manager/src/naming.ts packages/mcp-manager/src/tools.ts packages/mcp-manager/tests/naming.spec.ts
git commit -m "$(cat <<'EOF'
feat(mcp-manager): add MCP public tool naming and sync helpers

EOF
)"
```

---

### Task 5: Log ring buffer + connection supervisor

**Files:**
- Create: `packages/mcp-manager/src/logs.ts`, `src/connection.ts`, `src/transport.ts`, `tests/logs.spec.ts`, `tests/connection.spec.ts`

**Interfaces:**
- Consumes: `McpServerRecord`, `McpLogEntry`, `McpConnectionStatus`, MCP SDK transports
- Produces:
  - `createLogBuffer(capacity = 500)` → `{ append, read(after?: number), clear }`
  - `startConnection(record, hooks): { stop(): Promise<void> }` — connect, sync tools, reconnect with exponential backoff per record.reconnect; emit status/log via hooks
  - `createTransport(record, resolveHeaders: () => Promise<Record<string, string>>)`

- [ ] **Step 1: Failing log tests**

```ts
it('rings and supports after cursor', () => {
  const buf = createLogBuffer(3)
  buf.append({ at: '1', level: 'info', message: 'a' })
  buf.append({ at: '2', level: 'info', message: 'b' })
  buf.append({ at: '3', level: 'info', message: 'c' })
  buf.append({ at: '4', level: 'info', message: 'd' })
  const page = buf.read(0)
  expect(page.entries.map(e => e.message)).toEqual(['b', 'c', 'd'])
})
```

- [ ] **Step 2: Implement logs — PASS**

- [ ] **Step 3: Failing reconnect test with mocked transport** — simulate close → reconnecting → connected; after `maxAttempts` consecutive failures → `failed` and tools disposed.

- [ ] **Step 4: Implement connection supervisor + transport factory (stdio + streamable-http)**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mcp-manager): add log buffer and connection supervisor

EOF
)"
```

---

### Task 6: Secrets store

**Files:**
- Create: `packages/mcp-manager/src/secrets.ts`, `tests/secrets.spec.ts`

**Interfaces:**
- Produces:
  - `createSecretStore(opts: { credentials?: CredentialsApi; filePath: string })`
  - Methods: `set(id, key, value)`, `get(id, key)`, `unset(id, key)`, `describe(id, key): { configured: boolean }`, `wipeServer(id)`
  - Credential ref naming: `MCP_<idWithoutDashes>_<KEY>` uppercase

- [ ] **Step 1: Tests** — file fallback round-trip; `describe` never returns values; wipe removes all keys for id.

- [ ] **Step 2: Implement** — prefer `ctx.credentials` when `ctx.get('credentials')` exists; else YAML/JSON file under `$DSH_HOME/mcp/secrets.yaml` with mode `0600` when possible.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mcp-manager): add credential-backed MCP secret store

EOF
)"
```

---

### Task 7: `@deepseek-ai/dsh-mcp-mgmt-oauth`

**Files:**
- Create: `packages/mcp-oauth/**`

**Interfaces:**
- Consumes: server `auth.kind === 'oauth'` fields; secret store for tokens
- Produces:
  - `createOAuthController(opts)` with:
    - `start(id): Promise<{ authorizeUrl: string }>` — PKCE S256, store `{ state, codeVerifier, id, createdAt }`
    - `handleCallback(query): Promise<{ serverId }>` — validate state, exchange code, store tokens
    - `authorizeHeader(id): Promise<string | undefined>` — Bearer access token; refresh if expired
    - `clear(id): Promise<void>`
  - Redirect path constant: `/mcp-management/oauth/callback`

- [ ] **Step 1: PKCE unit tests** — verifier length; challenge = base64url(sha256(verifier)).

- [ ] **Step 2: Callback success/failure tests** with mocked `fetch` to tokenUrl.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mcp-oauth): add PKCE OAuth controller for MCP HTTP servers

EOF
)"
```

---

### Task 8: Manager plugin + `ctx.mcp` implementation

**Files:**
- Create: `packages/mcp-manager/src/index.ts`, `src/runtime.ts`, `tests/runtime.spec.ts`

**Interfaces:**
- Consumes: catalog, connection, secrets, oauth, tools sync
- Produces: Cordis function plugin `{ name, inject, Config, apply }` that constructs `McpRuntime` and `ctx.provide('mcp', runtime)` (or mounts Service), auto-connects `enabled` servers on boot, disposes all on fiber dispose

`Config`:

```ts
{
  catalogPath?: string  // default dshHomePath('mcp', 'servers.json') via !!js in patch
  secretsPath?: string  // default dshHomePath('mcp', 'secrets.yaml')
}
```

`inject`: `['tools']` plus optional `credentials`, `httpServer` (webserver service name as used by harness — verify exact inject key from `@deepseek-ai/dsh-host-webserver` before coding; use that string).

- [ ] **Step 1: Integration test** — hand-built Context with tools mock + fake MCP server (can adapt pattern from harness `mcp-client` tests with vi.mock of SDK); `upsert` + `connect` → tool registered; `disconnect` → gone.

- [ ] **Step 2: Implement runtime**

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mcp-manager): wire ctx.mcp runtime with connect and tool bridge

EOF
)"
```

---

### Task 9: HTTP API routes

**Files:**
- Create: `packages/mcp-manager/src/http-api.ts`, `tests/http-api.spec.ts`

**Interfaces:**
- Consumes: `ctx.mcp`, webserver `register({ kind: 'prefix', path: '/mcp-management', handler })`
- Produces: disposer that unregisters routes; JSON request/response matching the spec table

- [ ] **Step 1: Tests with mock IncomingMessage/ServerResponse or undici against a tiny http server** covering:
  - `GET /mcp-management/servers` → list
  - `PUT /mcp-management/servers/:id` → upsert
  - `GET` never includes secret values
  - `PUT .../secrets` sets configured flags
  - Unknown path → 404

- [ ] **Step 2: Implement router** (pathname strip, method dispatch, JSON body parse, map domain errors → 4xx)

- [ ] **Step 3: Call `registerHttpApi(ctx)` from manager `apply` when webserver present; no-op with log if absent

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mcp-manager): expose /mcp-management HTTP API for the Settings UI

EOF
)"
```

---

### Task 10: Settings UI (`client-ui-settings-mcp`)

**Files:**
- Create: `packages/client-ui-settings-mcp/**` dual-face package (`dsh.client` in package.json, `./client` export, Host stub `apply`)

**Interfaces:**
- Consumes: `slots`, `locale`; fetches `/mcp-management/*` via `connection` origin or relative URLs on same host
- Produces: `settings.section` registration id `mcp`, order ~40

- [ ] **Step 1: Package skeleton** matching harness client checklist (`package.json` with `dsh.client: { platform: 'web', inject: [...] }`, `tsdown` client bundle, empty Host `src/index.ts`, invariant companion with `No runtime invariant: …` reason).

- [ ] **Step 2: `api.ts` client** — typed wrappers for list/upsert/delete/enable/logs/oauth/secrets.

- [ ] **Step 3: Failing jsdom test** — render list with mocked fetch returning one server; assert serverName visible.

- [ ] **Step 4: Implement `McpSection.tsx` + store (poll 2s) + locales zh/en + CSS modules using `--dsw-*` tokens only.

- [ ] **Step 5: Editor + logs + OAuth button (open authorizeUrl via `window.open`)

- [ ] **Step 6: `pnpm exec vitest run packages/client-ui-settings-mcp` PASS

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add MCP Settings section for connection management

EOF
)"
```

---

### Task 11: Bundle + install docs

**Files:**
- Create: `packages/bundle/package.json`, `cordis.patch.yml`, `README.md`
- Modify: root `README.md`

**Interfaces:**
- Produces: installable bundle with `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`

`cordis.patch.yml` (illustrative — adjust inject/service names to match Task 8):

```yaml
- insert:
    - id: mcp-mgmt-mcp
      name: '@deepseek-ai/dsh-mcp-mgmt-mcp'
    - id: mcp-mgmt-oauth
      name: '@deepseek-ai/dsh-mcp-mgmt-oauth'
    - id: mcp-mgmt-manager
      name: '@deepseek-ai/dsh-mcp-mgmt-manager'
      config:
        catalogPath: !!js dshHomePath('mcp', 'servers.json')
        secretsPath: !!js dshHomePath('mcp', 'secrets.yaml')
    - id: mcp-mgmt-ui
      name: '@deepseek-ai/dsh-mcp-mgmt-client-ui-settings-mcp'
```

- [ ] **Step 1: Write bundle package.json** depending on the four runtime packages.

- [ ] **Step 2: Document install**

```sh
# from a machine with dsh installed; link or npm pack this workspace
dsh plugin --profile web add @deepseek-ai/dsh-mcp-mgmt-bundle
# or: add bundle to profile package.json dependencies + dsh.profile.bundles
```

Warn: do not also add `@deepseek-ai/dsh-mcp-client` rows for the same `serverName`.

- [ ] **Step 3: Manual smoke checklist in README** — enable web profile with linked packages; open Settings → MCP; add a stdio fixture server; confirm tool appears in a turn; OAuth path optional if no IdP.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(bundle): add installable dsh profile patch for MCP management

EOF
)"
```

---

### Task 12: End-to-end host smoke (automated)

**Files:**
- Create: `packages/mcp-manager/tests/e2e-loader.spec.ts` (or `tests/smoke.spec.ts`)

**Interfaces:**
- Boots a minimal cordis tree: tools + webserver + manager (+ oauth), hits HTTP API with `fetch`, asserts catalog + connect against in-process fixture MCP server.

- [ ] **Step 1: Write smoke test**

- [ ] **Step 2: Run full `pnpm test` + `pnpm typecheck`**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
test: add MCP management host HTTP smoke coverage

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Out-of-tree only / no harness edits | Global + all tasks |
| Package seam mcp / manager / oauth / ui / bundle | Tasks 2–11 |
| Catalog `$DSH_HOME/mcp/servers.json` | Task 3, 8, 11 |
| Secrets via credentials / file fallback | Task 6 |
| Status + ring logs | Task 5 |
| `ctx.mcp` API | Tasks 2, 8 |
| OAuth PKCE + callback | Tasks 7, 9 |
| `/mcp-management/*` API | Task 9 |
| Tool bridge `mcp__…` | Tasks 4, 5, 8 |
| Settings section UI | Task 10 |
| Bundle install + mcp-client warning | Task 11 |
| Tests | Tasks 2–10, 12 |

No TBD placeholders remain in task steps. Types/names use `McpServerRecord`, `publicToolName`, `/mcp-management` consistently.
