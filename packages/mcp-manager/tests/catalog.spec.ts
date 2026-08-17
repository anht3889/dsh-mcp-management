import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog, saveCatalog, validateRecord } from '../src/catalog.ts'
import { asMcpServerId } from '@deepseek-ai/dsh-mcp-mgmt-mcp/src/brand.ts'

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
