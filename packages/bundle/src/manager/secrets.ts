/**
 * Secret storage for managed MCP servers.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager/secrets
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The resolved value returned by the harness credential provider. */
export interface ResolvedCredential {
  /** The secret value. */
  value: string
}

/** Minimal harness credential service consumed by the secret store. */
export interface CredentialsApi {
  /**
   * Resolves a credential reference.
   *
   * @param ref - The credential reference to resolve.
   * @returns The resolved credential, or `undefined` when it is not configured.
   */
  resolve(ref: string): Promise<ResolvedCredential | undefined>
  /**
   * Describes a credential reference without exposing its value.
   *
   * @param ref - The credential reference to describe.
   * @returns Its configured state.
   */
  describe(ref: string): Promise<{ configured: boolean }>
  /**
   * Stores a credential value.
   *
   * @param ref - The credential reference to update.
   * @param value - The secret value to store.
   */
  set(ref: string, value: string): Promise<void>
  /**
   * Removes a credential value.
   *
   * @param ref - The credential reference to remove.
   */
  unset(ref: string): Promise<void>
}

/** A value-free view of one secret's configured state. */
export interface SecretDescription {
  /** Whether a value is configured for the requested key. */
  configured: boolean
}

/** Operations for secrets owned by managed MCP servers. */
export interface SecretStore {
  /**
   * Stores a server secret.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   * @param value - The secret value.
   */
  set(id: string, key: string, value: string): Promise<void>
  /**
   * Resolves a server secret.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   * @returns The configured secret value, if any.
   */
  get(id: string, key: string): Promise<string | undefined>
  /**
   * Removes one server secret.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   */
  unset(id: string, key: string): Promise<void>
  /**
   * Describes one secret without exposing its value.
   *
   * @param id - The MCP server id.
   * @param key - The logical secret key.
   * @returns Whether the secret is configured.
   */
  describe(id: string, key: string): Promise<SecretDescription>
  /**
   * Removes all secrets belonging to one server.
   *
   * @param id - The MCP server id.
   */
  wipeServer(id: string): Promise<void>
}

/** Dependencies used to create a secret store. */
export interface SecretStoreOptions {
  /** Harness credential service, preferred over file storage when available. */
  credentials?: CredentialsApi
  /** Fallback file that holds logical credential references and their values. */
  filePath: string
}

/**
 * Creates a secret store backed by the credential service or a private fallback file.
 *
 * @param options - The credential service and fallback file location.
 * @returns A server-scoped secret store.
 */
export function createSecretStore(options: SecretStoreOptions): SecretStore {
  const { credentials, filePath } = options
  const mutate = createMutationQueue()

  if (credentials !== undefined) {
    const indexPath = `${filePath}.index.json`
    return {
      async set(id, key, value) {
        await mutate(async () => {
          const ref = secretReference(id, key)
          await credentials.set(ref, value)
          const index = await loadCredentialIndex(indexPath)
          const refs = index[id] ?? []
          if (!refs.includes(ref)) refs.push(ref)
          index[id] = refs
          await saveCredentialIndex(indexPath, index)
        })
      },
      async get(id, key) {
        return (await credentials.resolve(secretReference(id, key)))?.value
      },
      async unset(id, key) {
        await mutate(async () => {
          const ref = secretReference(id, key)
          await credentials.unset(ref)
          const index = await loadCredentialIndex(indexPath)
          const refs = index[id]?.filter((candidate) => candidate !== ref) ?? []
          if (refs.length === 0) delete index[id]
          else index[id] = refs
          await saveCredentialIndex(indexPath, index)
        })
      },
      async describe(id, key) {
        const { configured } = await credentials.describe(secretReference(id, key))
        return { configured }
      },
      async wipeServer(id) {
        await mutate(async () => {
          const index = await loadCredentialIndex(indexPath)
          const refs = index[id] ?? []
          await Promise.all(refs.map((ref) => credentials.unset(ref)))
          delete index[id]
          await saveCredentialIndex(indexPath, index)
        })
      },
    }
  }

  return {
    async set(id, key, value) {
      await mutate(async () => {
        const values = await loadFallbackFile(filePath)
        values[secretReference(id, key)] = value
        await saveFallbackFile(filePath, values)
      })
    },
    async get(id, key) {
      return (await loadFallbackFile(filePath))[secretReference(id, key)]
    },
    async unset(id, key) {
      await mutate(async () => {
        const values = await loadFallbackFile(filePath)
        delete values[secretReference(id, key)]
        await saveFallbackFile(filePath, values)
      })
    },
    async describe(id, key) {
      const value = (await loadFallbackFile(filePath))[secretReference(id, key)]
      return { configured: value !== undefined }
    },
    async wipeServer(id) {
      await mutate(async () => {
        const values = await loadFallbackFile(filePath)
        const prefix = secretReferencePrefix(id)
        for (const ref of Object.keys(values)) {
          if (ref.startsWith(prefix)) delete values[ref]
        }
        await saveFallbackFile(filePath, values)
      })
    },
  }
}

