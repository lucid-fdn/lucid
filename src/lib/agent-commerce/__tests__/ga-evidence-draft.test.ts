import { describe, expect, it } from 'vitest'
import { evaluateAgentCommerceGaEvidence } from '../ga-readiness'
import { collectAgentCommerceGaEvidenceDraft } from '../ga-evidence-draft'
import { summarizeAgentCommerceStagingReconciliationEvidence } from '../staging-reconciliation-evidence'
import {
  AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE,
  summarizeAgentCommerceSecurityReviewEvidence,
} from '../security-review-evidence'
import { STRIPE_LINK_AGENTS_PROVIDER_MANIFEST } from '../providers/stripe-link'
import { summarizeAgentCommerceProviderPromotionEvidencePacket } from '../provider-promotion'

const URLS = {
  reconciliationHistoryUrl: 'https://example.com/logs/reconciliation-history',
  staleApprovalReconciliationUrl: 'https://example.com/logs/stale-approvals',
  stuckCredentialReconciliationUrl: 'https://example.com/logs/stuck-credentials',
  providerMismatchTriageUrl: 'https://example.com/logs/provider-mismatches',
  incidentStatusUrl: 'https://example.com/incidents/agent-commerce',
  securityReviewUrl: 'https://example.com/security/agent-commerce-review',
  securityFindingsDispositionUrl: 'https://example.com/security/agent-commerce-disposition',
  zeroOpenSecurityFindingsUrl: 'https://example.com/security/agent-commerce-zero-open',
}

