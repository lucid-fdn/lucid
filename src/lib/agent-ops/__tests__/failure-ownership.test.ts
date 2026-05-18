import { describe, expect, it } from 'vitest'

import {
  AGENT_OPS_FAILURE_OWNERSHIP_KINDS,
  buildAgentOpsFailureOwnershipInstructions,
  normalizeAgentOpsFailureOwnership,
  readAgentOpsFailureOwnershipFromMetadata,
  serializeAgentOpsFailureOwnership,
} from '../failure-ownership'

describe('Agent Ops failure ownership', () => {
  it('normalizes the supported ownership categories', () => {
    for (const kind of AGENT_OPS_FAILURE_OWNERSHIP_KINDS) {
      expect(normalizeAgentOpsFailureOwnership({ kind })?.kind).toBe(kind)
    }
  })

  it('accepts human-friendly category spelling and clamps confidence', () => {
    expect(normalizeAgentOpsFailureOwnership({
      kind: 'Flaky Test',
      confidence: 3,
      reason: 'Timed out once and passed on retry.',
      owner_team: 'QA',
      requiresHuman: true,
    })).toEqual({
      kind: 'flaky_test',
      label: 'Flaky test',
      confidence: 1,
      reason: 'Timed out once and passed on retry.',
      owner: 'QA',
      requiresHuman: true,
    })
  })

  it('round-trips from finding metadata', () => {
    const ownership = readAgentOpsFailureOwnershipFromMetadata({
      failure_ownership: {
        kind: 'infra_issue',
        confidence: 0.64,
      },
    })

    expect(ownership).toMatchObject({
      kind: 'infra_issue',
      label: 'Infrastructure issue',
      confidence: 0.64,
    })
    expect(serializeAgentOpsFailureOwnership(ownership!)).toMatchObject({
      kind: 'infra_issue',
      requires_human: false,
    })
  })

  it('only emits prompt instructions for failure-ownership workflows', () => {
    expect(buildAgentOpsFailureOwnershipInstructions('qa')).toContain('metadata.failure_ownership')
    expect(buildAgentOpsFailureOwnershipInstructions('retro')).toContain('product_bug')
    expect(buildAgentOpsFailureOwnershipInstructions('review')).toBeNull()
  })
})
