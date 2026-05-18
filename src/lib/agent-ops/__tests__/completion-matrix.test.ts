import { describe, expect, it } from 'vitest'

import {
  AGENT_OPS_COMPLETION_AREAS,
  assertAgentOpsCompletionMatrixReady,
  getAgentOpsCompletionMatrixEvidence,
  listAgentOpsCompletionAreas,
  summarizeAgentOpsCompletionMatrix,
} from '../completion-matrix'

describe('Agent Ops completion matrix', () => {
  it('covers every shipped GStack-fit capability with source, tests, docs, and gate evidence', () => {
    const areas = listAgentOpsCompletionAreas()

    expect(areas.map((area) => area.id)).toEqual(expect.arrayContaining([
      'browser-procedure-registry',
      'browser-procedure-runtime-reuse',
      'host-playbooks',
      'browser-trust-shield',
      'live-browser-handoff',
      'pair-agent-browser-sharing',
      'design-ops-taste',
      'decision-pacing',
      'release-doc-quality',
      'eval-benchmark-center',
      'channel-native-agent-ops',
      'external-host-packs',
      'mission-control-quality-gates',
    ]))
    expect(areas).toHaveLength(13)
    for (const area of areas) {
      expect(area.status).toBe('verified')
      expect(area.sourceRefs.length).toBeGreaterThan(0)
      expect(area.testRefs.length).toBeGreaterThan(0)
      expect(area.docRefs.length).toBeGreaterThan(0)
      expect(area.qualityGateEvidence.length).toBeGreaterThan(0)
    }
  })

  it('keeps the closure matrix tenant-scoped and runtime, engine, and channel agnostic', () => {
    const summary = summarizeAgentOpsCompletionMatrix()

    expect(summary).toMatchObject({
      total: AGENT_OPS_COMPLETION_AREAS.length,
      implemented: AGENT_OPS_COMPLETION_AREAS.length,
      verified: AGENT_OPS_COMPLETION_AREAS.length,
      tenantScoped: AGENT_OPS_COMPLETION_AREAS.length,
      runtimeAgnostic: AGENT_OPS_COMPLETION_AREAS.length,
      engineAgnostic: AGENT_OPS_COMPLETION_AREAS.length,
      channelAgnostic: AGENT_OPS_COMPLETION_AREAS.length,
      missingEvidence: [],
    })
    expect(() => assertAgentOpsCompletionMatrixReady()).not.toThrow()
  })

  it('exposes stable evidence strings for the quality-gate pack without coupling to concrete runtimes', () => {
    const evidence = getAgentOpsCompletionMatrixEvidence()

    expect(evidence).toEqual(expect.arrayContaining([
      'completion:browser-procedure-registry',
      'completion:browser-trust-shield:trust_shield_events',
      'completion:eval-benchmark-center:procedure_quality_lift',
      'completion:mission-control-quality-gates:quality_gate_pack',
    ]))
    expect(evidence.some((item) => item.includes('openclaw') || item.includes('hermes'))).toBe(false)
  })

  it('does not route completion ownership through local JSONL, templates, or host-pack artifacts', () => {
    const ownershipRefs = listAgentOpsCompletionAreas().flatMap((area) => area.sourceRefs)

    expect(ownershipRefs.some((ref) => ref.endsWith('.jsonl'))).toBe(false)
    expect(ownershipRefs.some((ref) => ref.startsWith('src/lib/templates'))).toBe(false)
    expect(ownershipRefs.some((ref) => ref.startsWith('docs/generated/host-packs/'))).toBe(false)
  })
})
