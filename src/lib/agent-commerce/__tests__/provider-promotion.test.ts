import { describe, expect, it, vi } from 'vitest'
import type { AgentCommerceProviderManifest } from '@contracts/agent-commerce'
import { CRYPTO_WALLET_PROVIDER_MANIFEST } from '../providers/crypto-wallet'
import { MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST } from '../providers/machine'
import { MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST } from '../providers/manual'
import {
  STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
  STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
} from '../providers/stripe-link'
import {
  evaluateAgentCommerceProviderHealthPromotionGuard,
  evaluateAgentCommerceProviderPromotion,
  evaluateAgentCommerceProviderPromotions,
  MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE,
  requiredPromotionEvidenceForManifest,
  summarizeAgentCommerceProviderPromotionEvidencePacket,
} from '../provider-promotion'

vi.mock('server-only', () => ({}))

function live(manifest: AgentCommerceProviderManifest): AgentCommerceProviderManifest {
  return {
    ...manifest,
    availability: {
      ...manifest.availability,
      mode: 'live',
    },
  }
}

describe('Agent Commerce provider promotion gates', () => {
  it('allows the current manual live provider with local promotion evidence', () => {
    const [manual] = evaluateAgentCommerceProviderPromotions({
      manifests: [MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST],
      registeredProviderIds: ['manual'],
      evidence: {
        manual: [...MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE],
      },
    })

    expect(manual).toMatchObject({
      provider: 'manual',
      live: true,
      ready: true,
      blockers: [],
      missingEvidence: [],
    })
  })

  it('does not treat preview or waitlist manifests as live promotion-ready', () => {
    const results = evaluateAgentCommerceProviderPromotions({
      manifests: [
        STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
        STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
        MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST,
        CRYPTO_WALLET_PROVIDER_MANIFEST,
      ],
      registeredProviderIds: ['manual'],
    })

    expect(results.map((result) => result.blockers)).toEqual([
      ['provider_not_live'],
      ['provider_not_live'],
      ['provider_not_live'],
      ['provider_not_live'],
    ])
  })

  it('blocks manifest-only providers from being promoted to live', () => {
    const result = evaluateAgentCommerceProviderPromotion({
      manifest: live(STRIPE_LINK_AGENTS_PROVIDER_MANIFEST),
      registeredProviderIds: [],
      evidence: {
        stripe_link_agents: requiredPromotionEvidenceForManifest(STRIPE_LINK_AGENTS_PROVIDER_MANIFEST),
      },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(expect.arrayContaining([
      'manifest_only_provider_cannot_be_live',
      'live_provider_adapter_missing',
    ]))
  })

  it('requires account, secret, webhook, and Stripe Link API evidence for live Stripe Link', () => {
    const result = evaluateAgentCommerceProviderPromotion({
      manifest: {
        ...live(STRIPE_LINK_AGENTS_PROVIDER_MANIFEST),
        provider_version: 'stripe-api-2026-02-25.clover-link-agents',
      },
      registeredProviderIds: ['stripe_link_agents'],
      evidence: {
        stripe_link_agents: [
          'provider_adapter_registered',
          'idempotency_before_provider_side_effects',
          'ledger_budget_reservation_before_provider_side_effects',
          'no_raw_credential_persistence_tested',
          'fail_closed_provider_tests',
        ],
      },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(expect.arrayContaining([
      'account_access_evidence_missing',
      'secret_ref_evidence_missing',
      'webhook_evidence_missing',
      'stripe_link_access_evidence_missing',
    ]))
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      'account_access_approved',
      'secret_ref_configured',
      'webhook_signature_verified',
      'webhook_dedupe_enabled',
      'reconciliation_mapping_tested',
      'stripe_link_stable_api_access',
      'oauth_callback_verified',
    ]))
  })

  it('summarizes a complete Stripe Link live promotion packet as ready', () => {
    const result = summarizeAgentCommerceProviderPromotionEvidencePacket({
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

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.missingEvidence).toEqual([])
    expect(result.requiredEvidence).toEqual(expect.arrayContaining([
      'stripe_link_stable_api_access',
      'oauth_callback_verified',
    ]))
  })

  it('keeps Stripe Link promotion blocked when packet attestations are incomplete', () => {
    const result = summarizeAgentCommerceProviderPromotionEvidencePacket({
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
        evidence: requiredPromotionEvidenceForManifest(STRIPE_LINK_AGENTS_PROVIDER_MANIFEST),
        links: {},
        attestation: {
          account_access_approved: false,
          no_raw_credential_persistence: false,
          idempotency_before_provider_side_effects: true,
          ledger_budget_reservation_before_provider_side_effects: true,
          webhook_signature_and_dedupe_verified: false,
          reconciliation_mapping_verified: false,
          fail_closed_paths_verified: false,
        },
      },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(expect.arrayContaining([
      'account_access_evidence_missing',
      'webhook_evidence_missing',
      'credential_safety_evidence_missing',
    ]))
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      'account_access_approved',
      'webhook_signature_verified',
      'webhook_dedupe_enabled',
      'reconciliation_mapping_tested',
      'no_raw_credential_persistence_tested',
      'fail_closed_provider_tests',
    ]))
  })

  it('requires Lucid-L2 and public-signing evidence before crypto wallet promotion', () => {
    const result = evaluateAgentCommerceProviderPromotion({
      manifest: live(CRYPTO_WALLET_PROVIDER_MANIFEST),
      registeredProviderIds: ['crypto_wallet'],
      evidence: {
        crypto_wallet: [
          'provider_adapter_registered',
          'idempotency_before_provider_side_effects',
          'ledger_budget_reservation_before_provider_side_effects',
          'no_raw_credential_persistence_tested',
          'fail_closed_provider_tests',
          'atomic_proof_claim_tested',
          'replay_protection_tested',
        ],
      },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers).toContain('lucid_l2_evidence_missing')
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      'lucid_l2_p0_execution_gate',
      'internal_hmac_only',
      'no_public_wallet_signing',
    ]))
  })

  it('blocks operator live-mode health updates for providers without promotion evidence', () => {
    const guard = evaluateAgentCommerceProviderHealthPromotionGuard({
      providerId: 'stripe_link_agents',
      requestedMode: 'live',
      manifests: [STRIPE_LINK_AGENTS_PROVIDER_MANIFEST],
      registeredProviderIds: [],
    })

    expect(guard.allowed).toBe(false)
    expect(guard.reason).toBe('promotion_evidence_incomplete')
    expect(guard.promotion?.blockers).toEqual(expect.arrayContaining([
      'manifest_only_provider_cannot_be_live',
      'live_provider_adapter_missing',
    ]))
  })

  it('allows operator live-mode health updates for the current manual provider evidence', () => {
    const guard = evaluateAgentCommerceProviderHealthPromotionGuard({
      providerId: 'manual',
      requestedMode: 'live',
      manifests: [MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST],
      registeredProviderIds: ['manual'],
      evidence: {
        manual: [...MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE],
      },
    })

    expect(guard).toMatchObject({
      allowed: true,
      promotion: {
        provider: 'manual',
        ready: true,
      },
    })
  })
})
