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
    const store = createSecretStore({
      filePath: join(directory, 'secrets.yaml'),
      credentials: {
        async resolve(ref) {
          const value = values.get(ref)
          return value === undefined ? undefined : { value }
        },
        async describe(ref) {
          return { configured: values.has(ref) }
        },
        async set(ref, value) {
          values.set(ref, value)
        },
        async unset(ref) {
          values.delete(ref)
        },
      },
    })

    await store.set(serverId, 'oauth_access', 'access-token')

    expect(await store.get(serverId, 'oauth_access')).toBe('access-token')
    await expect(readFile(join(directory, 'secrets.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    await store.wipeServer(serverId)

    expect(await store.get(serverId, 'oauth_access')).toBeUndefined()
  })
})
