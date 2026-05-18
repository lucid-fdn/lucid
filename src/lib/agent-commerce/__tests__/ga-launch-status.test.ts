import { describe, expect, it } from 'vitest'
import type { AgentCommerceGaEvidenceInput } from '../ga-readiness'
import { AGENT_COMMERCE_GA_EVIDENCE_GATES } from '../ga-readiness'
import {
  AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS,
  createAgentCommerceGaFinalLocalGate,
  type AgentCommerceGaFinalLocalGate,
} from '../ga-final-local-gate'
import {
  createAgentCommerceGaLaunchStatus,
  hashAgentCommerceGaLaunchStatus,
  verifyAgentCommerceGaLaunchStatus,
} from '../ga-launch-status'
import type { AgentCommerceGaReleaseDossierVerificationResult } from '../ga-release-bundle'
import type { AgentCommerceSecurityReviewEvidenceSummary } from '../security-review-evidence'
import type { AgentCommerceStagingReconciliationEvidenceSummary } from '../staging-reconciliation-evidence'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function completeGaEvidence(overrides: Partial<AgentCommerceGaEvidenceInput> = {}): AgentCommerceGaEvidenceInput {
  return {
    environment: 'staging',
    release: 'agent-commerce-ga-2026-05-09',
    evidence: Object.fromEntries(
      AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredEvidence]),
    ),
    commandResults: Object.fromEntries(
      AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredCommands]),
    ),
    links: {},
    ...overrides,
  } as AgentCommerceGaEvidenceInput
}

function readyDossierVerification(): AgentCommerceGaReleaseDossierVerificationResult {
  return {
    ready: true,
    dossierReady: true,
    dossierHashValid: true,
    dossierSelfConsistent: true,
    dossierBoundToIndex: true,
    artifactIndexReady: true,
    artifactIndexVerificationReady: true,
    markdownMatches: true,
    expectedDossierHash: HASH_A,
    actualDossierHash: HASH_A,
    expectedMarkdownSha256: HASH_B,
    actualMarkdownSha256: HASH_B,
    expectedBlockers: [],
    actualBlockers: [],
    dossierFieldMismatches: [],
  }
}

function readyFinalLocalGate(): AgentCommerceGaFinalLocalGate {
  return createAgentCommerceGaFinalLocalGate({
    dossierVerification: readyDossierVerification(),
    evaluatedAt: '2026-05-09T02:00:00.000Z',
    commands: AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.map((command) => ({
      id: command.id,
      command: command.command,
      exit_code: 0,
      passed: true,
      duration_ms: 100,
    })),
  })
}

function readyStaging(): AgentCommerceStagingReconciliationEvidenceSummary {
  return {
    ready: true,
    evidence: [
      'seven_day_reconciliation_job_history',
      'stale_approval_reconciliation_log',
      'stuck_credential_reconciliation_log',
      'provider_mismatch_triage_log',
      'zero_untriaged_p0_p1_commerce_incidents',
    ],
    missingEvidence: [],
    window: {
      start_at: '2026-05-03T00:00:00.000Z',
      end_at: '2026-05-09T23:59:59.000Z',
      days: 7,
      required_run_days: 7,
    },
    observed_run_days: [
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
    ],
    total_runs: 7,
    total_updates: 0,
    stale_approval_reconciled_count: 0,
    stuck_credential_reconciled_count: 0,
    provider_mismatch_triage_count: 0,
    untriaged_p0_p1_incidents: 0,
  }
}

function readySecurity(): AgentCommerceSecurityReviewEvidenceSummary {
  return {
    ready: true,
    evidence: [
      'reviewer_identity',
      'review_scope',
      'review_date',
      'findings_disposition',
      'zero_open_p0_p1_findings',
    ],
    missingEvidence: [],
    release: 'agent-commerce-ga-2026-05-09',
    environment: 'staging',
    reviewer: {
      name: 'External Reviewer',
      organization: 'Independent Security Partner',
      independence: 'external',
      identity_url: 'https://example.com/security/reviewer',
    },
    review_date: '2026-05-09',
    required_scope: [
      'control_plane_apis',
      'runtime_tools',
      'provider_adapters',
      'webhooks',
      'machine_payments',
      'generated_app_paid_actions',
      'wallet_execution_guard',
      'lucid_l2_p0_gates',
      'ga_evidence_gates',
      'operator_runbooks',
    ],
    covered_scope: [
      'control_plane_apis',
      'runtime_tools',
      'provider_adapters',
      'webhooks',
      'machine_payments',
      'generated_app_paid_actions',
      'wallet_execution_guard',
      'lucid_l2_p0_gates',
      'ga_evidence_gates',
      'operator_runbooks',
    ],
    missing_scope: [],
    findings: {
      total: 0,
      open_p0_p1: 0,
      undispositioned: 0,
    },
    links: {
      reviewer_identity: 'https://example.com/security/reviewer',
      review_scope: 'https://example.com/security/scope',
      findings_disposition: 'https://example.com/security/findings',
      zero_open_p0_p1_findings: 'https://example.com/security/zero-open-p0-p1',
    },
  }
}

