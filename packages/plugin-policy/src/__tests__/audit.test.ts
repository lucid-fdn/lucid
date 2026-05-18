import { describe, it, expect, vi } from 'vitest'
import { AuditEmitter } from '../audit.js'
import type { AuditEvent } from '../types.js'

const event: AuditEvent = {
  timestamp: new Date().toISOString(),
  pluginSlug: 'lucid-seo',
  toolName: 'research_keywords',
  executionPath: 'embedded',
  durationMs: 5,
  success: true,
}

describe('AuditEmitter', () => {
  it('emits events to registered handlers', () => {
    const emitter = new AuditEmitter()
    const handler = vi.fn()
    emitter.on(handler)
    emitter.emit(event)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('supports multiple handlers', () => {
    const emitter = new AuditEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()
    emitter.on(h1)
    emitter.on(h2)
    emitter.emit(event)
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('supports unsubscribe', () => {
    const emitter = new AuditEmitter()
    const handler = vi.fn()
    const unsub = emitter.on(handler)
    unsub()
    emitter.emit(event)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not throw when handler throws (fire-and-forget)', () => {
    const emitter = new AuditEmitter()
    emitter.on(() => { throw new Error('boom') })
    const good = vi.fn()
    emitter.on(good)

    expect(() => emitter.emit(event)).not.toThrow()
    expect(good).toHaveBeenCalled()
  })

  it('clears all handlers', () => {
    const emitter = new AuditEmitter()
    emitter.on(vi.fn())
    emitter.on(vi.fn())
    expect(emitter.handlerCount).toBe(2)
    emitter.clear()
    expect(emitter.handlerCount).toBe(0)
  })
})
