import { describe, expect, it } from 'vitest'
import { summarizeAgentCommerceProductionDashboard } from '../dashboard-metrics'

describe('Agent Commerce production dashboard metrics', () => {
  it('summarizes spend, revenue, failures, replay, and provider health', () => {
    const summary = summarizeAgentCommerceProductionDashboard({
      spendRequests: [
        { status: 'completed', amount: { amount: 2_500, currency: 'usd' } },
        { status: 'requires_approval', amount: { amount: 1_000, currency: 'usd' } },
        { status: 'failed', amount: { amount: 700, currency: 'eur' } },
      ],
      budgetReservations: [
        { status: 'captured', amount: { amount: 2_500, currency: 'usd' } },
        { status: 'failed', amount: { amount: 700, currency: 'eur' } },
      ],
      sellerGrants: [
        { status: 'completed', amount: { amount: 4_200, currency: 'usd' } },
        { status: 'revoked', amount: { amount: 500, currency: 'usd' } },
      ],
      sellerEntitlements: [
        { status: 'active' },
        { status: 'revoked' },
      ],
      providerHealth: [
        { mode: 'live', status: 'healthy', failure_count: 0 },
        { mode: 'preview', status: 'degraded', failure_count: 2 },
        { mode: 'disabled', status: 'disabled', failure_count: 0 },
      ],
      providerEventMismatches: [
        { event_id: 'evt_mismatch_1' },
      ],
      events: [
        { event_type: 'proof_claim.claimed' },
        { event_type: 'proof_claim.replayed' },
        { event_type: 'proof_claim.replayed' },
        { event_type: 'provider_promotion.blocked' },
      ],
    })

    expect(summary.spend.total_requests).toBe(3)
    expect(summary.spend.completed_volume.primary).toEqual({ amount: 2_500, currency: 'usd' })
    expect(summary.revenue.completed_grants).toBe(1)
    expect(summary.revenue.completed_volume.primary).toEqual({ amount: 4_200, currency: 'usd' })
    expect(summary.failures).toMatchObject({
      total: 4,
      spend_failures: 1,
      budget_failures: 1,
      provider_mismatches: 1,
      provider_promotion_blocks: 1,
    })
    expect(summary.replay).toEqual({
      claimed_proofs: 1,
      replayed_proofs: 2,
      replay_rate: 0.6667,
    })
    expect(summary.providers).toMatchObject({
      total: 3,
      live: 1,
      healthy: 1,
      degraded: 1,
      disabled: 1,
      global_failure_count: 2,
    })
  })

  it('uses durable event counts when recent dashboard events are capped', () => {
    const summary = summarizeAgentCommerceProductionDashboard({
      spendRequests: [
        { status: 'completed', amount: { amount: 1_000, currency: 'usd' } },
      ],
      budgetReservations: [],
      sellerGrants: [],
      sellerEntitlements: [],
      providerHealth: [],
      providerEventMismatches: [],
      events: [
        { event_type: 'proof_claim.replayed' },
        { event_type: 'provider_promotion.blocked' },
      ],
      eventCounts: {
        'proof_claim.claimed': 20,
        'proof_claim.replayed': 5,
        'provider_promotion.blocked': 4,
      },
    })

    expect(summary.failures.provider_promotion_blocks).toBe(4)
    expect(summary.failures.total).toBe(4)
    expect(summary.replay).toEqual({
      claimed_proofs: 20,
      replayed_proofs: 5,
      replay_rate: 0.2,
    })
  })

  it('uses durable ledger aggregates when recent ledger rows are capped', () => {
    const summary = summarizeAgentCommerceProductionDashboard({
      spendRequests: [
        { status: 'failed', amount: { amount: 100, currency: 'usd' } },
      ],
      budgetReservations: [
        { status: 'failed', amount: { amount: 100, currency: 'usd' } },
      ],
      sellerGrants: [
        { status: 'completed', amount: { amount: 100, currency: 'usd' } },
      ],
      sellerEntitlements: [
        { status: 'active' },
      ],
      providerHealth: [],
      providerEventMismatches: [],
      ledgerAggregates: {
        spend: {
          total_requests: 25,
          completed_requests: 18,
          spend_failures: 3,
          requested_volume: {
            by_currency: { usd: 50_000, eur: 7_000 },
            primary: { amount: 50_000, currency: 'usd' },
          },
          completed_volume: {
            by_currency: { usd: 40_000 },
            primary: { amount: 40_000, currency: 'usd' },
          },
          captured_budget: {
            by_currency: { usd: 39_500 },
            primary: { amount: 39_500, currency: 'usd' },
          },
        },
        budget: {
          budget_failures: 2,
        },
        revenue: {
          completed_grants: 9,
          active_entitlements: 7,
          revoked_or_expired_entitlements: 4,
          completed_volume: {
            by_currency: { usd: 22_000 },
            primary: { amount: 22_000, currency: 'usd' },
          },
        },
      },
    })

    expect(summary.spend.total_requests).toBe(25)
    expect(summary.spend.completed_requests).toBe(18)
    expect(summary.spend.requested_volume.primary).toEqual({ amount: 50_000, currency: 'usd' })
    expect(summary.spend.completed_volume.primary).toEqual({ amount: 40_000, currency: 'usd' })
    expect(summary.spend.captured_budget.primary).toEqual({ amount: 39_500, currency: 'usd' })
    expect(summary.failures).toMatchObject({
      total: 5,
      spend_failures: 3,
      budget_failures: 2,
    })
    expect(summary.revenue).toMatchObject({
      completed_grants: 9,
      active_entitlements: 7,
      revoked_or_expired_entitlements: 4,
      completed_volume: {
        primary: { amount: 22_000, currency: 'usd' },
      },
    })
  })

  it('uses durable provider mismatch counts when recent mismatch rows are capped', () => {
    const summary = summarizeAgentCommerceProductionDashboard({
      spendRequests: [],
      budgetReservations: [],
      sellerGrants: [],
      sellerEntitlements: [],
      providerHealth: [],
      providerEventMismatches: [
        { event_id: 'evt_recent_mismatch' },
      ],
      providerEventMismatchCount: 11,
    })

    expect(summary.failures.provider_mismatches).toBe(11)
    expect(summary.failures.total).toBe(11)
  })

  it('classifies provider health failures as global rail health outside org failures', () => {
    const summary = summarizeAgentCommerceProductionDashboard({
      spendRequests: [],
      budgetReservations: [],
      sellerGrants: [],
      sellerEntitlements: [],
      providerHealth: [
        { mode: 'live', status: 'degraded', failure_count: 7 },
      ],
      providerEventMismatches: [],
    })

    expect(summary.failures.total).toBe(0)
    expect(summary.providers.global_failure_count).toBe(7)
  })
})
