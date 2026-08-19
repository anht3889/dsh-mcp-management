import { describe, expect, it, vi } from 'vitest'
import { syncTools } from '../../src/manager/tools.ts'

describe('syncTools', () => {
  it('registers the MCP schema and calls the raw MCP tool name', async () => {
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)
    const inputSchema = {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
    }
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'created' }],
    })
    const client = {
      listTools: vi.fn().mockResolvedValue({
        tools: [{
          name: 'create issue',
          description: 'Create an issue',
          inputSchema,
        }],
      }),
      callTool,
    }
    const ctx = { tools: { register } }

    const { disposers, listed } = await syncTools(ctx as never, client as never, {
      serverName: 'github',
      toolCallTimeoutMs: 60_000,
      disabledTools: [],
    })

    expect([...disposers.keys()]).toEqual([expect.stringMatching(/^mcp__github__create_issue_[0-9a-f]{12}$/)])
    expect(listed).toEqual([{ name: 'create issue', description: 'Create an issue', enabled: true }])
    const definition = register.mock.calls[0]?.[0]
    expect(definition).toMatchObject({
      description: 'Create an issue',
      parameters: inputSchema,
      timeoutMs: 60_000,
    })

    const controller = new AbortController()
    await definition.execute({ title: 'Bug' }, { signal: controller.signal })

    expect(callTool).toHaveBeenCalledWith(
      { name: 'create issue', arguments: { title: 'Bug' } },
      undefined,
      { signal: controller.signal, timeout: 60_000 },
    )
    expect(disposers.values().next().value).toBe(dispose)
  })

  it('unregisters already registered tools when a later registration fails', async () => {
    const dispose = vi.fn()
    const register = vi.fn()
      .mockReturnValueOnce(dispose)
      .mockImplementationOnce(() => { throw new Error('tool name conflict') })
    const client = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'first', inputSchema: { type: 'object' } },
          { name: 'second', inputSchema: { type: 'object' } },
        ],
      }),
    }

    await expect(syncTools({ tools: { register } } as never, client as never, {
      serverName: 'github',
      toolCallTimeoutMs: 60_000,
      disabledTools: [],
    })).rejects.toThrow('tool name conflict')

    expect(dispose).toHaveBeenCalledOnce()
  })

  it('lists a disabled tool without registering it', async () => {
    const register = vi.fn(() => () => {})
    const client = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'read', description: 'Read a file', inputSchema: { type: 'object' } },
          { name: 'write', inputSchema: { type: 'object' } },
        ],
      }),
    }

    const { disposers, listed } = await syncTools({ tools: { register } } as never, client as never, {
      serverName: 'files',
      toolCallTimeoutMs: 60_000,
      disabledTools: ['write'],
    })

    expect(register).toHaveBeenCalledOnce()
    expect([...disposers.keys()]).toEqual([expect.stringMatching(/^mcp__files__read/)])
    expect(listed).toEqual([
      { name: 'read', description: 'Read a file', enabled: true },
      { name: 'write', description: '', enabled: false },
    ])
  })
})
