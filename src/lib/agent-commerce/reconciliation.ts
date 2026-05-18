import 'server-only'

import { randomUUID } from 'crypto'
import {
  appendAgentCommerceEvent,
  listAgentCommerceOpenOrgIds,
  listAgentCommerceProviderEventMismatches,
  reconcileAgentCommerceOrg,
  type AgentCommerceProviderEventMismatch,
  type AgentCommerceReconciliationAction,
} from '@/lib/db/agent-commerce'
import { assertAgentCommerceEnabled } from './feature-gates'
import type { AgentCommerceActor } from './service'

export interface AgentCommerceReconciliationOrgResult {
  orgId: string
  actions: AgentCommerceReconciliationAction[]
  providerEventMismatches: AgentCommerceProviderEventMismatch[]
}

export interface AgentCommerceReconciliationResult {
  ranAt: string
  orgs: AgentCommerceReconciliationOrgResult[]
  totals: {
    orgs: number
    updated: number
    provider_event_mismatches: number
  }
}

function eventActor(actor?: AgentCommerceActor) {
  return {
    actor_type: actor?.type ?? 'system',
    actor_id: actor?.id,
    request_id: actor?.requestId,
  } as const
}

export async function runAgentCommerceReconciliation(params: {
  orgId?: string
  actor?: AgentCommerceActor
  now?: string
  stuckAfter?: string
  mismatchLimit?: number
} = {}): Promise<AgentCommerceReconciliationResult> {
  assertAgentCommerceEnabled()

  const ranAt = params.now ?? new Date().toISOString()
  const orgIds = params.orgId ? [params.orgId] : await listAgentCommerceOpenOrgIds()
  const orgs: AgentCommerceReconciliationOrgResult[] = []

  for (const orgId of orgIds) {
    const [actions, providerEventMismatches] = await Promise.all([
      reconcileAgentCommerceOrg({
        orgId,
        now: ranAt,
        stuckAfter: params.stuckAfter,
      }),
      listAgentCommerceProviderEventMismatches({
        orgId,
        limit: params.mismatchLimit ?? 100,
      }),
    ])

    const updated = actions.reduce((total, action) => total + action.updated_count, 0)
    await appendAgentCommerceEvent({
      org_id: orgId,
      entity_type: 'provider_health',
      entity_id: randomUUID(),
      event_type: 'reconciliation.completed',
      payload: {
        stackId: 'commerce',
        actions,
        provider_event_mismatches: providerEventMismatches.length,
        updated,
        ran_at: ranAt,
      },
      ...eventActor(params.actor),
    })

    orgs.push({ orgId, actions, providerEventMismatches })
  }

  return {
    ranAt,
    orgs,
    totals: {
      orgs: orgs.length,
      updated: orgs.reduce(
        (total, org) => total + org.actions.reduce((subtotal, action) => subtotal + action.updated_count, 0),
        0,
      ),
      provider_event_mismatches: orgs.reduce(
        (total, org) => total + org.providerEventMismatches.length,
        0,
      ),
    },
  }
}
