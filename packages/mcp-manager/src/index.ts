/**
 * Cordis plugin that provides the managed MCP runtime on `ctx.mcp`.
 * @module @deepseek-ai/dsh-mcp-mgmt-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import { registerHttpApi, type McpManagementWebServer } from './http-api.ts'
import { McpManagerRuntime, type McpManagerRuntimeConfig } from './runtime.ts'
import type { CredentialsApi } from './secrets.ts'
import { OAUTH_REDIRECT_PATH } from '@deepseek-ai/dsh-mcp-mgmt-oauth'

export { McpManagerRuntime } from './runtime.ts'
export type { McpManagerRuntimeConfig, McpManagerRuntimeOptions } from './runtime.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-manager'

/** The MCP manager requires the tool registry. */
export const inject = ['tools']

/** Optional paths for MCP catalog and fallback secret storage. */
export interface Config {
  /** Durable non-secret MCP server records. */
  catalogPath?: string
  /** Private fallback storage used when credentials are unavailable. */
  secretsPath?: string
  /** Browser-visible base URL used by OAuth redirect URIs. */
  publicOrigin?: string
}

/** Loader schema with one shared user-home location for MCP data. */
export const Config: z<Config> = z.object({
  catalogPath: z.string().default(dshHomePath('mcp', 'servers.json')),
  secretsPath: z.string().default(dshHomePath('mcp', 'secrets.yaml')),
  publicOrigin: z.string().default(undefined as unknown as string),
})

/**
 * Loads configured MCP servers, publishes `ctx.mcp`, and disposes every
 * connection when the plugin fiber unloads.
 * @param ctx - plugin context containing the tool registry.
 * @param config - resolved MCP storage paths.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const paths: McpManagerRuntimeConfig = {
    catalogPath: config.catalogPath ?? dshHomePath('mcp', 'servers.json'),
    secretsPath: config.secretsPath ?? dshHomePath('mcp', 'secrets.yaml'),
  }
  const webServer = ctx.get('webServer') as McpManagementWebServer | undefined
  const runtime = await McpManagerRuntime.create(ctx, {
    ...paths,
    credentials: ctx.get('credentials') as CredentialsApi | undefined,
    oauthRedirectUri: oauthRedirectUri(config.publicOrigin, webServer),
  })
  ctx.effect(() => () => runtime.dispose(), 'mcp-manager.runtime')
  if (webServer === undefined) {
    console.warn('mcp-manager: webServer service unavailable; HTTP API disabled')
    return
  }
  ctx.effect(() => registerHttpApi(webServer, runtime), 'mcp-manager.http-api')
}

/**
 * Selects the OAuth callback URL from an explicit public origin or the active
 * local web-server port.
 *
 * @param publicOrigin - configured browser-visible base URL.
 * @param webServer - optional active local web-server.
 * @returns full OAuth callback URI, or `undefined` for headless operation.
 */
function oauthRedirectUri(publicOrigin: string | undefined, webServer: McpManagementWebServer | undefined): string | undefined {
  const origin = publicOrigin ?? (webServer?.port === undefined ? undefined : `http://127.0.0.1:${webServer.port}`)
  return origin === undefined ? undefined : `${origin.replace(/\/$/, '')}${OAUTH_REDIRECT_PATH}`
}
