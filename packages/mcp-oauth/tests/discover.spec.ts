import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverOAuthFromServerUrl } from '../src/discover.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('discoverOAuthFromServerUrl', () => {
  it('fills authorize and token URLs from protected-resource and AS metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/.well-known/oauth-protected-resource')) {
        return json({
          resource: 'https://mcp.example/sse',
          authorization_servers: ['https://idp.example'],
          scopes_supported: ['mcp:tools'],
        })
      }
      if (url.includes('/.well-known/oauth-authorization-server')) {
        return json({
          issuer: 'https://idp.example',
          authorization_endpoint: 'https://idp.example/authorize',
          token_endpoint: 'https://idp.example/token',
          response_types_supported: ['code'],
          code_challenge_methods_supported: ['S256'],
        })
      }
      throw new Error(`unexpected fetch ${url}`)
    }))

    await expect(discoverOAuthFromServerUrl({
      serverUrl: 'https://mcp.example/sse',
    })).resolves.toEqual({
      clientId: '',
      authorizeUrl: 'https://idp.example/authorize',
      tokenUrl: 'https://idp.example/token',
      scopes: ['mcp:tools'],
      registered: false,
    })
  })

  it('registers a public client when the AS advertises a registration endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/.well-known/oauth-protected-resource')) {
        return json({
          resource: 'https://mcp.example/sse',
          authorization_servers: ['https://idp.example'],
        })
      }
      if (url.includes('/.well-known/oauth-authorization-server')) {
        return json({
          issuer: 'https://idp.example',
          authorization_endpoint: 'https://idp.example/authorize',
          token_endpoint: 'https://idp.example/token',
          registration_endpoint: 'https://idp.example/register',
          response_types_supported: ['code'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        })
      }
      if (url === 'https://idp.example/register' && init?.method === 'POST') {
        return json({
          client_id: 'dyn-client',
          client_secret: 'dyn-secret',
          redirect_uris: ['http://127.0.0.1:3080/mcp-management/oauth/callback'],
        })
      }
      throw new Error(`unexpected fetch ${url}`)
    }))

    await expect(discoverOAuthFromServerUrl({
      serverUrl: 'https://mcp.example/sse',
      redirectUri: 'http://127.0.0.1:3080/mcp-management/oauth/callback',
    })).resolves.toEqual({
      clientId: 'dyn-client',
      authorizeUrl: 'https://idp.example/authorize',
      tokenUrl: 'https://idp.example/token',
      scopes: [],
      clientSecret: 'dyn-secret',
      registered: true,
    })
  })

  it('rejects a non-http MCP server URL', async () => {
    await expect(discoverOAuthFromServerUrl({ serverUrl: 'stdio://local' }))
      .rejects.toThrow(/http or https/)
  })
})

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