describe('Agent Commerce GA launch status', () => {
  it('creates a ready launch status when local and external gates are complete', () => {
    const status = createAgentCommerceGaLaunchStatus({
      gaEvidence: completeGaEvidence(),
      finalLocalGate: readyFinalLocalGate(),
      stagingReconciliation: readyStaging(),
      securityReview: readySecurity(),
      evaluatedAt: '2026-05-09T03:00:00.000Z',
    })

    expect(status.ready).toBe(true)
    expect(status.blockers).toEqual([])
    expect(status.ga_readiness.ready).toBe(true)
    expect(status.staging_reconciliation.ready).toBe(true)
    expect(status.external_security_review.ready).toBe(true)
    expect(status.lucid_l2_execution).toMatchObject({
      required: false,
      ready: true,
      missing_closure_ids: [],
    })
    expect(status.launch_status_hash).toBe(hashAgentCommerceGaLaunchStatus(status))
  })

  it('stays blocked until required real-world launch evidence is attached', () => {
    const status = createAgentCommerceGaLaunchStatus({
      gaEvidence: completeGaEvidence({
        evidence: {},
        commandResults: {},
      }),
      finalLocalGate: {
        ...readyFinalLocalGate(),
        ready: false,
        blockers: ['required_command_failed'],
      },
      requiredProviderPromotions: ['stripe_link_agents'],
      requiresLucidL2Execution: true,
      evaluatedAt: '2026-05-09T03:00:00.000Z',
    })

    expect(status.ready).toBe(false)
    expect(status.blockers).toEqual(expect.arrayContaining([
      'final_local_gate_not_ready',
      'ga_evidence_not_ready',
      'staging_reconciliation_summary_missing',
      'external_security_review_summary_missing',
      'required_provider_promotion_missing',
      'lucid_l2_upstream_p0_unclosed',
    ]))
    expect(status.provider_promotions.missing_required_provider_ids).toEqual(['stripe_link_agents'])
    expect(status.lucid_l2_execution.missing_closure_ids).toEqual([
      'P0-L2-001',
      'P0-L2-002',
      'P0-L2-003',
    ])
  })

  it('verifies launch status against the current release evidence inputs', () => {
    const gaEvidence = completeGaEvidence()
    const finalLocalGate = readyFinalLocalGate()
    const stagingReconciliation = readyStaging()
    const securityReview = readySecurity()
    const status = createAgentCommerceGaLaunchStatus({
      gaEvidence,
      finalLocalGate,
      stagingReconciliation,
      securityReview,
      evaluatedAt: '2026-05-09T03:00:00.000Z',
    })

    const verification = verifyAgentCommerceGaLaunchStatus(status, {
      gaEvidence,
      finalLocalGate,
      stagingReconciliation,
      securityReview,
    })

    expect(verification).toMatchObject({
      ready: true,
      launchStatusReady: true,
      launchStatusHashValid: true,
      launchStatusSelfConsistent: true,
      finalLocalGateReady: true,
      gaReadinessReady: true,
      stagingReconciliationReady: true,
      externalSecurityReviewReady: true,
      requiredProviderPromotionsReady: true,
      lucidL2ExecutionReady: true,
      expectedLaunchStatusHash: status.launch_status_hash,
      actualLaunchStatusHash: status.launch_status_hash,
      expectedBlockers: [],
      actualBlockers: [],
      launchStatusFieldMismatches: [],
    })
  })

  it('rejects tampered launch status hashes and copied status drift', () => {
    const gaEvidence = completeGaEvidence()
    const finalLocalGate = readyFinalLocalGate()
    const stagingReconciliation = readyStaging()
    const securityReview = readySecurity()
    const status = createAgentCommerceGaLaunchStatus({
      gaEvidence,
      finalLocalGate,
      stagingReconciliation,
      securityReview,
      evaluatedAt: '2026-05-09T03:00:00.000Z',
    })

    const verification = verifyAgentCommerceGaLaunchStatus({
      ...status,
      launch_status_hash: HASH_B,
      staging_reconciliation: {
        ...status.staging_reconciliation,
        ready: false,
      },
    }, {
      gaEvidence,
      finalLocalGate,
      stagingReconciliation,
      securityReview,
    })

    expect(verification.ready).toBe(false)
    expect(verification.launchStatusHashValid).toBe(false)
    expect(verification.launchStatusSelfConsistent).toBe(false)
    expect(verification.stagingReconciliationReady).toBe(false)
    expect(verification.launchStatusFieldMismatches).toEqual(['staging_reconciliation'])
  })
})
