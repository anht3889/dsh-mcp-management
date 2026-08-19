/**
 * Durable storage for non-secret MCP server records.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager/catalog
 */

import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { SERVER_NAME_PATTERN } from '@anht3889/dsh-mcp-mgmt-mcp/brand'
import type { McpServerRecord } from '@anht3889/dsh-mcp-mgmt-mcp/types'

/**
 * Loads persisted non-secret MCP server records.
 *
 * @param path - the catalog file to read.
 * @returns the catalog records, or an empty list when no catalog exists.
 * @throws when a stored record is invalid, because a partly-usable catalog
 *   would surface later as an authorization or connection failure.
 */
export async function loadCatalog(path: string): Promise<McpServerRecord[]> {
  let records: McpServerRecord[]
  try {
    records = JSON.parse(await readFile(path, 'utf8')) as McpServerRecord[]
  } catch (error: unknown) {
    if (isMissingFileError(error)) return []
    throw error
  }

  for (const record of records) {
    try {
      validateRecord(record, records)
    } catch (error: unknown) {
      throw new Error(`${path} holds an invalid MCP server record: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return records
}

/**
 * Atomically stores only the durable fields of MCP server records.
 *
 * @param path - the catalog file to replace.
 * @param records - the records to store.
 */
export async function saveCatalog(
  path: string,
  records: readonly McpServerRecord[],
): Promise<void> {
  for (const record of records) {
    validateRecord(record, records)
  }

  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  )

  try {
    await writeFile(
      temporaryPath,
      JSON.stringify(records.map(toPersistedRecord)),
      'utf8',
    )
    await rename(temporaryPath, path)
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

/**
 * Validates a record before it is added to a catalog.
 *
 * @param record - the record to validate.
 * @param existing - records already present in the catalog.
 * @throws {Error} when the record is invalid or duplicates an enabled name.
 */
export function validateRecord(
  record: McpServerRecord,
  existing: readonly McpServerRecord[],
): void {
  if (!SERVER_NAME_PATTERN.test(record.serverName)) {
    throw new Error(`Invalid serverName: ${record.serverName}`)
  }

  if (
    record.enabled
    && existing.some(
      (other) =>
        other.id !== record.id
        && other.enabled
        && other.serverName === record.serverName,
    )
  ) {
    throw new Error(`Duplicate enabled serverName: ${record.serverName}`)
  }

  if (record.transport === 'stdio' && !record.command) {
    throw new Error('stdio transport requires command')
  }

  if (record.transport === 'streamable-http' && !record.url) {
    throw new Error('streamable-http transport requires url')
  }

  if (record.auth.kind === 'oauth'
    && (typeof record.auth.redirectPath !== 'string' || !record.auth.redirectPath.startsWith('/'))) {
    throw new Error(`oauth auth requires a redirectPath starting with "/": ${String(record.auth.redirectPath)}`)
  }

  if (record.disabledTools !== undefined
    && (!Array.isArray(record.disabledTools) || record.disabledTools.some(name => typeof name !== 'string' || name === ''))) {
    throw new Error('disabledTools must hold non-empty MCP tool names')
  }
}

/**
 * Returns only fields that belong in the non-secret catalog file.
 *
 * @param record - the in-memory record to persist.
 * @returns the durable record fields.
 */
function toPersistedRecord(record: McpServerRecord): McpServerRecord {
  return {
    id: record.id,
    serverName: record.serverName,
    enabled: record.enabled,
    transport: record.transport,
    ...(record.command === undefined ? {} : { command: record.command }),
    ...(record.args === undefined ? {} : { args: record.args }),
    ...(record.env === undefined ? {} : { env: record.env }),
    ...(record.cwd === undefined ? {} : { cwd: record.cwd }),
    ...(record.url === undefined ? {} : { url: record.url }),
    auth: record.auth,
    ...(record.disabledTools === undefined ? {} : { disabledTools: record.disabledTools }),
    toolCallTimeoutMs: record.toolCallTimeoutMs,
    reconnect: record.reconnect,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * Checks whether a file-system operation failed because a file was absent.
 *
 * @param error - the thrown file-system error.
 * @returns whether the error reports an absent file.
 */
function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
