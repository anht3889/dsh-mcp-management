import { describe, expect, it } from 'vitest'
import { publicToolName } from '../../src/manager/naming.ts'

describe('publicToolName', () => {
  it('keeps clean names', () => {
    expect(publicToolName('github', 'create_issue')).toBe('mcp__github__create_issue')
  })

  it('hashes when normalized', () => {
    const name = publicToolName('srv', 'admin reset!')
    expect(name).toMatch(/^mcp__srv__admin_reset__[0-9a-f]{12}$/)
  })

  it('hashes and truncates names longer than 64 characters', () => {
    const name = publicToolName('server', 'a'.repeat(80))
    expect(name).toMatch(/^mcp__server__a{38}_[0-9a-f]{12}$/)
    expect(name).toHaveLength(64)
  })
})
