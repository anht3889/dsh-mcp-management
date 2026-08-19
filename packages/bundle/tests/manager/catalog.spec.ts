import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog, saveCatalog, validateRecord } from '../../src/manager/catalog.ts'
import { asMcpServerId } from '@anht3889/dsh-mcp-mgmt-mcp/brand'

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

  it('refuses a stored record that is no longer valid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-cat-'))
    const path = join(dir, 'servers.json')
    const stale = {
      ...base(),
      auth: { kind: 'oauth', clientId: 'client', authorizeUrl: 'https://idp.example/authorize', tokenUrl: 'https://idp.example/token', scopes: [] },
    }
    await writeFile(path, JSON.stringify([stale]), 'utf8')

    await expect(loadCatalog(path)).rejects.toThrow(/redirectPath/)
  })

  it('rejects duplicate enabled serverName', () => {
    const a = base()
    const b = { ...base(), id: asMcpServerId('22222222-2222-4222-8222-222222222222') }
    expect(() => validateRecord(b, [a])).toThrow(/serverName/)
  })

  it('rejects a stdio command carrying its own flags, but not a path with spaces', () => {
    // Spawning does not split on whitespace, so the flags would become part of
    // the executable name and fail with a bare ENOENT.
    expect(() => validateRecord({ ...base(), command: '/opt/tci-mcp --cache-dir /tmp/tci' }, [])).toThrow(/args/)
    expect(() => validateRecord({ ...base(), command: '/Applications/My App/bin/server' }, [])).not.toThrow()
    expect(() => validateRecord({ ...base(), command: '/opt/tci-mcp', args: ['--cache-dir', '/tmp/tci'] }, [])).not.toThrow()
  })

  it('rejects args that are not strings', () => {
    expect(() => validateRecord({ ...base(), args: ['--flag', 7] as unknown as string[] }, [])).toThrow(/args/)
  })

  it('rejects an oauth record whose callback path is absent or relative', () => {
    const oauth = (redirectPath: unknown) => ({
      ...base(),
      auth: {
        kind: 'oauth' as const,
        clientId: 'client',
        authorizeUrl: 'https://idp.example/authorize',
        tokenUrl: 'https://idp.example/token',
        scopes: [],
        redirectPath: redirectPath as string,
      },
    })

    expect(() => validateRecord(oauth(undefined), [])).toThrow(/redirectPath/)
    expect(() => validateRecord(oauth('callback'), [])).toThrow(/redirectPath/)
    expect(() => validateRecord(oauth('/callback'), [])).not.toThrow()
  })
})
