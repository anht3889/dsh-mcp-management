/**
 * Nominal identifiers and naming rules for managed MCP servers.
 * @module @deepseek-ai/dsh-mcp-mgmt-mcp/brand
 */

/** A managed MCP server's opaque identifier. */
export type McpServerId = string & { readonly __mcpServerId: unique symbol }

/** Valid managed MCP server names. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * Brand a non-empty server identifier.
 * @param value - the identifier to brand.
 * @returns `value` as an MCP server identifier.
 * @throws {Error} when `value` is empty.
 */
export function asMcpServerId(value: string): McpServerId {
  if (value.length === 0) throw new Error('McpServerId must not be empty')
  return value as McpServerId
}
