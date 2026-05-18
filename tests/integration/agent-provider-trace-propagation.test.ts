/**
 * Trace propagation policy tests.
 *
 * Validates that trace context (traceparent/tracestate) is only injected
 * for internal Lucid URLs, never for external provider URLs.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { propagation } from '@opentelemetry/api'
import {
  shouldPropagateTraceContext,
  injectTraceContextForTarget,
  type TracePropagationPolicy,
} from '../../worker/src/observability/tracing.js'

const POLICY: TracePropagationPolicy = {
  internalHostSuffixes: ['.lucid-l2.internal', '.railway.internal'],
  allowLoopback: true,
}

describe('Trace propagation policy', () => {
  beforeAll(() => {
    propagation.setGlobalPropagator({
      inject: (_ctx, carrier: Record<string, string>) => {
        carrier.traceparent = '00-11111111111111111111111111111111-2222222222222222-01'
        carrier.tracestate = 'lucid=test'
      },
      extract: (ctx) => ctx,
      fields: () => ['traceparent', 'tracestate'],
    })
  })

  // ── shouldPropagateTraceContext ─────────────────────────

  it('does not propagate to external provider URLs', () => {
    expect(shouldPropagateTraceContext('https://api.openai.com/v1/chat/completions', POLICY)).toBe(false)
    expect(shouldPropagateTraceContext('https://api.jup.ag/price/v3', POLICY)).toBe(false)
    expect(shouldPropagateTraceContext('https://api.0x.org/swap/price', POLICY)).toBe(false)
    expect(shouldPropagateTraceContext('https://api.dexscreener.com/latest/dex', POLICY)).toBe(false)
  })

  it('propagates to internal Lucid URLs', () => {
    expect(shouldPropagateTraceContext('https://router.lucid-l2.internal/v1/chat', POLICY)).toBe(true)
    expect(shouldPropagateTraceContext('https://worker.railway.internal/stream', POLICY)).toBe(true)
  })

  it('propagates to localhost (loopback)', () => {
    expect(shouldPropagateTraceContext('http://localhost:3001/v1/chat', POLICY)).toBe(true)
    expect(shouldPropagateTraceContext('http://127.0.0.1:8080/api', POLICY)).toBe(true)
  })

  it('does not propagate to localhost when loopback disabled', () => {
    const noLoopback: TracePropagationPolicy = { ...POLICY, allowLoopback: false }
    expect(shouldPropagateTraceContext('http://localhost:3001/v1/chat', noLoopback)).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(shouldPropagateTraceContext('not-a-url', POLICY)).toBe(false)
  })

  // ── injectTraceContextForTarget ────────────────────────

  it('does not inject trace headers for external provider URLs', () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const result = injectTraceContextForTarget(headers, 'https://api.openai.com/v1/chat/completions', POLICY)

    expect(result.traceparent).toBeUndefined()
    expect(result.tracestate).toBeUndefined()
  })

  it('injects trace headers for internal Lucid URLs', () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const result = injectTraceContextForTarget(headers, 'https://router.lucid-l2.internal/proxy/invoke/model/gpt-4o-mini', POLICY)

    expect(result.traceparent).toBeTruthy()
    expect(result.tracestate).toBeTruthy()
  })

  it('does not add x-lucid-run-id to external URLs', () => {
    const headers: Record<string, string> = {}
    const result = injectTraceContextForTarget(headers, 'https://api.openai.com/v1/chat', POLICY)
    // External URLs get no trace context at all
    expect(result.traceparent).toBeUndefined()
  })
})
