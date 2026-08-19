/**
 * Cordis plugin that provides the managed MCP runtime on `ctx.mcp`.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager
 */

import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import { registerHttpApi, type McpManagementWebServer } from './http-api.ts'
import { McpManagerRuntime, type McpManagerRuntimeConfig } from './runtime.ts'
import type { CredentialsApi } from './secrets.ts'
import { trustSystemCertificates } from './trust.ts'

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
  /**
   * Trusts the host's certificate authorities in addition to Node's bundled
   * ones, for MCP servers behind a private CA. This widens TLS trust for the
   * whole host process, so it stays off until an operator asks for it.
   */
  trustSystemCertificates?: boolean
}

/** Loader schema with one shared user-home location for MCP data. */
export const Config: z<Config> = z.object({
  catalogPath: z.string().default(dshHomePath('mcp', 'servers.json')),
  secretsPath: z.string().default(dshHomePath('mcp', 'secrets.yaml')),
  publicOrigin: z.string().default(undefined as unknown as string),
  trustSystemCertificates: z.boolean().default(false),
})

/**
 * Loads configured MCP servers, publishes `ctx.mcp`, and disposes every
 * connection when the plugin fiber unloads.
 * @param ctx - plugin context containing the tool registry.
 * @param config - resolved MCP storage paths and TLS trust choice.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  if (config.trustSystemCertificates === true) {
    ctx.effect(() => trustSystemCertificates(), 'mcp-manager.system-certificates')
  }
  const paths: McpManagerRuntimeConfig = {
    catalogPath: config.catalogPath ?? dshHomePath('mcp', 'servers.json'),
    secretsPath: config.secretsPath ?? dshHomePath('mcp', 'secrets.yaml'),
  }
  const runtime = await McpManagerRuntime.create(ctx, {
    ...paths,
    credentials: ctx.get('credentials') as CredentialsApi | undefined,
    oauthRedirectOrigin: () => oauthRedirectOrigin(config.publicOrigin, ctx.get('webServer') as McpManagementWebServer | undefined),
  })
  ctx.effect(() => () => runtime.dispose(), 'mcp-manager.runtime')
  ctx.provide('mcp', runtime)
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => registerHttpApi(httpCtx.get('webServer') as McpManagementWebServer, runtime),
      'mcp-manager.http-api',
    )
  })
}

/**
 * Selects the OAuth callback origin from an explicit public origin or the
 * active local web-server port. Each server appends its own callback path.
 *
 * @param publicOrigin - configured browser-visible base URL.
 * @param webServer - active local web-server, when one is composed.
 * @returns the callback origin without a trailing slash.
 * @throws when neither a public origin nor a listening web server can name one.
 */
function oauthRedirectOrigin(publicOrigin: string | undefined, webServer: McpManagementWebServer | undefined): string {
  const origin = publicOrigin ?? (webServer?.port === undefined ? undefined : `http://127.0.0.1:${webServer.port}`)
  if (origin === undefined) {
    throw new Error('mcp-manager: OAuth needs a callback origin — configure publicOrigin or run a profile with a web server')
  }
  return origin.replace(/\/$/, '')
}
