import { describe, expect, it } from 'vitest'
import { OAUTH_MESSAGE_SOURCE, renderOAuthCompletionPage } from '../../src/manager/oauth-page.ts'

describe('renderOAuthCompletionPage', () => {
  it('notifies the opener and closes itself after a granted authorization', () => {
    const page = renderOAuthCompletionPage({ ok: true, serverId: 'github' })

    expect(page).toContain('Authorization complete')
    expect(page).toContain('github')
    expect(page).toContain(`postMessage({ source: ${JSON.stringify(OAUTH_MESSAGE_SOURCE)}`)
    expect(page).toContain('window.close()')
  })

  it('keeps a failed authorization open with its reason', () => {
    const page = renderOAuthCompletionPage({ ok: false, error: 'token endpoint rejected the code' })

    expect(page).toContain('Authorization failed')
    expect(page).toContain('token endpoint rejected the code')
    expect(page).not.toContain('setTimeout')
  })

  it('escapes provider text so it cannot close the inline script or inject markup', () => {
    const page = renderOAuthCompletionPage({ ok: false, error: '</script><img src=x onerror=alert(1)>' })

    expect(page).not.toContain('<img')
    expect(page).not.toContain('</script><')
    expect(page).toContain('&lt;img')
  })
})
