/**
 * PKCE verifier and challenge generation for OAuth authorization-code flows.
 * @module @anht3889/dsh-mcp-mgmt-oauth/pkce
 */

import { createHash, randomBytes } from 'node:crypto'

/** A PKCE verifier and its corresponding S256 challenge. */
export interface Pkce {
  /** The secret verifier sent only to the token endpoint. */
  codeVerifier: string
  /** The public S256 challenge sent to the authorization endpoint. */
  codeChallenge: string
}

/**
 * Generates an RFC 7636 PKCE verifier and S256 challenge.
 *
 * @returns A verifier and the challenge derived from it.
 */
export function createPkce(): Pkce {
  const codeVerifier = randomBytes(64).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}
