import { describe, it, expect } from 'vitest'
import { OfflineBuffer, type BufferEntry } from '../offline-buffer.js'

function entry(type: BufferEntry['type'] = 'event', payload: unknown = 'test'): BufferEntry {
  return { type, payload, timestamp: Date.now() }
}

describe('OfflineBuffer', () => {
  it('starts empty', () => {
    const buf = new OfflineBuffer(10)
    expect(buf.depth).toBe(0)
    expect(buf.droppedCount).toBe(0)
    expect(buf.flush()).toEqual([])
  })

  it('pushes and flushes entries in FIFO order', () => {
    const buf = new OfflineBuffer(10)
    buf.push(entry('heartbeat'))
    buf.push(entry('event'))
    expect(buf.depth).toBe(2)

    const batch = buf.flush(10)
    expect(batch).toHaveLength(2)
    expect(batch[0].type).toBe('heartbeat')
    expect(batch[1].type).toBe('event')
    expect(buf.depth).toBe(0)
  })

  it('respects flush batchSize', () => {
    const buf = new OfflineBuffer(10)
    for (let i = 0; i < 5; i++) buf.push(entry())
    expect(buf.flush(3)).toHaveLength(3)
    expect(buf.depth).toBe(2)
  })

  it('tail-drops oldest entries when full', () => {
    const buf = new OfflineBuffer(3)
    buf.push(entry('event', 'a'))
    buf.push(entry('event', 'b'))
    buf.push(entry('event', 'c'))
    buf.push(entry('event', 'd'))

    expect(buf.depth).toBe(3)
    expect(buf.droppedCount).toBe(1)
    expect(buf.flush(10).map((e) => e.payload)).toEqual(['b', 'c', 'd'])
  })

  it('accumulates dropped count across overflows', () => {
    const buf = new OfflineBuffer(2)
    for (let i = 0; i < 10; i++) buf.push(entry())
    expect(buf.droppedCount).toBe(8)
    expect(buf.depth).toBe(2)
  })

  it('wraps around correctly after partial drain', () => {
    const buf = new OfflineBuffer(3)
    buf.push(entry('heartbeat'))
    buf.push(entry('event'))
    buf.flush(2) // drain

    buf.push(entry('cost'))
    buf.push(entry('heartbeat'))
    const batch = buf.flush(10)
    expect(batch).toHaveLength(2)
    expect(batch[0].type).toBe('cost')
    expect(batch[1].type).toBe('heartbeat')
  })
})
