/**
 * Completion page served to the OAuth login window after the identity provider
 * redirects back to the local callback route.
 * @module @deepseek-ai/dsh-mcp-mgmt-bundle/manager/oauth-page
 */

/**
 * Message channel the login window uses to tell the Settings section that
 * authorization finished. `@deepseek-ai/dsh-mcp-mgmt-bundle`
 * holds the reading half; a client bundle cannot import this package, so both
 * sides spell the literal.
 */
export const OAUTH_MESSAGE_SOURCE = 'dsh-mcp-management/oauth'

/** Outcome of one authorization-code exchange, as the login window reports it. */
export type OAuthCompletion =
  | { ok: true; serverId: string }
  | { ok: false; error: string }

/**
 * Render the login window's final page.
 *
 * The page posts {@link OAUTH_MESSAGE_SOURCE} to its opener so the Settings
 * section refreshes without waiting for its poll interval, then closes itself.
 * A window the operator opened manually has no opener and cannot self-close, so
 * the page also states the outcome and offers a close button.
 *
 * @param completion - the exchange outcome to report.
 * @returns a standalone HTML document.
 */
export function renderOAuthCompletionPage(completion: OAuthCompletion): string {
  const heading = completion.ok ? 'Authorization complete' : 'Authorization failed'
  const detail = completion.ok
    ? `${completion.serverId} is authorized. This window closes automatically.`
    : completion.error
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(heading)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f6f7f9; color: #1f2328; }
  main { background: #fff; padding: 32px 40px; border-radius: 12px; box-shadow: 0 1px 3px rgb(0 0 0 / 12%); max-width: 32rem; text-align: center; }
  h1 { font-size: 1.15rem; margin: 0 0 8px; color: ${completion.ok ? '#1a7f37' : '#b3261e'}; }
  p { margin: 0 0 16px; overflow-wrap: anywhere; }
  button { font: inherit; padding: 8px 16px; border: 1px solid #d0d7de; border-radius: 8px; background: #f6f8fa; cursor: pointer; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(detail)}</p>
<button type="button" onclick="window.close()">Close window</button>
</main>
<script>
  if (window.opener !== null) {
    window.opener.postMessage({ source: ${escapeScriptJson(OAUTH_MESSAGE_SOURCE)}, completion: ${escapeScriptJson(completion)} }, window.location.origin);${completion.ok ? '\n    setTimeout(function () { window.close() }, 1200);' : ''}
  }
</script>
</body>
</html>
`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => HTML_ENTITIES[character] ?? character)
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
}

/** Serialize a value for an inline script, where `</script>` would end the element. */
function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
