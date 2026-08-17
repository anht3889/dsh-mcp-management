/**
 * In-memory OAuth authorization requests awaiting an IdP callback.
 * @module @anht3889/dsh-mcp-mgmt-oauth/pending
 */

/** One pending OAuth authorization-code exchange. */
export interface PendingAuthorization {
  /** The unguessable callback state value. */
  state: string
  /** The PKCE verifier corresponding to the authorization request. */
  codeVerifier: string
  /** The MCP server being authorized. */
  id: string
  /** The time authorization began. */
  createdAt: Date
}

/** Stores and consumes OAuth state values exactly once. */
export class PendingAuthorizations {
  private readonly values = new Map<string, PendingAuthorization>()

  /**
   * Records a pending authorization request.
   *
   * @param authorization - The request to retain until its callback arrives.
   */
  set(authorization: PendingAuthorization): void {
    this.values.set(authorization.state, authorization)
  }

  /**
   * Removes and returns a pending authorization request.
   *
   * @param state - The callback state value.
   * @returns The corresponding request, if present.
   */
  take(state: string): PendingAuthorization | undefined {
    const authorization = this.values.get(state)
    this.values.delete(state)
    return authorization
  }
}
