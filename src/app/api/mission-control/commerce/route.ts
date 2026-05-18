import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AgentSpendRequestStatusSchema, type AgentCommerceEvent } from '@contracts/agent-commerce'
import { getUserId } from '@/lib/auth/server-utils'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  AGENT_COMMERCE_DASHBOARD_EVENT_TYPES,
  summarizeAgentCommerceProductionDashboard,
} from '@/lib/agent-commerce/dashboard-metrics'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  evaluateAgentCommerceProviderPromotions,
  MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE,
} from '@/lib/agent-commerce/provider-promotion'
import {
  listAgentCommerceProviderManifests,
  listAgentCommerceProviders,
  registerDefaultAgentCommerceProviders,
} from '@/lib/agent-commerce/provider-registry'
import { summarizeAgentCommerceRailReadiness } from '@/lib/agent-commerce/rail-readiness'
import {
  countAgentCommerceProviderEventMismatches,
  countAgentCommerceEventsByType,
  getAgentCommerceProductionLedgerAggregates,
  listAgentCommerceConnections,
  listAgentCommerceEvents,
  listAgentCommerceProviderEventMismatches,
  listAgentCommerceProviderHealth,
  listAgentCommerceSellerEntitlements,
  listAgentSpendBudgetReservations,
  listAgentSpendRequests,
  listSellerPaymentGrants,
} from '@/lib/db/agent-commerce'
import { listCommerceKnowledgeEvidenceEvents } from '@/lib/db/knowledge-operation-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  status: AgentSpendRequestStatusSchema.optional(),
  projectId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
})

function summarizeSpendRequests(spendRequests: Awaited<ReturnType<typeof listAgentSpendRequests>>) {
  const byStatus = spendRequests.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  return {
    total: spendRequests.length,
    open_approval: byStatus.requires_approval ?? 0,
    waiting_connection: byStatus.requires_connection ?? 0,
    issuing: (byStatus.approved ?? 0) + (byStatus.credential_issuing ?? 0) + (byStatus.credential_issued ?? 0),
    completed: byStatus.completed ?? 0,
    failed_or_declined: (byStatus.failed ?? 0) + (byStatus.declined ?? 0) + (byStatus.expired ?? 0),
    by_status: byStatus,
  }
}

function summarizeBudgetReservations(reservations: Awaited<ReturnType<typeof listAgentSpendBudgetReservations>>) {
  const byStatus = reservations.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  return {
    total: reservations.length,
    reserved: byStatus.reserved ?? 0,
    captured: byStatus.captured ?? 0,
    released_or_expired: (byStatus.released ?? 0) + (byStatus.expired ?? 0),
    failed: byStatus.failed ?? 0,
    by_status: byStatus,
  }
}

function summarizeSellerEntitlements(entitlements: Awaited<ReturnType<typeof listAgentCommerceSellerEntitlements>>) {
  const byStatus = entitlements.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})
  const byTarget = entitlements.reduce<Record<string, number>>((acc, item) => {
    acc[item.target_type] = (acc[item.target_type] ?? 0) + 1
    return acc
  }, {})

  return {
    total: entitlements.length,
    active: byStatus.active ?? 0,
    revoked_or_expired: (byStatus.revoked ?? 0) + (byStatus.expired ?? 0),
    failed: byStatus.failed ?? 0,
    by_status: byStatus,
    by_target: byTarget,
  }
}

