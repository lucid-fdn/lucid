import { describe, expect, it } from 'vitest'
import {
  AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE,
  summarizeAgentCommerceSecurityReviewEvidence,
  type AgentCommerceSecurityReviewPacket,
} from '../security-review-evidence'

function packet(overrides: Partial<AgentCommerceSecurityReviewPacket> = {}): AgentCommerceSecurityReviewPacket {
  return {
    release: 'agent-commerce-ga-2026-05-07',
    environment: 'staging',
    reviewer: {
      name: 'External Reviewer',
      organization: 'Independent Security Partner',
      independence: 'external',
      identity_url: 'https://example.com/security/reviewer',
    },
    review: {
      date: '2026-05-07',
      scope: [...AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE],
      scope_url: 'https://example.com/security/scope',
      findings_disposition_url: 'https://example.com/security/findings',
      zero_open_p0_p1_findings_url: 'https://example.com/security/zero-open',
      reviewer_attested_zero_open_p0_p1: true,
    },
    findings: [
      {
        id: 'AC-SEC-001',
        title: 'Resolved documentation finding',
        severity: 'P3',
        status: 'mitigated',
      },
    ],
    commandResults: [
      'npm run agent-commerce:l2-gates',
      'npm run agent-commerce:dashboard',
      'npm run agent-commerce:rail-readiness',
      'npm run stack:boundaries',
    ],
    ...overrides,
  }
}

describe('Agent Commerce security review evidence', () => {
  it('proves external security review readiness from a complete reviewer packet', () => {
    const summary = summarizeAgentCommerceSecurityReviewEvidence(packet())

    expect(summary.ready).toBe(true)
    expect(summary.missingEvidence).toEqual([])
    expect(summary.missing_scope).toEqual([])
    expect(summary.findings.open_p0_p1).toBe(0)
    expect(summary.evidence).toEqual([
      'reviewer_identity',
      'review_scope',
      'review_date',
      'findings_disposition',
      'zero_open_p0_p1_findings',
    ])
  })

  it('keeps the gate open for incomplete scope or open P0/P1 findings', () => {
    const summary = summarizeAgentCommerceSecurityReviewEvidence(packet({
      review: {
        ...packet().review,
        scope: ['control_plane_apis'],
      },
      findings: [
        {
          id: 'AC-SEC-P0',
          title: 'Open critical finding',
          severity: 'P0',
          status: 'open',
        },
      ],
    }))

    expect(summary.ready).toBe(false)
    expect(summary.missingEvidence).toEqual(expect.arrayContaining([
      'review_scope',
      'findings_disposition',
      'zero_open_p0_p1_findings',
    ]))
    expect(summary.missing_scope).toEqual(expect.arrayContaining([
      'runtime_tools',
      'provider_adapters',
      'webhooks',
    ]))
    expect(summary.findings.open_p0_p1).toBe(1)
  })
})
