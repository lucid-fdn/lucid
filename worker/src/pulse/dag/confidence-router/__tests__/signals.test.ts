/**
 * signals tests — Phase 5N.
 *
 * Each signal MUST:
 *   - Return { hit: false, delta: 0 } when it doesn't apply
 *   - Return a bounded delta when it does
 *   - Be pure (no wall clock, no randomness, no IO)
 *
 * applySignals() MUST:
 *   - Push every firing signal's name into note.signalHits
 *   - Return the (unclamped) sum of deltas
 */

import { describe, expect, it } from 'vitest'

import {
  applySignals,
  hasLongInput,
  isApprovalStep,
  parentHadLowConfidence,
  payloadHasStrictSchema,
  requiresToolCalls,
  SIGNALS,
} from '../signals.js'
import type { RouterInput, RouterNote } from '../types.js'

function buildInput(overrides: Partial<RouterInput> = {}): RouterInput {
  return {
    node: {
      step_type: 'inbound',
      route_class: 'fast',
      confidence_floor: 0.7,
      payload: {},
      ...(overrides.node ?? {}),
    },
    parentResults: overrides.parentResults ?? [],
    expectedVersion: overrides.expectedVersion,
  }
}

function emptyNote(): RouterNote {
  return { route: 'fast', base: 0, delta: 0, observed: 0, signalHits: [] }
}

describe('hasLongInput', () => {
  it('fires on fast route when payload JSON > 4000 chars', () => {
    const big = { text: 'x'.repeat(5000) }
    const result = hasLongInput(buildInput({ node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: big } }), 'fast')
    expect(result.hit).toBe(true)
    expect(result.delta).toBe(-0.05)
  })

  it('misses on small payloads', () => {
    const result = hasLongInput(buildInput(), 'fast')
    expect(result.hit).toBe(false)
    expect(result.delta).toBe(0)
  })

  it('does not fire on strong or external routes', () => {
    const big = { text: 'x'.repeat(5000) }
    const input = buildInput({ node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: big } })
    expect(hasLongInput(input, 'strong').hit).toBe(false)
    expect(hasLongInput(input, 'external').hit).toBe(false)
  })
})

describe('requiresToolCalls', () => {
  it('fires on fast route when payload.tool_names has entries', () => {
    const input = buildInput({
      node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: { tool_names: ['foo'] } },
    })
    const result = requiresToolCalls(input, 'fast')
    expect(result.hit).toBe(true)
    expect(result.delta).toBe(-0.08)
  })

  it('misses when tool_names is empty or missing', () => {
    expect(requiresToolCalls(buildInput(), 'fast').hit).toBe(false)
    expect(
      requiresToolCalls(
        buildInput({ node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: { tool_names: [] } } }),
        'fast',
      ).hit,
    ).toBe(false)
  })

  it('does not fire on non-fast routes', () => {
    const input = buildInput({
      node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: { tool_names: ['foo'] } },
    })
    expect(requiresToolCalls(input, 'strong').hit).toBe(false)
  })
})

describe('parentHadLowConfidence', () => {
  it('fires when any parent is below 0.7', () => {
    const input = buildInput({ parentResults: [{ confidence_observed: 0.9 }, { confidence_observed: 0.5 }] })
    const result = parentHadLowConfidence(input, 'fast')
    expect(result.hit).toBe(true)
    expect(result.delta).toBe(-0.1)
  })

  it('misses when all parents are confident', () => {
    const input = buildInput({ parentResults: [{ confidence_observed: 0.9 }, { confidence_observed: 0.85 }] })
    expect(parentHadLowConfidence(input, 'fast').hit).toBe(false)
  })

  it('misses with empty parentResults', () => {
    expect(parentHadLowConfidence(buildInput(), 'fast').hit).toBe(false)
  })

  it('ignores parents with null confidence', () => {
    const input = buildInput({ parentResults: [{ confidence_observed: null }] })
    expect(parentHadLowConfidence(input, 'fast').hit).toBe(false)
  })
})

describe('payloadHasStrictSchema', () => {
  it('fires when payload.schema is an object', () => {
    const input = buildInput({
      node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: { schema: { type: 'object' } } },
    })
    const result = payloadHasStrictSchema(input, 'fast')
    expect(result.hit).toBe(true)
    expect(result.delta).toBe(0.03)
  })

  it('misses when schema is missing or non-object', () => {
    expect(payloadHasStrictSchema(buildInput(), 'fast').hit).toBe(false)
    expect(
      payloadHasStrictSchema(
        buildInput({ node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: { schema: 'x' } } }),
        'fast',
      ).hit,
    ).toBe(false)
  })
})

describe('isApprovalStep', () => {
  it('fires (no delta) for approval steps', () => {
    const input = buildInput({ node: { step_type: 'approval', route_class: 'fast', confidence_floor: null, payload: {} } })
    const result = isApprovalStep(input, 'fast')
    expect(result.hit).toBe(true)
    expect(result.delta).toBe(0)
  })

  it('misses for non-approval steps', () => {
    expect(isApprovalStep(buildInput(), 'fast').hit).toBe(false)
  })
})

describe('applySignals()', () => {
  it('aggregates all firing signals and records their names', () => {
    const input = buildInput({
      node: {
        step_type: 'inbound',
        route_class: 'fast',
        confidence_floor: null,
        payload: { tool_names: ['a'], schema: { type: 'object' } },
      },
      parentResults: [{ confidence_observed: 0.5 }],
    })
    const note = emptyNote()
    const total = applySignals(input, 'fast', note)
    // tool_names (-0.08) + parent low (-0.10) + schema (+0.03) = -0.15
    expect(total).toBeCloseTo(-0.15, 5)
    expect(note.signalHits).toContain('requiresToolCalls')
    expect(note.signalHits).toContain('parentHadLowConfidence')
    expect(note.signalHits).toContain('payloadHasStrictSchema')
  })

  it('returns 0 with empty hits when nothing fires', () => {
    const note = emptyNote()
    const total = applySignals(buildInput(), 'strong', note)
    expect(total).toBe(0)
    expect(note.signalHits).toEqual([])
  })

  it('preserves canonical signal order', () => {
    expect(SIGNALS.map((s) => s.name)).toEqual([
      'hasLongInput',
      'requiresToolCalls',
      'parentHadLowConfidence',
      'payloadHasStrictSchema',
      'isApprovalStep',
    ])
  })
})
