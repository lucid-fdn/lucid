/**
 * Router monotonicity invariant — Phase 5N.
 *
 * Locks in the core contract: for every step type and every combination
 * of signal hits, the *post-delta* observed scores are monotonically
 * non-decreasing across the upgrade loop:
 *
 *   observed(fast) ≤ observed(strong) ≤ observed(external)
 *
 * Why this matters: the upgrade loop's correctness assumes that moving
 * from fast → strong → external can only IMPROVE the score. If a signal
 * delta ever inverted that order, a node might pass `fast` but fail
 * `strong` on retry, causing non-deterministic admission under bounded
 * signal deltas. This test freezes the invariant against future
 * signal/base-score edits.
 *
 * Proof sketch (as of v1-2026-04-07):
 *   - Base scores are monotonic: asserted by scoring-table.test.ts.
 *   - `hasLongInput` (-0.05) and `requiresToolCalls` (-0.08) ONLY hit
 *     on `fast`, so they strictly widen the gap strong−fast.
 *   - `parentHadLowConfidence` (-0.1) and `payloadHasStrictSchema`
 *     (+0.03) apply equally to all 3 routes → preserve order.
 *   - `isApprovalStep` has 0 delta → no effect.
 *   - Clamping to [0, 1] preserves order (monotonic function).
 */

import { describe, expect, it } from 'vitest'

import { ConfidenceRouter } from '../router.js'
import type { RouterInput, RouterNode, StepType, RouteClass } from '../types.js'

const router = new ConfidenceRouter()
const STEP_TYPES: StepType[] = ['inbound', 'outbound', 'scheduled', 'webhook', 'approval']

interface SignalKnobs {
  longInput: boolean
  toolCalls: boolean
  lowParent: boolean
  strictSchema: boolean
}

/** Build a payload that triggers exactly the requested signals. */
function buildPayload(k: SignalKnobs): Record<string, unknown> {
  const payload: Record<string, unknown> = { allow_external_upgrade: true }
  if (k.longInput) {
    // Must serialize to > 4000 chars to trigger hasLongInput.
    payload.filler = 'x'.repeat(4100)
  }
  if (k.toolCalls) {
    payload.tool_names = ['wallet_balance']
  }
  if (k.strictSchema) {
    payload.schema = { type: 'object', properties: {} }
  }
  return payload
}

function buildInput(
  step_type: StepType,
  route_class: RouteClass,
  k: SignalKnobs,
): RouterInput {
  const node: RouterNode = {
    step_type,
    route_class,
    // Null floor → router returns at the starting route without looping.
    confidence_floor: null,
    payload: buildPayload(k),
  }
  return {
    node,
    parentResults: k.lowParent ? [{ confidence_observed: 0.4 }] : [],
  }
}

/** Enumerate all 2^4 = 16 signal combinations. */
function allSignalCombos(): SignalKnobs[] {
  const out: SignalKnobs[] = []
  for (let mask = 0; mask < 16; mask++) {
    out.push({
      longInput: (mask & 1) !== 0,
      toolCalls: (mask & 2) !== 0,
      lowParent: (mask & 4) !== 0,
      strictSchema: (mask & 8) !== 0,
    })
  }
  return out
}

describe('ConfidenceRouter — monotonicity invariant', () => {
  for (const step_type of STEP_TYPES) {
    for (const k of allSignalCombos()) {
      const label = `${step_type} | long=${+k.longInput} tool=${+k.toolCalls} lowParent=${+k.lowParent} schema=${+k.strictSchema}`
      it(`observed(fast) ≤ observed(strong) ≤ observed(external) — ${label}`, () => {
        const fast = router.score(buildInput(step_type, 'fast', k))
        const strong = router.score(buildInput(step_type, 'strong', k))
        const external = router.score(buildInput(step_type, 'external', k))

        // Sanity: each call returned a decision for the requested route.
        expect(fast.notes[0]?.route).toBe('fast')
        expect(strong.notes[0]?.route).toBe('strong')
        expect(external.notes[0]?.route).toBe('external')

        // The invariant:
        expect(fast.observed).toBeLessThanOrEqual(strong.observed)
        expect(strong.observed).toBeLessThanOrEqual(external.observed)

        // All observed scores stay in [0, 1] (clamp contract).
        for (const v of [fast.observed, strong.observed, external.observed]) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      })
    }
  }

  it('fast-only negatives strictly widen strong−fast when they hit', () => {
    // Long input + tool calls ON, nothing else. strong should beat fast
    // by at least 0.05 + 0.08 = 0.13 on non-approval non-webhook types
    // (where base scores have headroom and nothing clamps).
    const k: SignalKnobs = {
      longInput: true,
      toolCalls: true,
      lowParent: false,
      strictSchema: false,
    }
    for (const step_type of ['inbound', 'outbound', 'scheduled'] as StepType[]) {
      const fast = router.score(buildInput(step_type, 'fast', k))
      const strong = router.score(buildInput(step_type, 'strong', k))
      // strong − fast >= 0.13 minus base-score gap (which is positive).
      expect(strong.observed - fast.observed).toBeGreaterThanOrEqual(0.13 - 1e-9)
    }
  })
})
