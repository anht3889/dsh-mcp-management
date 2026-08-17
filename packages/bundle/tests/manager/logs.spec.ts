import { describe, expect, it } from 'vitest'
import { createLogBuffer } from '../../src/manager/logs.ts'

describe('createLogBuffer', () => {
  it('retains the newest entries and reads after a cursor', () => {
    const buffer = createLogBuffer(3)
    buffer.append({ at: '1', level: 'info', message: 'a' })
    buffer.append({ at: '2', level: 'info', message: 'b' })
    buffer.append({ at: '3', level: 'info', message: 'c' })
    buffer.append({ at: '4', level: 'info', message: 'd' })

    expect(buffer.read(0)).toEqual({
      next: 4,
      entries: [
        { at: '2', level: 'info', message: 'b' },
        { at: '3', level: 'info', message: 'c' },
        { at: '4', level: 'info', message: 'd' },
      ],
    })
    expect(buffer.read(2).entries.map((entry) => entry.message)).toEqual(['c', 'd'])
  })

  it('removes retained entries when cleared', () => {
    const buffer = createLogBuffer()
    buffer.append({ at: '1', level: 'warn', message: 'lost connection' })
    buffer.clear()

    expect(buffer.read()).toEqual({ next: 1, entries: [] })
  })
})
