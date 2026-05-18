import { describe, it, expect, beforeAll } from 'vitest'
import { context, propagation } from '@opentelemetry/api'
import {
  injectTraceContext,
  injectTraceContextForTarget,
  shouldPropagateTraceContext,
} from '../../packages/lucid-observability/src/propagation.js'

describe('Trace propagation policy', () => {
  beforeAll(() => {
    propagation.setGlobalPropagator({
      inject: (_ctx, carrier: Record<string, string>) => {
        carrier.traceparent = '00-11111111111111111111111111111111-2222222222222222-01'
      },
      extract: (ctx) => ctx,
      fields: () => ['traceparent'],
    })
  })

  it('does not inject trace headers for external hops', async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    injectTraceContext(headers, { hop: 'external' })

    expect(headers.traceparent).toBeUndefined()
    expect(headers.tracestate).toBeUndefined()
  })

  it('injects trace headers for internal hops', async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    context.with(context.active(), () => {
      injectTraceContext(headers, { hop: 'internal' })
    })

    expect(headers.traceparent).toBeTruthy()
  })

  it('injectTraceContextForTarget blocks external provider URLs and allows internal hosts', async () => {
    const policy = {
      internalHosts: ['lucid-l2.internal', 'lucid-core.internal'],
      allowLoopback: true,
    }

    const externalHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    injectTraceContextForTarget(externalHeaders, 'https://api.openai.com/v1/chat/completions', policy)
    expect(externalHeaders.traceparent).toBeUndefined()

    const internalHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    injectTraceContextForTarget(internalHeaders, 'https://router.lucid-l2.internal/v1/chat/completions', policy)
    expect(internalHeaders.traceparent).toBeTruthy()
  })

  it('shouldPropagateTraceContext is deny-by-default for unknown hosts', () => {
    expect(shouldPropagateTraceContext('https://api.anthropic.com/v1/messages')).toBe(false)
    expect(shouldPropagateTraceContext('https://example.com')).toBe(false)
    expect(shouldPropagateTraceContext('not-a-url')).toBe(false)
  })
})
