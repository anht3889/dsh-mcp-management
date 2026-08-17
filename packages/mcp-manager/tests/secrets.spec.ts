import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSecretStore } from '../src/secrets.ts'

const serverId = '11111111-1111-4111-8111-111111111111'

describe('createSecretStore', () => {
  it('round-trips secrets through the fallback file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-secrets-'))
    const filePath = join(directory, 'secrets.yaml')
    const store = createSecretStore({ filePath })

    await store.set(serverId, 'header_authorization', 'Bearer secret')

    expect(await store.get(serverId, 'header_authorization')).toBe('Bearer secret')
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      MCP_11111111111141118111111111111111_HEADER_AUTHORIZATION: 'Bearer secret',
    })
  })

  it('describes configured state without exposing a secret value', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-secrets-'))
    const store = createSecretStore({ filePath: join(directory, 'secrets.yaml') })
    await store.set(serverId, 'oauth_access', 'access-token')

    expect(await store.describe(serverId, 'oauth_access')).toEqual({ configured: true })
  })

  it('keeps concurrent fallback secret writes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-secrets-'))
    const filePath = join(directory, 'secrets.yaml')
    const store = createSecretStore({ filePath })

    await Promise.all([
      store.set(serverId, 'oauth_access', 'access-token'),
      store.set(serverId, 'oauth_refresh', 'refresh-token'),
    ])

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      MCP_11111111111141118111111111111111_OAUTH_ACCESS: 'access-token',
      MCP_11111111111141118111111111111111_OAUTH_REFRESH: 'refresh-token',
    })
  })

  it('removes every secret belonging to a server', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-secrets-'))
    const store = createSecretStore({ filePath: join(directory, 'secrets.yaml') })
    await store.set(serverId, 'oauth_access', 'access-token')
    await store.set(serverId, 'oauth_refresh', 'refresh-token')
    await store.set('22222222-2222-4222-8222-222222222222', 'oauth_access', 'other-token')

    await store.wipeServer(serverId)

    await expect(store.get(serverId, 'oauth_access')).resolves.toBeUndefined()
    await expect(store.get(serverId, 'oauth_refresh')).resolves.toBeUndefined()
    await expect(store.get('22222222-2222-4222-8222-222222222222', 'oauth_access')).resolves.toBe('other-token')
  })

  it('uses credentials instead of the fallback file when available', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-secrets-'))
    const values = new Map<string, string>()
    const credentials = {
      async resolve(ref: string) {
        const value = values.get(ref)
        return value === undefined ? undefined : { value }
      },
      async describe(ref: string) {
        return { configured: values.has(ref) }
      },
      async set(ref: string, value: string) {
        values.set(ref, value)
      },
      async unset(ref: string) {
        values.delete(ref)
      },
    }
    const filePath = join(directory, 'secrets.yaml')
    const store = createSecretStore({
      filePath,
      credentials,
    })

    await store.set(serverId, 'oauth_access', 'access-token')

    expect(await store.get(serverId, 'oauth_access')).toBe('access-token')
    expect(await readFile(`${filePath}.index.json`, 'utf8')).not.toContain('access-token')

    await store.wipeServer(serverId)

    expect(await store.get(serverId, 'oauth_access')).toBeUndefined()
  })

  it('wipes credential-backed secrets after recreating the store', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-secrets-'))
    const filePath = join(directory, 'secrets.yaml')
    const values = new Map<string, string>()
    const credentials = {
      async resolve(ref: string) {
        const value = values.get(ref)
        return value === undefined ? undefined : { value }
      },
      async describe(ref: string) {
        return { configured: values.has(ref) }
      },
      async set(ref: string, value: string) {
        values.set(ref, value)
      },
      async unset(ref: string) {
        values.delete(ref)
      },
    }
    const first = createSecretStore({ credentials, filePath })
    await first.set(serverId, 'oauth_access', 'access-token')

    const second = createSecretStore({ credentials, filePath })
    await second.wipeServer(serverId)

    await expect(second.describe(serverId, 'oauth_access')).resolves.toEqual({ configured: false })
  })
})
