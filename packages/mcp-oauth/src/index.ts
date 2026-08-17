/**
 * OAuth authorization-code flow support for managed MCP HTTP servers.
 * @module @deepseek-ai/dsh-mcp-mgmt-oauth
 */

import { randomBytes } from 'node:crypto'
import { PendingAuthorizations } from './pending.ts'
import { createPkce, type Pkce } from './pkce.ts'

export { createPkce, type Pkce } from './pkce.ts'

/** The loopback webserver path that receives OAuth authorization callbacks. */
export const OAUTH_REDIRECT_PATH = '/mcp-management/oauth/callback'

/** Logical secret keys owned by OAuth authorization. */
export const OAuthSecretKey = {
  access: 'OAUTH_ACCESS',
  refresh: 'OAUTH_REFRESH',
  expiresAt: 'OAUTH_EXPIRES_AT',
  clientSecret: 'OAUTH_CLIENT_SECRET',
} as const

/** A value-free view of one configured secret. */
export interface SecretDescription {
  /** Whether the secret has a configured value. */
  configured: boolean
}

/** Minimal secret-store interface shared with the MCP manager. */
export interface SecretStore {
  /**
   * Stores a server-scoped secret.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   * @param value - The secret value.
   */
  set(id: string, key: string, value: string): Promise<void>
  /**
   * Resolves a server-scoped secret.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   * @returns The secret value, if configured.
   */
  get(id: string, key: string): Promise<string | undefined>
  /**
   * Removes a server-scoped secret.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   */
  unset(id: string, key: string): Promise<void>
  /**
   * Describes a secret without exposing its value.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   * @returns Its configured state.
   */
  describe(id: string, key: string): Promise<SecretDescription>
  /**
   * Removes all secrets owned by a server.
   *
   * @param id - The MCP server id.
   */
  wipeServer(id: string): Promise<void>
}

/** OAuth configuration taken from a managed MCP server record. */
export interface OAuthAuth {
  /** Identifies this configuration as OAuth. */
  kind: 'oauth'
  /** The public client identifier. */
  clientId: string
  /** The authorization endpoint. */
  authorizeUrl: string
  /** The token endpoint. */
  tokenUrl: string
  /** Scopes requested from the authorization server. */
  scopes: string[]
}

/** The server data required by the OAuth controller. */
export interface OAuthServer {
  /** The MCP server identifier. */
  id: string
  /** The server's authentication configuration. */
  auth: OAuthAuth | { kind: string }
}

/** Query fields passed through the OAuth callback endpoint. */
export interface OAuthCallbackQuery {
  /** The authorization code supplied by the authorization server. */
  code?: string
  /** The state that must match a pending authorization request. */
  state?: string
  /** An OAuth authorization error code. */
  error?: string
  /** A human-readable OAuth authorization error description. */
  error_description?: string
}

/** Dependencies used to create an OAuth controller. */
export interface OAuthControllerOptions {
  /**
   * Looks up the managed server selected for authorization.
   *
   * @param id - The MCP server id.
   * @returns The server, if it is still configured.
   */
  getServer(id: string): OAuthServer | undefined
  /** Storage for OAuth client credentials and tokens. */
  secrets: SecretStore
  /** Full loopback callback URI for the live webserver. */
  redirectUri: string
  /** HTTP client used for authorization-code and refresh exchanges. */
  fetch?: typeof globalThis.fetch
  /** Clock used to calculate token expiry. */
  now?: () => Date
}

/** Operations for one process's pending OAuth authorization requests. */
export interface OAuthController {
  /**
   * Starts authorization for a configured OAuth server.
   *
   * @param id - The MCP server id.
   * @returns The IdP authorization URL.
   */
  start(id: string): Promise<{ authorizeUrl: string }>
  /**
   * Exchanges a valid OAuth callback code for stored tokens.
   *
   * @param query - Query fields supplied to the redirect endpoint.
   * @returns The authorized server id.
   */
  handleCallback(query: OAuthCallbackQuery): Promise<{ serverId: string }>
  /**
   * Returns a current Bearer authorization header, refreshing it when expired.
   *
   * @param id - The MCP server id.
   * @returns The usable authorization header, if one is configured.
   */
  authorizeHeader(id: string): Promise<string | undefined>
  /**
   * Removes OAuth tokens while retaining an optional configured client secret.
   *
   * @param id - The MCP server id.
   */
  clear(id: string): Promise<void>
}

/**
 * Creates an authorization-code-with-PKCE OAuth controller.
 *
 * @param options - Server lookup, secret storage, and HTTP dependencies.
 * @returns An OAuth controller scoped to this host process.
 */
