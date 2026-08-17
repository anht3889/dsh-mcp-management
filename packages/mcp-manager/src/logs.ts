/**
 * Bounded in-memory lifecycle logs for one managed MCP server.
 * @module @deepseek-ai/dsh-mcp-mgmt-manager/logs
 */

import type { McpLogEntry } from '@deepseek-ai/dsh-mcp-mgmt-mcp/types'

/** The number of lifecycle entries retained when no capacity is specified. */
const DEFAULT_CAPACITY = 500

/** A cursor-addressable buffer of MCP lifecycle log entries. */
export interface LogBuffer {
  /**
   * Stores one lifecycle entry.
   *
   * @param entry - The lifecycle event to retain.
   */
  append(entry: McpLogEntry): void
  /**
   * Reads entries newer than an optional exclusive cursor.
   *
   * @param after - The exclusive cursor from a prior read.
   * @returns The newest cursor and matching retained entries.
   */
  read(after?: number): { next: number; entries: McpLogEntry[] }
  /** Removes all retained entries without reusing previous cursors. */
  clear(): void
}

/**
 * Creates a bounded, cursor-addressable lifecycle log buffer.
 *
 * @param capacity - Maximum number of entries retained in memory.
 * @returns A buffer that keeps the newest entries.
 * @throws {Error} When capacity is not a positive integer.
 */
export function createLogBuffer(capacity = DEFAULT_CAPACITY): LogBuffer {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Log buffer capacity must be a positive integer')
  }

  let next = 0
  const entries: Array<{ cursor: number; entry: McpLogEntry }> = []

  return {
    append(entry) {
      next += 1
      entries.push({ cursor: next, entry })
      if (entries.length > capacity) entries.shift()
    },
    read(after) {
      return {
        next,
        entries: entries
          .filter(({ cursor }) => after === undefined || cursor > after)
          .map(({ entry }) => entry),
      }
    },
    clear() {
      entries.length = 0
    },
  }
}
