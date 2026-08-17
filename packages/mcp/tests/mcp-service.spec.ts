import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { asMcpServerId, SERVER_NAME_PATTERN } from '../src/brand.ts'
import { mcpRuntimeOf } from '../src/index.ts'

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

describe('mcpRuntimeOf', () => {
  it('reads a provided runtime and reports an unmounted seam', async () => {
    const ctx = new Context()
    expect(mcpRuntimeOf(ctx)).toBeUndefined()

    const runtime = { list: () => [] } as unknown as NonNullable<ReturnType<typeof mcpRuntimeOf>>
    const dispose = ctx.provide('mcp', runtime)
    expect(mcpRuntimeOf(ctx)).toBe(runtime)

    await dispose()
    expect(mcpRuntimeOf(ctx)).toBeUndefined()
  })
})
