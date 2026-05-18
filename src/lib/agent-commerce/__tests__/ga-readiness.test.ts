import { describe, expect, it } from 'vitest'
import {
  AGENT_COMMERCE_GA_EVIDENCE_GATES,
  evaluateAgentCommerceGaEvidence,
  type AgentCommerceGaEvidenceInput,
} from '../ga-readiness'

function completeEvidence(): AgentCommerceGaEvidenceInput {
  return {
    environment: 'staging',
    release: 'agent-commerce-ga-2026-05-02',
    evidence: Object.fromEntries(
      AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredEvidence]),
    ),
    commandResults: Object.fromEntries(
      AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredCommands]),
    ),
  } as AgentCommerceGaEvidenceInput
}

describe('Agent Commerce GA readiness evidence', () => {
  it('keeps GA blocked until staging and security evidence are attached', () => {
    const report = evaluateAgentCommerceGaEvidence({
      environment: 'staging',
      release: 'agent-commerce-ga-2026-05-02',
      evidence: {
        manual_agent_platform_live_rail: [
          'rail_readiness_has_live_agent_platform_rail',
          'manual_provider_durable_spend_flow',
          'runtime_tools_internal_api_only',
        ],
      },
      commandResults: {
        manual_agent_platform_live_rail: [
          'npm run agent-commerce:rail-readiness',
          'npm run test -- src/lib/agent-commerce',
        ],
      },
    })

    expect(report.ready).toBe(false)
    expect(report.results.find((result) => result.id === 'staging_reconciliation_beta_window'))
      .toMatchObject({
        ready: false,
        missingEvidence: expect.arrayContaining([
          'seven_day_reconciliation_job_history',
          'zero_untriaged_p0_p1_commerce_incidents',
        ]),
      })
    expect(report.results.find((result) => result.id === 'external_security_review'))
      .toMatchObject({
        ready: false,
        missingEvidence: expect.arrayContaining([
          'reviewer_identity',
          'zero_open_p0_p1_findings',
        ]),
      })
  })

  it('passes only when every local, staging, and security gate has evidence and command results', () => {
    const report = evaluateAgentCommerceGaEvidence(completeEvidence())

    expect(report.ready).toBe(true)
    expect(report.results.every((result) => result.ready)).toBe(true)
  })
})
