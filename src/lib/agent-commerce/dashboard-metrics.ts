import type {
  AgentCommerceBudgetReservation,
  AgentCommerceEvent,
  AgentCommerceMoney,
  AgentCommerceSellerEntitlement,
  AgentSpendRequest,
  SellerPaymentGrant,
} from '@contracts/agent-commerce'

export interface AgentCommerceDashboardProviderHealth {
  status: 'healthy' | 'degraded' | 'disabled'
  mode: 'live' | 'preview' | 'waitlist' | 'disabled'
  failure_count: number
}

export interface AgentCommerceDashboardMismatch {
  event_id: string
}

export const AGENT_COMMERCE_DASHBOARD_EVENT_TYPES = [
  'proof_claim.claimed',
  'proof_claim.replayed',
  'provider_promotion.blocked',
] as const

export type AgentCommerceDashboardEventType = typeof AGENT_COMMERCE_DASHBOARD_EVENT_TYPES[number]
export type AgentCommerceDashboardEventCounts = Partial<Record<AgentCommerceDashboardEventType, number>>

export interface AgentCommerceMoneyRollup {
  by_currency: Record<string, number>
  primary?: AgentCommerceMoney
}

export interface AgentCommerceDashboardLedgerAggregates {
  spend: {
    total_requests: number
    completed_requests: number
    spend_failures: number
    requested_volume: AgentCommerceMoneyRollup
    completed_volume: AgentCommerceMoneyRollup
    captured_budget: AgentCommerceMoneyRollup
  }
  budget: {
    budget_failures: number
  }
  revenue: {
    completed_grants: number
    active_entitlements: number
    revoked_or_expired_entitlements: number
    completed_volume: AgentCommerceMoneyRollup
  }
}

export interface AgentCommerceProductionDashboardSummary {
  spend: {
    total_requests: number
    completed_requests: number
    requested_volume: AgentCommerceMoneyRollup
    completed_volume: AgentCommerceMoneyRollup
    captured_budget: AgentCommerceMoneyRollup
  }
  failures: {
    total: number
    spend_failures: number
    budget_failures: number
    provider_mismatches: number
    provider_promotion_blocks: number
  }
  replay: {
    claimed_proofs: number
    replayed_proofs: number
    replay_rate: number
  }
  providers: {
    total: number
    live: number
    healthy: number
    degraded: number
    disabled: number
    global_failure_count: number
  }
  revenue: {
    completed_grants: number
    active_entitlements: number
    revoked_or_expired_entitlements: number
    completed_volume: AgentCommerceMoneyRollup
  }
}

export interface AgentCommerceProductionDashboardInput {
  spendRequests: Pick<AgentSpendRequest, 'amount' | 'status'>[]
  budgetReservations: Pick<AgentCommerceBudgetReservation, 'amount' | 'status'>[]
  sellerGrants: Pick<SellerPaymentGrant, 'amount' | 'status'>[]
  sellerEntitlements: Pick<AgentCommerceSellerEntitlement, 'status'>[]
  providerHealth: AgentCommerceDashboardProviderHealth[]
  providerEventMismatches: AgentCommerceDashboardMismatch[]
  providerEventMismatchCount?: number
  events?: Pick<AgentCommerceEvent, 'event_type'>[]
  eventCounts?: AgentCommerceDashboardEventCounts
  ledgerAggregates?: AgentCommerceDashboardLedgerAggregates
}

const SPEND_FAILURE_STATUSES = new Set(['failed', 'declined', 'expired', 'cancelled'])
const SELLER_REVENUE_STATUSES = new Set(['completed'])

function normalizeCurrency(currency: string): string {
  return currency.trim().toLowerCase()
}

