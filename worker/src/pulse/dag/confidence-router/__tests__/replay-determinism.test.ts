/**
 * Replay determinism — Phase 5N, Task 16.
 *
 * Contract: the confidence router is a pure function of
 * `(node, parentResults, ROUTER_VERSION)`. If you "fork" a DAG (clone
 * every node with the same step_type/route_class/confidence_floor/
 * payload and the same parent outputs) and re-score every leaf, you
 * must get byte-identical `observed`, `source`, `routerVersion`,
 * `upgradedTo`, and `notes` — the whole decision. No wall clock, no
 * randomness, no iteration over unordered structures.
 *
 * This is the property that makes replay trustworthy: a replayed run
 * will admit/gate the exact same nodes as the original, so historical
 * traces stay reproducible after Phase 5N rolls out.
 */

import { describe, expect, it } from 'vitest'

import { confidenceRouter } from '../router.js'
import type { RouterInput } from '../types.js'
import { ROUTER_VERSION } from '../version.js'

interface LeafFixture {
  key: string
  input: RouterInput
}

const fixtures: LeafFixture[] = [
  {
    key: 'a-fast-meets-floor',
    input: {
      node: { step_type: 'inbound', route_class: 'fast', confidence_floor: 0.6, payload: {} },
      parentResults: [],
      expectedVersion: null,
    },
  },
  {
    key: 'b-fast-fails-upgrades-to-strong',
    input: {
      node: { step_type: 'inbound', route_class: 'fast', confidence_floor: 0.85, payload: {} },
      parentResults: [],
      expectedVersion: null,
    },
  },
  {
    key: 'c-outbound-with-tool-calls-and-schema',
    input: {
      node: {
        step_type: 'outbound',
        route_class: 'fast',
        confidence_floor: 0.8,
        payload: { tool_names: ['send'], schema: { type: 'object' } },
      },
      parentResults: [{ confidence_observed: 0.95 }],
      expectedVersion: null,
    },
  },
  {
    key: 'd-parent-low-confidence-compounding',
    input: {
      node: { step_type: 'inbound', route_class: 'fast', confidence_floor: 0.7, payload: {} },
      parentResults: [{ confidence_observed: 0.5 }],
      expectedVersion: null,
    },
  },
  {
    key: 'e-external-opt-in',
    input: {
      node: {
        step_type: 'inbound',
        route_class: 'fast',
        confidence_floor: 0.94,
        payload: { allow_external_upgrade: true },
      },
      parentResults: [],
      expectedVersion: null,
    },
  },
]

describe('router replay determinism (Phase 5N Task 16)', () => {
  it('re-scoring a forked DAG produces byte-identical decisions', () => {
    // Original pass — the "first run" of the DAG.
    const original = fixtures.map((f) => ({
      key: f.key,
      decision: confidenceRouter.score(f.input),
    }))

    // Sanity: make sure we actually stamped the current version so the
    // test catches regressions in version handling.
    for (const { decision } of original) {
      expect(decision.routerVersion).toBe(ROUTER_VERSION)
    }

    // Fork pass — clone every fixture (as if DagReplay.fork had cloned
    // the DAG) and re-score. Inputs are structurally cloned so no
    // reference aliasing can hide nondeterminism.
    const forked = fixtures.map((f) => ({
      key: f.key,
      decision: confidenceRouter.score(structuredClone(f.input)),
    }))

    // Every replayed decision must be byte-identical to its original.
    for (let i = 0; i < original.length; i += 1) {
      const o = original[i]!
      const r = forked[i]!
      expect(r.key).toBe(o.key)
      expect(JSON.stringify(r.decision)).toBe(JSON.stringify(o.decision))
    }
  })

  it('a third run still matches — determinism is not an arity-of-two fluke', () => {
    const a = fixtures.map((f) => confidenceRouter.score(f.input))
    const b = fixtures.map((f) => confidenceRouter.score(f.input))
    const c = fixtures.map((f) => confidenceRouter.score(f.input))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(b)).toBe(JSON.stringify(c))
  })
})
