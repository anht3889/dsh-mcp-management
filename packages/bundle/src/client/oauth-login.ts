/**
 * Login-window handling for OAuth-authenticated MCP servers.
 * @module @anht3889/dsh-mcp-mgmt-bundle/client/oauth-login
 */

/**
 * Message channel the login window uses to report its outcome. The writing half
 * is the manager's completion page (`@anht3889/dsh-mcp-mgmt-bundle/manager`); a
 * client bundle cannot import that package, so both sides spell the literal.
 */
export const OAUTH_MESSAGE_SOURCE = 'dsh-mcp-management/oauth'

/** Outcome the login window reports for one authorization-code exchange. */
export type OAuthCompletion =
  | { ok: true; serverId: string }
  | { ok: false; error: string }

/** What the section shows while one server's authorization is in flight. */
export type OAuthLoginState =
  /** Requesting the provider's authorization URL. */
  | { phase: 'starting' }
  /** The login window is open and the operator is signing in. */
  | { phase: 'waiting' }
  /** The browser refused the login window; the operator opens the URL instead. */
  | { phase: 'blocked'; authorizeUrl: string }
  /** The exchange or the request for an authorization URL failed. */
  | { phase: 'failed'; error: string }

const WINDOW_NAME = 'dsh-mcp-oauth-login'
const WINDOW_FEATURES = 'popup,width=520,height=680'

/**
 * Open the login window while the click that asked for it is still being
 * handled.
 *
 * Browsers only honor `window.open` during a user gesture, so the window opens
 * blank up front and moves to the provider once the authorization URL arrives.
 * It deliberately keeps its opener, which is how the completion page notifies
 * this section.
 *
 * @returns the opened window, or `undefined` when the browser blocked it.
 */
export function openLoginWindow(): Window | undefined {
  return window.open('', WINDOW_NAME, WINDOW_FEATURES) ?? undefined
}

/**
 * Send an opened login window to the provider's authorization URL.
 * @param loginWindow - the window from {@link openLoginWindow}.
 * @param authorizeUrl - the provider URL to load.
 * @returns true when the window accepted the navigation.
 */
export function navigateLoginWindow(loginWindow: Window | undefined, authorizeUrl: string): boolean {
  if (loginWindow === undefined || loginWindow.closed) return false
  loginWindow.location.href = authorizeUrl
  return true
}

/**
 * Read a completion posted by the login window.
 * @param event - a `message` event from any origin.
 * @returns the reported outcome, or `undefined` for unrelated messages.
 */
export function readOAuthCompletion(event: MessageEvent): OAuthCompletion | undefined {
  if (event.origin !== window.location.origin) return undefined
  const data = event.data as { source?: unknown; completion?: unknown }
  if (data === null || typeof data !== 'object' || data.source !== OAUTH_MESSAGE_SOURCE) return undefined
  const completion = data.completion as OAuthCompletion | undefined
  if (completion === undefined || typeof completion !== 'object') return undefined
  return completion.ok === true
    ? { ok: true, serverId: String(completion.serverId) }
    : { ok: false, error: String(completion.error) }
}