describe('Agent Commerce GA evidence draft collector', () => {
  it('auto-fills local evidence while keeping external staging and security gates open', () => {
    const draft = collectAgentCommerceGaEvidenceDraft({
      release: 'agent-commerce-ga-2026-05-02',
      includeLocalEvidence: true,
    })
    const report = evaluateAgentCommerceGaEvidence(draft)

    expect(report.ready).toBe(false)
    expect(report.results.find((result) => result.id === 'manual_agent_platform_live_rail')?.ready).toBe(true)
    expect(report.results.find((result) => result.id === 'manual_seller_live_rail')?.ready).toBe(true)
    expect(report.results.find((result) => result.id === 'production_dashboard_operational')?.ready).toBe(true)
    expect(report.results.find((result) => result.id === 'lucid_l2_p0_execution_blocked')?.ready).toBe(true)
    expect(report.results.find((result) => result.id === 'staging_reconciliation_beta_window'))
      .toMatchObject({
        ready: false,
        missingEvidence: expect.arrayContaining(['seven_day_reconciliation_job_history']),
        missingCommands: [],
      })
    expect(report.results.find((result) => result.id === 'external_security_review'))
      .toMatchObject({
        ready: false,
        missingEvidence: expect.arrayContaining(['reviewer_identity']),
        missingCommands: [],
      })
  })

  it('produces a ready evidence file when local checks and external artifact URLs are present', () => {
    const draft = collectAgentCommerceGaEvidenceDraft({
      release: 'agent-commerce-ga-2026-05-02',
      includeLocalEvidence: true,
      externalRefs: URLS,
    })
    const report = evaluateAgentCommerceGaEvidence(draft)

    expect(report.ready).toBe(true)
    expect(draft.links).toMatchObject({
      reconciliation_job_history: URLS.reconciliationHistoryUrl,
      security_review: URLS.securityReviewUrl,
      zero_open_security_findings: URLS.zeroOpenSecurityFindingsUrl,
    })
  })

  it('uses machine-verifiable staging reconciliation evidence without requiring staging log URLs', () => {
    const stagingReconciliation = summarizeAgentCommerceStagingReconciliationEvidence({
      events: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
        event_type: 'reconciliation.completed',
        created_at: `2026-05-${String(day).padStart(2, '0')}T12:00:00.000Z`,
        payload: {
          actions: [
            { entity_type: 'spend_request', action: 'expired', updated_count: 0 },
            { entity_type: 'spend_request', action: 'credential_issuing_stuck', updated_count: 0 },
          ],
          provider_event_mismatches: 0,
        },
      })),
      now: '2026-05-07T23:59:59.000Z',
      untriagedP0P1IncidentCount: 0,
    })

    const draft = collectAgentCommerceGaEvidenceDraft({
      release: 'agent-commerce-ga-2026-05-02',
      includeLocalEvidence: true,
      stagingReconciliation,
    })
    const report = evaluateAgentCommerceGaEvidence(draft)

    expect(report.results.find((result) => result.id === 'staging_reconciliation_beta_window')?.ready).toBe(true)
    expect(report.ready).toBe(false)
    expect(report.results.find((result) => result.id === 'external_security_review')?.ready).toBe(false)
  })

  it('uses a reviewer packet summary to close the external security review evidence gate', () => {
    const securityReview = summarizeAgentCommerceSecurityReviewEvidence({
      release: 'agent-commerce-ga-2026-05-02',
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
      findings: [],
      commandResults: [],
    })

    const draft = collectAgentCommerceGaEvidenceDraft({
      release: 'agent-commerce-ga-2026-05-02',
      includeLocalEvidence: true,
      externalRefs: {
        reconciliationHistoryUrl: URLS.reconciliationHistoryUrl,
        staleApprovalReconciliationUrl: URLS.staleApprovalReconciliationUrl,
        stuckCredentialReconciliationUrl: URLS.stuckCredentialReconciliationUrl,
        providerMismatchTriageUrl: URLS.providerMismatchTriageUrl,
        incidentStatusUrl: URLS.incidentStatusUrl,
      },
      securityReview,
    })
    const report = evaluateAgentCommerceGaEvidence(draft)

    expect(report.ready).toBe(true)
    expect(draft.links).toMatchObject({
      security_reviewer_identity: 'https://example.com/security/reviewer',
      security_review_scope: 'https://example.com/security/scope',
      zero_open_security_findings: 'https://example.com/security/zero-open',
    })
  })

  it('carries provider promotion summaries and keeps GA blocked when any included provider is not ready', () => {
    const blockedPromotion = summarizeAgentCommerceProviderPromotionEvidencePacket({
      manifests: [STRIPE_LINK_AGENTS_PROVIDER_MANIFEST],
      packet: {
        release: 'agent-commerce-stripe-link-live-2026-05-07',
        environment: 'staging',
        provider: 'stripe_link_agents',
        target_mode: 'live',
        adapter: {
          registered: true,
          provider_version: 'stripe-api-2026-02-25.clover-link-agents',
          implementation_ref: 'src/lib/agent-commerce/providers/stripe-link-agents.ts',
        },
        evidence: ['provider_adapter_registered'],
        links: {
          account_access: 'https://example.com/stripe/account-access',
        },
        attestation: {
          account_access_approved: false,
          no_raw_credential_persistence: false,
          idempotency_before_provider_side_effects: false,
          ledger_budget_reservation_before_provider_side_effects: false,
          webhook_signature_and_dedupe_verified: false,
          reconciliation_mapping_verified: false,
          fail_closed_paths_verified: false,
        },
      },
    })

    const draft = collectAgentCommerceGaEvidenceDraft({
      release: 'agent-commerce-ga-2026-05-02',
      includeLocalEvidence: true,
      externalRefs: URLS,
      providerPromotions: [blockedPromotion],
    })
    const report = evaluateAgentCommerceGaEvidence(draft)

    expect(report.ready).toBe(false)
    expect(report.providerPromotions).toHaveLength(1)
    expect(report.providerPromotions[0]).toMatchObject({
      provider: 'stripe_link_agents',
      ready: false,
      blockers: expect.arrayContaining(['account_access_evidence_missing']),
    })
  })

  it('keeps GA ready when included provider promotion summaries are ready', () => {
    const readyPromotion = summarizeAgentCommerceProviderPromotionEvidencePacket({
      manifests: [STRIPE_LINK_AGENTS_PROVIDER_MANIFEST],
      packet: {
        release: 'agent-commerce-stripe-link-live-2026-05-07',
        environment: 'staging',
        provider: 'stripe_link_agents',
        target_mode: 'live',
        adapter: {
          registered: true,
          provider_version: 'stripe-api-2026-02-25.clover-link-agents',
          implementation_ref: 'src/lib/agent-commerce/providers/stripe-link-agents.ts',
        },
        evidence: [
          'provider_adapter_registered',
          'idempotency_before_provider_side_effects',
          'ledger_budget_reservation_before_provider_side_effects',
          'no_raw_credential_persistence_tested',
          'fail_closed_provider_tests',
          'account_access_approved',
          'secret_ref_configured',
          'webhook_signature_verified',
          'webhook_dedupe_enabled',
          'reconciliation_mapping_tested',
          'stripe_link_stable_api_access',
          'oauth_callback_verified',
        ],
        links: {
          account_access: 'https://example.com/stripe/account-access',
        },
        attestation: {
          account_access_approved: true,
          no_raw_credential_persistence: true,
          idempotency_before_provider_side_effects: true,
          ledger_budget_reservation_before_provider_side_effects: true,
          webhook_signature_and_dedupe_verified: true,
          reconciliation_mapping_verified: true,
          fail_closed_paths_verified: true,
        },
      },
    })

    const draft = collectAgentCommerceGaEvidenceDraft({
      release: 'agent-commerce-ga-2026-05-02',
      includeLocalEvidence: true,
      externalRefs: URLS,
      providerPromotions: [readyPromotion],
    })

    expect(evaluateAgentCommerceGaEvidence(draft).ready).toBe(true)
    expect(draft.links).toMatchObject({
      provider_promotion_stripe_link_agents: 'https://example.com/stripe/account-access',
    })
  })
})
