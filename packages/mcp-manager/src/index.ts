/**
 * Cordis plugin that provides the managed MCP runtime on `ctx.mcp`.
 * @module @deepseek-ai/dsh-mcp-mgmt-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import { McpManagerRuntime, type McpManagerRuntimeConfig } from './runtime.ts'
import type { CredentialsApi } from './secrets.ts'

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
}

/** Loader schema with one shared user-home location for MCP data. */
export const Config: z<Config> = z.object({
  catalogPath: z.string().default(dshHomePath('mcp', 'servers.json')),
  secretsPath: z.string().default(dshHomePath('mcp', 'secrets.yaml')),
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
  const runtime = await McpManagerRuntime.create(ctx, {
    ...paths,
    credentials: ctx.get('credentials') as CredentialsApi | undefined,
  })
  ctx.effect(() => () => runtime.dispose(), 'mcp-manager.runtime')
}
