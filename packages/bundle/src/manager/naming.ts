/**
 * Stable, model-facing names for managed MCP tools.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager/naming
 */

import { createHash } from 'node:crypto'

const MAX_PUBLIC_NAME_LENGTH = 64
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12

/**
 * Derives the model-facing name for an MCP tool.
 *
 * @param serverName - Stable local server namespace.
 * @param rawName - MCP server tool name sent over the wire.
 * @returns A DeepSeek-compatible, collision-resistant tool name.
 */
export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}