/** Serializes read-modify-write secret file and index updates. */
function createMutationQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
  let tail = Promise.resolve()
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation)
    tail = result.then(() => undefined, () => undefined)
    return await result
  }
}

/**
 * Converts a server id and logical key into its credential reference.
 *
 * @param id - The MCP server id.
 * @param key - The logical secret key.
 * @returns A stable credential reference.
 */
function secretReference(id: string, key: string): string {
  return `${secretReferencePrefix(id)}${key.toUpperCase()}`
}

/**
 * Returns the credential-reference prefix for one server.
 *
 * @param id - The MCP server id.
 * @returns The prefix shared by every server secret.
 */
function secretReferencePrefix(id: string): string {
  return `MCP_${id.replaceAll('-', '').toUpperCase()}_`
}

/**
 * Loads fallback values from a JSON document, which is valid YAML content.
 *
 * @param filePath - The fallback file path.
 * @returns The credential references and values.
 */
async function loadFallbackFile(filePath: string): Promise<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new TypeError(`Secret file ${filePath} must contain an object`)
    }
    if (Object.values(parsed).some((value) => typeof value !== 'string')) {
      throw new TypeError(`Secret file ${filePath} must contain string values`)
    }
    return parsed as Record<string, string>
  } catch (error: unknown) {
    if (isMissingFileError(error)) return {}
    throw error
  }
}

/**
 * Loads the value-free credential reference index.
 *
 * @param filePath - The credential index file path.
 * @returns Server ids and their credential references.
 */
async function loadCredentialIndex(filePath: string): Promise<Record<string, string[]>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new TypeError(`Credential index ${filePath} must contain an object`)
    }
    if (Object.values(parsed).some((refs) => !Array.isArray(refs) || refs.some((ref) => typeof ref !== 'string'))) {
      throw new TypeError(`Credential index ${filePath} must contain string arrays`)
    }
    return parsed as Record<string, string[]>
  } catch (error: unknown) {
    if (isMissingFileError(error)) return {}
    throw error
  }
}

/**
 * Stores fallback values with owner-only file permissions where supported.
 *
 * @param filePath - The fallback file path.
 * @param values - The credential references and values to store.
 */
async function saveFallbackFile(filePath: string, values: Record<string, string>): Promise<void> {
  await savePrivateFile(filePath, JSON.stringify(values))
}

/**
 * Stores a credential-reference index without secret values.
 *
 * @param filePath - The credential index file path.
 * @param index - Server ids and their credential references.
 */
async function saveCredentialIndex(filePath: string, index: Record<string, string[]>): Promise<void> {
  await savePrivateFile(filePath, JSON.stringify(index))
}

/**
 * Stores private JSON with owner-only file permissions where supported.
 *
 * @param filePath - The file path to replace.
 * @param content - The JSON content to store.
 */
async function savePrivateFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 })
  try {
    await chmod(filePath, 0o600)
  } catch {
    // Windows and some file systems do not support POSIX permissions.
  }
}

/**
 * Checks whether a file-system operation failed because a file was absent.
 *
 * @param error - The thrown file-system error.
 * @returns Whether the error reports an absent file.
 */
function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
