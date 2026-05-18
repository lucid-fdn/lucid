/**
 * router tests — Phase 5N.
 *
 * Covers:
 *   - Fast route meets floor → no upgrade
 *   - Fast fails → upgrade to strong
 *   - Strong fails, external not allowed → failed: true
 *   - External allowed via payload flag → upgrade all the way
 *   - Null floor short-circuits to first route
 *   - Approval steps pin to 1.0
 *   - Router version is stamped
 *   - Determinism: same input → byte-identical output
 *   - expectedVersion drift is recorded on the final note
 */

import { describe, expect, it, vi } from 'vitest'

import { ConfidenceRouter } from '../router.js'
import type { RouterInput } from '../types.js'
import { ROUTER_VERSION } from '../version.js'

const router = new ConfidenceRouter()

function buildInput(overrides: Partial<RouterInput> = {}): RouterInput {
  return {
    node: {
      step_type: 'inbound',
      route_class: 'fast',
      confidence_floor: 0.6,
      payload: {},
      ...(overrides.node ?? {}),
    },
    parentResults: overrides.parentResults ?? [],
    expectedVersion: overrides.expectedVersion,
  }
}

describe('ConfidenceRouter.score()', () => {
  it('fast route meets floor on its own → no upgrade', () => {
    // inbound/fast base = 0.7, no signals fire on `{}` + no parents.
    const decision = router.score(buildInput())
    expect(decision.failed).toBe(false)
    expect(decision.reason).toBeNull()
    expect(decision.source).toBe('router')
    expect(decision.upgradedTo).toBeNull()
    expect(decision.routerVersion).toBe(ROUTER_VERSION)
    expect(decision.observed).toBe(0.7)
    expect(decision.notes).toHaveLength(1)
    expect(decision.notes[0]?.route).toBe('fast')
    expect(decision.notes[0]?.base).toBe(0.7)
    expect(decision.notes[0]?.delta).toBe(0)
    expect(decision.notes[0]?.signalHits).toEqual([])
  })

  it('upgrades to strong when fast falls under the floor', () => {
    // fast=0.7 < 0.85, strong=0.88 ≥ 0.85 → admit on strong.
    const decision = router.score(
      buildInput({
        node: {
          step_type: 'inbound',
          route_class: 'fast',
          confidence_floor: 0.85,
          payload: {},
        },
      }),
    )
    expect(decision.failed).toBe(false)
    expect(decision.upgradedTo).toBe('strong')
    expect(decision.observed).toBe(0.88)
    expect(decision.notes).toHaveLength(2)
    expect(decision.notes[0]?.route).toBe('fast')
    expect(decision.notes[0]?.observed).toBe(0.7)
    expect(decision.notes[1]?.route).toBe('strong')
    expect(decision.notes[1]?.observed).toBe(0.88)
  })

  it('fails when even strong cannot meet the floor and external is opt-out', () => {
    // fast=0.7, strong=0.88, external not allowed → exhausted.
    const decision = router.score(
      buildInput({
        node: {
          step_type: 'inbound',
          route_class: 'fast',
          confidence_floor: 0.999,
          payload: {}, // external not allowed
        },
      }),
    )
    expect(decision.failed).toBe(true)
    expect(decision.reason).toBe('confidence_floor')
    expect(decision.upgradedTo).toBeNull()
    expect(decision.observed).toBe(0.88) // last attempted route's score
    // Should have tried fast + strong, NOT external.
    expect(decision.notes.map((n) => n.route)).toEqual(['fast', 'strong'])
  })

  it('walks all the way to external when payload opts in', () => {
    // fast=0.7, strong=0.88, external=0.95 ≥ 0.94 → admit on external.
    const decision = router.score(
      buildInput({
        node: {
          step_type: 'inbound',
          route_class: 'fast',
          confidence_floor: 0.94,
          payload: { allow_external_upgrade: true },
        },
      }),
    )
    expect(decision.failed).toBe(false)
    expect(decision.upgradedTo).toBe('external')
    expect(decision.observed).toBe(0.95)
    expect(decision.notes.map((n) => n.route)).toEqual(['fast', 'strong', 'external'])
  })

  it('null floor short-circuits on the first route', () => {
    const decision = router.score(
      buildInput({
        node: { step_type: 'inbound', route_class: 'fast', confidence_floor: null, payload: {} },
      }),
    )
    expect(decision.failed).toBe(false)
    expect(decision.upgradedTo).toBeNull()
    expect(decision.observed).toBe(0.7)
    expect(decision.notes).toHaveLength(1)
  })

  it('approval steps pin at 1.0 across every route', () => {
    const decision = router.score(
      buildInput({
        node: { step_type: 'approval', route_class: 'fast', confidence_floor: 0.95, payload: {} },
      }),
    )
    expect(decision.observed).toBe(1.0)
    expect(decision.failed).toBe(false)
    expect(decision.notes).toHaveLength(1)
    // Approval signal hit (delta=0 but audit trail records it).
    expect(decision.notes[0]?.signalHits).toContain('isApprovalStep')
  })

  it('stamps ROUTER_VERSION on every decision', () => {
    const success = router.score(buildInput())
    const failure = router.score(
      buildInput({
        node: { step_type: 'inbound', route_class: 'fast', confidence_floor: 0.999, payload: {} },
      }),
    )
    expect(success.routerVersion).toBe(ROUTER_VERSION)
    expect(failure.routerVersion).toBe(ROUTER_VERSION)
  })

  it('is deterministic: identical input → byte-identical JSON output', () => {
    const input = buildInput({
      node: {
        step_type: 'outbound',
        route_class: 'fast',
        confidence_floor: 0.85,
        payload: { tool_names: ['x'], schema: { type: 'object' } },
      },
      parentResults: [{ confidence_observed: 0.6 }],
    })
    const a = router.score(input)
    const b = router.score(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('records version drift on the last note when expectedVersion differs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const decision = router.score(buildInput({ expectedVersion: 'v0-ancient' }))
    const last = decision.notes[decision.notes.length - 1]
    expect(last?.driftFromVersion).toBe('v0-ancient')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not record drift when versions match', () => {
    const decision = router.score(buildInput({ expectedVersion: ROUTER_VERSION }))
    const last = decision.notes[decision.notes.length - 1]
    expect(last?.driftFromVersion).toBeUndefined()
  })
})
