/**
 * Capability Core — Audit Hooks
 *
 * Pluggable audit system for plugin tool executions.
 * Consumers register handlers; the audit emitter fires after each tool call.
 *
 * Handlers are fire-and-forget — audit failures never block tool execution.
 */

import type { AuditEvent, AuditHandler } from './types.js'

export class AuditEmitter {
  private readonly handlers: AuditHandler[] = []

  /** Register an audit handler. Returns unsubscribe function. */
  on(handler: AuditHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx >= 0) this.handlers.splice(idx, 1)
    }
  }

  /** Emit an audit event to all registered handlers (fire-and-forget). */
  emit(event: AuditEvent): void {
    for (const handler of this.handlers) {
      try {
        const result = handler(event)
        // If handler returns a promise, catch errors silently
        if (result && typeof result === 'object' && 'catch' in result) {
          ;(result as Promise<void>).catch((err) => {
            console.error('[plugin-policy:audit] Handler error:', err)
          })
        }
      } catch (err) {
        console.error('[plugin-policy:audit] Handler error:', err)
      }
    }
  }

  /** Remove all handlers. */
  clear(): void {
    this.handlers.length = 0
  }

  get handlerCount(): number {
    return this.handlers.length
  }
}
