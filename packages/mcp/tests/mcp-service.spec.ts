import { describe, expect, it } from 'vitest'
import { asMcpServerId, SERVER_NAME_PATTERN } from '../src/brand.ts'

describe('McpServerId', () => {
  it('accepts uuid-shaped ids', () => {
    const id = asMcpServerId('11111111-1111-4111-8111-111111111111')
    expect(id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rejects empty', () => {
    expect(() => asMcpServerId('')).toThrow(/McpServerId/)
  })
})

describe('SERVER_NAME_PATTERN', () => {
  it('matches harness serverName rules', () => {
    expect(SERVER_NAME_PATTERN.test('github')).toBe(true)
    expect(SERVER_NAME_PATTERN.test('bad name')).toBe(false)
  })
})