function dedupeAgentCommerceEvents(events: AgentCommerceEvent[]): AgentCommerceEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = event.id ?? `${event.entity_type}:${event.entity_id}:${event.event_type}:${event.created_at ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(request: NextRequest) {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)

    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('org_id') ?? request.nextUrl.searchParams.get('orgId'),
      status: request.nextUrl.searchParams.get('status') ?? undefined,
      projectId: request.nextUrl.searchParams.get('project_id') ?? request.nextUrl.searchParams.get('projectId') ?? undefined,
      assistantId: request.nextUrl.searchParams.get('assistant_id') ?? request.nextUrl.searchParams.get('assistantId') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })

    await requireAgentCommerceOrgMembership(userId, query.orgId)
    registerDefaultAgentCommerceProviders()

    const [
      spendRequests,
      connections,
      events,
      providerPromotionBlockEvents,
      dashboardEventCounts,
      productionLedgerAggregates,
      providerHealth,
      providerEventMismatches,
      providerEventMismatchCount,
      budgetReservations,
      sellerEntitlements,
      sellerGrants,
    ] = await Promise.all([
      listAgentSpendRequests({
        orgId: query.orgId,
        status: query.status,
        projectId: query.projectId,
        assistantId: query.assistantId,
        limit: query.limit,
      }),
      listAgentCommerceConnections({ orgId: query.orgId }),
      listAgentCommerceEvents({ orgId: query.orgId, limit: 50 }),
      listAgentCommerceEvents({ orgId: query.orgId, eventType: 'provider_promotion.blocked', limit: 50 }),
      countAgentCommerceEventsByType({
        orgId: query.orgId,
        eventTypes: AGENT_COMMERCE_DASHBOARD_EVENT_TYPES,
      }),
      getAgentCommerceProductionLedgerAggregates(query.orgId),
      listAgentCommerceProviderHealth(),
      listAgentCommerceProviderEventMismatches({ orgId: query.orgId, limit: 50 }),
      countAgentCommerceProviderEventMismatches(query.orgId),
      listAgentSpendBudgetReservations({ orgId: query.orgId, limit: 100 }),
      listAgentCommerceSellerEntitlements({ orgId: query.orgId, limit: 100 }),
      listSellerPaymentGrants({ orgId: query.orgId, limit: 100 }),
    ])

    const providerManifests = listAgentCommerceProviderManifests()
    const providerPromotion = evaluateAgentCommerceProviderPromotions({
      manifests: providerManifests,
      registeredProviderIds: listAgentCommerceProviders().map((provider) => provider.manifest.id),
      evidence: {
        manual: [...MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE],
      },
    })
    const dashboardEvents = dedupeAgentCommerceEvents([...events, ...providerPromotionBlockEvents])
    const commerceKnowledgeEvidence = await listCommerceKnowledgeEvidenceEvents({
      orgId: query.orgId,
      commerceEventIds: dashboardEvents.flatMap((event) => event.id ? [event.id] : []),
      limit: 200,
    })

    return agentCommerceOk({
      summary: summarizeSpendRequests(spendRequests),
      budget_summary: summarizeBudgetReservations(budgetReservations),
      seller_entitlement_summary: summarizeSellerEntitlements(sellerEntitlements),
      rail_readiness: summarizeAgentCommerceRailReadiness(providerManifests),
      provider_promotion: providerPromotion,
      production_summary: summarizeAgentCommerceProductionDashboard({
        spendRequests,
        budgetReservations,
        sellerGrants,
        sellerEntitlements,
        providerHealth,
        providerEventMismatches,
        providerEventMismatchCount,
        events: dashboardEvents,
        eventCounts: dashboardEventCounts,
        ledgerAggregates: productionLedgerAggregates,
      }),
      production_event_counts: dashboardEventCounts,
      production_ledger_aggregates: productionLedgerAggregates,
      production_provider_mismatch_count: providerEventMismatchCount,
      spend_requests: spendRequests,
      budget_reservations: budgetReservations,
      seller_entitlements: sellerEntitlements,
      seller_grants: sellerGrants,
      connections,
      provider_manifests: providerManifests,
      provider_health: providerHealth,
      provider_event_mismatches: providerEventMismatches,
      provider_promotion_block_events: providerPromotionBlockEvents,
      commerce_knowledge_evidence: commerceKnowledgeEvidence,
      events,
    }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
