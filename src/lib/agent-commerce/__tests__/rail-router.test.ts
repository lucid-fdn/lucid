import { describe, expect, it, vi } from 'vitest'
import type { AgentCommerceProviderManifest } from '@contracts/agent-commerce'
import { resolveCommerceRail } from '../rail-router'
import {
  defaultAgentCommerceProviderManifests,
} from '../provider-registry'

vi.mock('server-only', () => ({}))

const orgId = '11111111-1111-4111-8111-111111111111'
const assistantId = '22222222-2222-4222-8222-222222222222'

function baseIntent(overrides: Record<string, unknown> = {}) {
  return {
    org_id: orgId,
    assistant_id: assistantId,
    run_id: 'run_1',
    merchant: { name: 'Powdur', domain: 'powdur.com' },
    amount: { amount: 2500, currency: 'usd' },
    purpose: 'Buy supplies for a workflow.',
    idempotency_key: 'commerce-test-key',
    ...overrides,
  }
}

function liveManifest(
  overrides: Partial<AgentCommerceProviderManifest>,
): AgentCommerceProviderManifest {
  return {
    id: 'manual',
    label: 'Manual',
    roles: ['agent_platform'],
    capabilities: ['spend_request', 'manual_approval'],
    rails: ['manual_approval'],
    requires_account_access: false,
    availability: { mode: 'live', countries: [] },
    ...overrides,
  } as AgentCommerceProviderManifest
}

describe('resolveCommerceRail', () => {
  it('requires human approval by default on the manual live rail', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent(),
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision).toMatchObject({
      decision: 'requires_approval',
      selected_provider: 'manual',
      selected_rail: 'manual_approval',
      reason_codes: ['approval_required'],
    })
  })

  it('denies policy violations before provider selection', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({ amount: { amount: 6000, currency: 'usd' } }),
      policy: {
        max_amount: { amount: 5000, currency: 'usd' },
        allowed_currencies: ['usd'],
        blocked_merchant_domains: [],
        allowed_merchant_domains: ['powdur.com'],
      },
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision.decision).toBe('denied')
    expect(decision.reason_codes).toEqual(['amount_exceeds_limit'])
  })

  it('does not silently fall back when a preferred preview provider is unavailable', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({ preferred_provider: 'stripe_link_agents' }),
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision.decision).toBe('denied')
    expect(decision.reason_codes).toEqual(['provider_preview_only'])
  })

  it('requires a connection for Link when preview providers are explicitly allowed', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({ preferred_provider: 'stripe_link_agents' }),
      policy: {
        requires_human_approval: false,
        allow_preview_providers: true,
      },
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision).toMatchObject({
      decision: 'requires_connection',
      selected_provider: 'stripe_link_agents',
      reason_codes: ['connection_missing'],
    })
  })

  it('fails closed when the feature gate is off', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent(),
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: false },
    })

    expect(decision.decision).toBe('denied')
    expect(decision.reason_codes).toEqual(['feature_disabled'])
  })

  it('returns ready for a live non-credential rail when approval is not required', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({ preferred_provider: 'manual' }),
      policy: {
        allowed_providers: ['manual'],
        allowed_rails: ['manual_approval'],
        requires_human_approval: false,
      },
      providerManifests: [
        liveManifest({ id: 'manual' }),
      ],
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision).toMatchObject({
      decision: 'ready',
      selected_provider: 'manual',
      selected_rail: 'manual_approval',
      reason_codes: [],
    })
  })

  it('returns approved_to_issue_credential for a live credential rail without approval requirement', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({
        preferred_provider: 'stripe_issuing',
        preferred_rail: 'stripe_issuing_card',
      }),
      policy: {
        allowed_providers: ['stripe_issuing'],
        allowed_rails: ['stripe_issuing_card'],
        requires_human_approval: false,
      },
      providerManifests: [
        liveManifest({
          id: 'stripe_issuing',
          label: 'Stripe Issuing',
          capabilities: ['one_time_card', 'realtime_authorization'],
          rails: ['stripe_issuing_card'],
        }),
      ],
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision).toMatchObject({
      decision: 'approved_to_issue_credential',
      selected_provider: 'stripe_issuing',
      selected_rail: 'stripe_issuing_card',
      reason_codes: [],
    })
  })

  it('routes critical risk to manual_review before provider selection', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent(),
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
      risk: { level: 'critical', score: 99 },
    })

    expect(decision).toMatchObject({
      decision: 'manual_review',
      reason_codes: ['risk_manual_review'],
      evidence: { risk: { level: 'critical', score: 99 } },
    })
  })

  it('denies degraded preferred providers without falling back to weaker rails', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({ preferred_provider: 'manual' }),
      providerManifests: [
        liveManifest({ id: 'manual' }),
      ],
      providerHealth: [
        { provider: 'manual', status: 'degraded' },
      ],
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision.decision).toBe('denied')
    expect(decision.reason_codes).toEqual(['provider_unavailable'])
  })

  it('denies disabled providers even when preview providers are allowed', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({ preferred_provider: 'crypto_wallet' }),
      policy: {
        allowed_providers: ['crypto_wallet'],
        allowed_rails: ['crypto_wallet_transfer'],
        allow_preview_providers: true,
        requires_human_approval: false,
      },
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision.decision).toBe('denied')
    expect(decision.reason_codes).toEqual(['provider_disabled'])
  })

  it('denies unsupported preferred provider and rail combinations', () => {
    const decision = resolveCommerceRail({
      intent: baseIntent({
        preferred_provider: 'manual',
        preferred_rail: 'machine_payment_x402',
      }),
      providerManifests: [
        liveManifest({ id: 'manual' }),
      ],
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(decision.decision).toBe('denied')
    expect(decision.reason_codes).toEqual(['provider_capability_missing'])
  })

  it('denies currency and merchant policy violations with explicit reason codes', () => {
    const currencyDecision = resolveCommerceRail({
      intent: baseIntent({ amount: { amount: 2500, currency: 'eur' } }),
      policy: {
        allowed_currencies: ['usd'],
      },
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })
    const merchantDecision = resolveCommerceRail({
      intent: baseIntent({ merchant: { name: 'Blocked', domain: 'blocked.example' } }),
      policy: {
        blocked_merchant_domains: ['blocked.example'],
      },
      providerManifests: defaultAgentCommerceProviderManifests(),
      features: { coreEnabled: true, walletsEnabled: true },
    })

    expect(currencyDecision.reason_codes).toEqual(['currency_not_allowed'])
    expect(merchantDecision.reason_codes).toEqual(['merchant_blocked'])
  })
})
