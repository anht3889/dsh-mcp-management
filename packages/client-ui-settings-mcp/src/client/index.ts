/**
 * Browser plugin registering the MCP management Settings section.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { McpManagementApi } from './api.ts'
import { McpSection } from './McpSection.tsx'
import { en, zh, type McpSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the MCP Settings page. */
    'settings.mcp': McpSettingsKey
  }
}

/** Locale namespace owned by this plugin. */
const NS = 'settings.mcp'

/** Required client services. */
export const inject = ['slots', 'locale']

/**
 * Register MCP server management under the Settings navigation slot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-mcp: copy dictionaries')
  const api = new McpManagementApi()
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 40,
    label: () => t('nav'),
    inject: () => ({ api }),
  }, McpSection))
}