export function createOAuthController(options: OAuthControllerOptions): OAuthController {
  const pending = new PendingAuthorizations()
  const fetch = options.fetch ?? globalThis.fetch
  const now = options.now ?? (() => new Date())

  return {
    async start(id) {
      const server = requireOAuthServer(options.getServer(id), id)
      const { codeVerifier, codeChallenge } = createPkce()
      const state = randomBytes(32).toString('base64url')
      pending.set({ state, codeVerifier, id, createdAt: now() })

      const url = new URL(server.auth.authorizeUrl)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', server.auth.clientId)
      url.searchParams.set('redirect_uri', options.redirectUri)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      if (server.auth.scopes.length > 0) url.searchParams.set('scope', server.auth.scopes.join(' '))
      url.searchParams.set('state', state)
      return { authorizeUrl: url.toString() }
    },

    async handleCallback(query) {
      if (query.state === undefined) throw new Error('OAuth callback is missing state')
      const authorization = pending.take(query.state)
      if (authorization === undefined) throw new Error('OAuth callback state is invalid or expired')
      if (query.error !== undefined) {
        throw new Error(`OAuth authorization failed: ${query.error_description ?? query.error}`)
      }
      if (query.code === undefined) throw new Error('OAuth callback is missing code')

      const server = requireOAuthServer(options.getServer(authorization.id), authorization.id)
      const tokens = await exchangeToken(fetch, server, options.secrets, authorization.id, {
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: options.redirectUri,
        code_verifier: authorization.codeVerifier,
      })
      await storeTokens(options.secrets, authorization.id, tokens, now())
      return { serverId: authorization.id }
    },

    async authorizeHeader(id) {
      const accessToken = await options.secrets.get(id, OAuthSecretKey.access)
      if (accessToken === undefined) return undefined

      const expiresAt = await options.secrets.get(id, OAuthSecretKey.expiresAt)
      if (!isExpired(expiresAt, now())) return `Bearer ${accessToken}`

      const refreshToken = await options.secrets.get(id, OAuthSecretKey.refresh)
      if (refreshToken === undefined) return undefined
      const server = requireOAuthServer(options.getServer(id), id)
      const tokens = await exchangeToken(fetch, server, options.secrets, id, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
      await storeTokens(options.secrets, id, { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken }, now())
      return `Bearer ${tokens.access_token}`
    },

    async clear(id) {
      await Promise.all([
        options.secrets.unset(id, OAuthSecretKey.access),
        options.secrets.unset(id, OAuthSecretKey.refresh),
        options.secrets.unset(id, OAuthSecretKey.expiresAt),
      ])
    },
  }
}

function requireOAuthServer(server: OAuthServer | undefined, id: string): OAuthServer & { auth: OAuthAuth } {
  if (server === undefined) throw new Error(`MCP server ${id} was not found`)
  if (server.auth.kind !== 'oauth') throw new Error(`MCP server ${id} does not use OAuth`)
  return server as OAuthServer & { auth: OAuthAuth }
}

async function exchangeToken(
  fetch: typeof globalThis.fetch,
  server: OAuthServer & { auth: OAuthAuth },
  secrets: SecretStore,
  id: string,
  parameters: Record<string, string>,
): Promise<OAuthTokenResponse> {
  const clientSecret = await secrets.get(id, OAuthSecretKey.clientSecret)
  const response = await fetch(server.auth.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...parameters,
      client_id: server.auth.clientId,
      ...(clientSecret === undefined ? {} : { client_secret: clientSecret }),
    }),
  })
  if (!response.ok) {
    const detail = (await response.text()).trim()
    throw new Error(`OAuth token exchange failed: ${response.status}${detail === '' ? '' : ` ${detail}`}`)
  }
  return parseTokenResponse(await response.json())
}

function parseTokenResponse(value: unknown): OAuthTokenResponse {
  if (typeof value !== 'object' || value === null || !('access_token' in value) || typeof value.access_token !== 'string') {
    throw new Error('OAuth token response is missing access_token')
  }
  const refreshToken = 'refresh_token' in value && typeof value.refresh_token === 'string' ? value.refresh_token : undefined
  const expiresIn = 'expires_in' in value && typeof value.expires_in === 'number' ? value.expires_in : undefined
  return { access_token: value.access_token, refresh_token: refreshToken, expires_in: expiresIn }
}

async function storeTokens(secrets: SecretStore, id: string, tokens: OAuthTokenResponse, issuedAt: Date): Promise<void> {
  await secrets.set(id, OAuthSecretKey.access, tokens.access_token)
  if (tokens.refresh_token !== undefined) await secrets.set(id, OAuthSecretKey.refresh, tokens.refresh_token)
  if (tokens.expires_in === undefined) {
    await secrets.unset(id, OAuthSecretKey.expiresAt)
    return
  }
  await secrets.set(id, OAuthSecretKey.expiresAt, new Date(issuedAt.getTime() + tokens.expires_in * 1_000).toISOString())
}

function isExpired(expiresAt: string | undefined, currentTime: Date): boolean {
  if (expiresAt === undefined) return false
  const parsed = Date.parse(expiresAt)
  return Number.isNaN(parsed) || parsed <= currentTime.getTime()
}

interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}
