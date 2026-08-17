import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createOAuthController,
  createPkce,
  OAUTH_REDIRECT_PATH,
  type SecretStore,
} from '../src/index.ts'

const serverId = '11111111-1111-4111-8111-111111111111'
const redirectUri = `http://127.0.0.1:3000${OAUTH_REDIRECT_PATH}`

describe('createPkce', () => {
  it('creates an RFC 7636 verifier and S256 challenge', () => {
    const { codeVerifier, codeChallenge } = createPkce()

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(codeChallenge).toBe(createHash('sha256').update(codeVerifier).digest('base64url'))
  })
})

describe('createOAuthController', () => {
  it('exchanges a matching callback code and stores returned tokens', async () => {
    const secrets = createMemorySecretStore()
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://idp.example.test/token')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' })
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('code')).toBe('authorization-code')
      expect(body.get('client_id')).toBe('client-id')
      expect(body.get('redirect_uri')).toBe(redirectUri)
      expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
      return Response.json({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      })
    }
    const controller = createOAuthController({
      getServer: getOAuthServer,
      secrets,
      redirectUri,
      fetch,
      now: () => new Date('2026-08-17T00:00:00.000Z'),
    })

    const { authorizeUrl } = await controller.start(serverId)
    const state = new URL(authorizeUrl).searchParams.get('state')
    const result = await controller.handleCallback({ code: 'authorization-code', state: state ?? '' })

    expect(result).toEqual({ serverId })
    expect(await secrets.get(serverId, 'OAUTH_ACCESS')).toBe('access-token')
    expect(await secrets.get(serverId, 'OAUTH_REFRESH')).toBe('refresh-token')
    expect(await secrets.get(serverId, 'OAUTH_EXPIRES_AT')).toBe('2026-08-17T01:00:00.000Z')
  })

  it('rejects a failed token exchange without storing tokens', async () => {
    const secrets = createMemorySecretStore()
    const controller = createOAuthController({
      getServer: getOAuthServer,
      secrets,
      redirectUri,
      fetch: async () => new Response('invalid authorization code', { status: 400 }),
    })

    const { authorizeUrl } = await controller.start(serverId)
    const state = new URL(authorizeUrl).searchParams.get('state')

    await expect(
      controller.handleCallback({ code: 'invalid-code', state: state ?? '' }),
    ).rejects.toThrow('OAuth token exchange failed: 400 invalid authorization code')
    await expect(secrets.get(serverId, 'OAUTH_ACCESS')).resolves.toBeUndefined()
  })
})

function getOAuthServer(id: string) {
  if (id !== serverId) return undefined
  return {
    id,
    auth: {
      kind: 'oauth' as const,
      clientId: 'client-id',
      authorizeUrl: 'https://idp.example.test/authorize',
      tokenUrl: 'https://idp.example.test/token',
      scopes: ['mcp:read', 'mcp:write'],
    },
  }
}

function createMemorySecretStore(): SecretStore {
  const values = new Map<string, string>()
  return {
    async set(id, key, value) {
      values.set(`${id}:${key}`, value)
    },
    async get(id, key) {
      return values.get(`${id}:${key}`)
    },
    async unset(id, key) {
      values.delete(`${id}:${key}`)
    },
    async describe(id, key) {
      return { configured: values.has(`${id}:${key}`) }
    },
    async wipeServer(id) {
      for (const key of values.keys()) {
        if (key.startsWith(`${id}:`)) values.delete(key)
      }
    },
  }
}