function moneyRollup(items: AgentCommerceMoney[]): AgentCommerceMoneyRollup {
  const byCurrency = items.reduce<Record<string, number>>((acc, item) => {
    const currency = normalizeCurrency(item.currency)
    acc[currency] = (acc[currency] ?? 0) + item.amount
    return acc
  }, {})

  const primaryEntry = Object.entries(byCurrency)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]

  return {
    by_currency: byCurrency,
    primary: primaryEntry
      ? {
          amount: primaryEntry[1],
          currency: primaryEntry[0],
        }
      : undefined,
  }
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Number((numerator / denominator).toFixed(4))
}

function dashboardEventCount(
  input: AgentCommerceProductionDashboardInput,
  eventType: AgentCommerceDashboardEventType,
): number {
  return input.eventCounts?.[eventType] ?? input.events?.filter((item) => item.event_type === eventType).length ?? 0
}

export function summarizeAgentCommerceProductionDashboard(
  input: AgentCommerceProductionDashboardInput,
): AgentCommerceProductionDashboardSummary {
  const ledger = input.ledgerAggregates
  const completedSpendRequests = input.spendRequests.filter((item) => item.status === 'completed')
  const spendFailures = ledger?.spend.spend_failures
    ?? input.spendRequests.filter((item) => SPEND_FAILURE_STATUSES.has(item.status)).length
  const budgetFailures = ledger?.budget.budget_failures
    ?? input.budgetReservations.filter((item) => item.status === 'failed').length
  const globalProviderFailureCount = input.providerHealth.reduce((total, item) => total + item.failure_count, 0)
  const providerMismatchCount = input.providerEventMismatchCount ?? input.providerEventMismatches.length
  const claimedProofs = dashboardEventCount(input, 'proof_claim.claimed')
  const replayedProofs = dashboardEventCount(input, 'proof_claim.replayed')
  const providerPromotionBlocks = dashboardEventCount(input, 'provider_promotion.blocked')
  const completedSellerGrants = input.sellerGrants.filter((item) => SELLER_REVENUE_STATUSES.has(item.status))

  return {
    spend: {
      total_requests: ledger?.spend.total_requests ?? input.spendRequests.length,
      completed_requests: ledger?.spend.completed_requests ?? completedSpendRequests.length,
      requested_volume: ledger?.spend.requested_volume ?? moneyRollup(input.spendRequests.map((item) => item.amount)),
      completed_volume: ledger?.spend.completed_volume ?? moneyRollup(completedSpendRequests.map((item) => item.amount)),
      captured_budget: ledger?.spend.captured_budget ?? moneyRollup(input.budgetReservations
        .filter((item) => item.status === 'captured')
        .map((item) => item.amount)),
    },
    failures: {
      total: spendFailures + budgetFailures + providerMismatchCount + providerPromotionBlocks,
      spend_failures: spendFailures,
      budget_failures: budgetFailures,
      provider_mismatches: providerMismatchCount,
      provider_promotion_blocks: providerPromotionBlocks,
    },
    replay: {
      claimed_proofs: claimedProofs,
      replayed_proofs: replayedProofs,
      replay_rate: ratio(replayedProofs, claimedProofs + replayedProofs),
    },
    providers: {
      total: input.providerHealth.length,
      live: input.providerHealth.filter((item) => item.mode === 'live').length,
      healthy: input.providerHealth.filter((item) => item.status === 'healthy').length,
      degraded: input.providerHealth.filter((item) => item.status === 'degraded').length,
      disabled: input.providerHealth.filter((item) => item.status === 'disabled').length,
      global_failure_count: globalProviderFailureCount,
    },
    revenue: {
      completed_grants: ledger?.revenue.completed_grants ?? completedSellerGrants.length,
      active_entitlements: ledger?.revenue.active_entitlements
        ?? input.sellerEntitlements.filter((item) => item.status === 'active').length,
      revoked_or_expired_entitlements: ledger?.revenue.revoked_or_expired_entitlements
        ?? input.sellerEntitlements.filter((item) => item.status === 'revoked' || item.status === 'expired').length,
      completed_volume: ledger?.revenue.completed_volume ?? moneyRollup(completedSellerGrants.map((item) => item.amount)),
    },
  }
}
