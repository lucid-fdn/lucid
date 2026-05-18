import { describe, expect, it } from 'vitest'

import {
  buildDesignOpsRuntimeContext,
  buildDesignVariantFingerprint,
  normalizeDesignVariantKey,
  serializeDesignOpsForRuntime,
} from '../design-ops'

describe('Design Ops', () => {
  it('serializes transparent taste profile and feedback runtime context', () => {
    const runtime = serializeDesignOpsForRuntime(buildDesignOpsRuntimeContext())

    expect(runtime).toMatchObject({
      schema_version: 1,
      profile_table: 'agent_ops_operator_profiles',
      feedback_table: 'agent_ops_design_feedback',
      taste_policy: {
        transparent: true,
        editable: true,
        hidden_manipulation: 'forbidden',
      },
    })
    expect(runtime.output_contract).toMatchObject({
      design_evidence: expect.arrayContaining(['variant_board', 'mockup', 'design_rationale']),
    })
  })

  it('normalizes variant keys and builds stable feedback fingerprints', () => {
    expect(normalizeDesignVariantKey(' Editorial Hero A ', 'variant-1')).toBe('editorial-hero-a')

    expect(buildDesignVariantFingerprint({
      orgId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      runId: '33333333-3333-4333-8333-333333333333',
      variantKey: 'editorial-hero-a',
      feedbackType: 'approval',
    })).toMatch(/^[a-f0-9]{64}$/)
  })
})
