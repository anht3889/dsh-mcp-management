/**
 * Creates MCP client transports from durable server records.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager/transport
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpServerRecord } from '@anht3889/dsh-mcp-mgmt-mcp/types'

/**
 * Creates the configured MCP transport.
 *
 * @param record - Durable MCP server configuration.
 * @param resolveHeaders - Resolves non-durable HTTP credentials for each request.
 * @returns A fresh MCP client transport.
 * @throws {Error} When the selected transport lacks its required configuration.
 */
export function createTransport(
  record: McpServerRecord,
  resolveHeaders: () => Promise<Record<string, string>>,
): Transport {
  switch (record.transport) {
    case 'stdio':
      if (record.command === undefined) throw new Error(`MCP server "${record.serverName}" requires a command`)
      return new StdioClientTransport({
        command: record.command,
        ...record.args === undefined ? {} : { args: record.args },
        ...record.env === undefined ? {} : { env: record.env },
        ...record.cwd === undefined ? {} : { cwd: record.cwd },
      })
    case 'streamable-http':
      if (record.url === undefined) throw new Error(`MCP server "${record.serverName}" requires a URL`)
      return new StreamableHTTPClientTransport(new URL(record.url), {
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers)
          for (const [name, value] of Object.entries(await resolveHeaders())) {
            headers.set(name, value)
          }
          return fetch(url, { ...init, headers })
        },
      })
  }
}
