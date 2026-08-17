/**
 * Discovers OAuth endpoints (and optionally registers a client) from an MCP
 * server URL using the MCP SDK's RFC 9728 / RFC 8414 / RFC 7591 helpers.
 * @module @deepseek-ai/dsh-mcp-mgmt-oauth/discover
 */

import {
  discoverOAuthServerInfo,
  registerClient,
} from '@modelcontextprotocol/sdk/client/auth.js'

/** Inputs for discovering OAuth settings from an MCP HTTP server URL. */
export interface DiscoverOAuthOptions {
  /** MCP resource server URL (the streamable-http endpoint). */
  serverUrl: string
  /**
   * Callback URI registered with the authorization server.
   * Required for Dynamic Client Registration; discovery of endpoints still
   * works when omitted.
   */
  redirectUri?: string
  /** Display name advertised during Dynamic Client Registration. */
  clientName?: string
  /** HTTP client used for discovery and registration. */
  fetch?: typeof globalThis.fetch
}

/**
 * Non-secret OAuth fields that the Settings editor can fill after discovery.
 *
 * `clientSecret` is returned only when Dynamic Client Registration issued one;
 * the UI writes it through the secrets API and never persists it in the catalog.
 */
export interface DiscoveredOAuthConfig {
  /** Public client identifier, when one is known or was just registered. */
  clientId: string
  /** Authorization endpoint. */
  authorizeUrl: string
  /** Token endpoint. */
  tokenUrl: string
  /** Scopes advertised by the resource or authorization server. */
  scopes: string[]
  /** Client secret issued by Dynamic Client Registration, if any. */
  clientSecret?: string
  /** Whether `clientId` came from Dynamic Client Registration. */
  registered: boolean
}

/**
 * Discover authorize/token URLs from an MCP server and register a public
 * client when the authorization server advertises a registration endpoint.
 *
 * @param options - MCP server URL and optional registration inputs.
 * @returns fields suitable for filling an OAuth auth config.
 * @throws when the URL is invalid or neither endpoint can be resolved.
 */
export async function discoverOAuthFromServerUrl(options: DiscoverOAuthOptions): Promise<DiscoveredOAuthConfig> {
  const serverUrl = parseHttpUrl(options.serverUrl)
  const info = await discoverOAuthServerInfo(serverUrl, {
    ...(options.fetch === undefined ? {} : { fetchFn: options.fetch }),
  })
  const metadata = info.authorizationServerMetadata
  if (metadata?.authorization_endpoint === undefined || metadata.token_endpoint === undefined) {
    throw new Error(
      `OAuth discovery found no authorize/token endpoints for ${serverUrl.href}; `
      + 'fill them manually or check that the server publishes /.well-known/oauth-protected-resource '
      + 'and authorization-server metadata',
    )
  }

  const scopes = scopesFrom(info)
  const redirectUri = options.redirectUri
  if (redirectUri === undefined || metadata.registration_endpoint === undefined) {
    return {
      clientId: '',
      authorizeUrl: String(metadata.authorization_endpoint),
      tokenUrl: String(metadata.token_endpoint),
      scopes,
      registered: false,
    }
  }

  const registered = await registerClient(info.authorizationServerUrl, {
    metadata,
    clientMetadata: {
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: options.clientName ?? 'DeepSeek Harness',
      ...(scopes.length === 0 ? {} : { scope: scopes.join(' ') }),
    },
    ...(options.fetch === undefined ? {} : { fetchFn: options.fetch }),
  })

  return {
    clientId: registered.client_id,
    authorizeUrl: String(metadata.authorization_endpoint),
    tokenUrl: String(metadata.token_endpoint),
    scopes,
    ...(registered.client_secret === undefined ? {} : { clientSecret: registered.client_secret }),
    registered: true,
  }
}

function parseHttpUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('MCP server URL must be an absolute http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MCP server URL must use http or https')
  }
  return url
}

function scopesFrom(info: Awaited<ReturnType<typeof discoverOAuthServerInfo>>): string[] {
  const resourceScopes = info.resourceMetadata?.scopes_supported
  if (resourceScopes !== undefined && resourceScopes.length > 0) return [...resourceScopes]
  const serverScopes = info.authorizationServerMetadata?.scopes_supported
  if (serverScopes !== undefined && serverScopes.length > 0) return [...serverScopes]
  return []
}
