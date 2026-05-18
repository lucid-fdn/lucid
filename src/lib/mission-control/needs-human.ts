import 'server-only'

import type { NeedsHumanItem } from '@contracts/lucid-doctor'
import {
  listBrowserOperatorAlerts,
  listKnowledgeMaintenanceEvents,
  listLucidPackManagedResources,
  listSystemNotices,
} from '@/lib/db'
import { listAgentCommerceEvents } from '@/lib/db/agent-commerce'
import { listAgentOpsRunsForOrg } from '@/lib/db/agent-ops'

export interface ListNeedsHumanItemsInput {
  orgId: string
  projectId?: string | null
  domain?: string | null
  limit?: number
}

export async function listNeedsHumanItems(input: ListNeedsHumanItemsInput): Promise<NeedsHumanItem[]> {
  const [
    knowledge,
    browser,
    agentOps,
    notices,
    templateDrift,
    commerce,
  ] = await Promise.all([
    listKnowledgeMaintenanceEvents({ orgId: input.orgId, projectId: input.projectId, status: 'open', limit: 50 }).catch(() => []),
    listBrowserOperatorAlerts({ orgId: input.orgId, status: ['open', 'acknowledged'], limit: 50 }).catch(() => []),
    Promise.all([
      listAgentOpsRunsForOrg(input.orgId, { projectId: input.projectId ?? undefined, status: 'blocked', limit: 25 }),
      listAgentOpsRunsForOrg(input.orgId, { projectId: input.projectId ?? undefined, status: 'failed', limit: 25 }),
    ]).then(([blocked, failed]) => [...blocked, ...failed]).catch(() => []),
    listSystemNotices({ orgId: input.orgId, projectId: input.projectId, unresolvedOnly: true, limit: 50 }).catch(() => []),
    listLucidPackManagedResources({ orgId: input.orgId, status: 'drifted', limit: 50 }).catch(() => []),
    listAgentCommerceEvents({ orgId: input.orgId, limit: 50 }).catch(() => []),
  ])

  const items: NeedsHumanItem[] = [
    ...knowledge.map((event) => ({
      id: `knowledge:${event.id}`,
      domain: 'knowledge',
      title: event.title,
      summary: event.summary,
      priority: event.severity === 'critical' ? 'urgent' as const : event.severity === 'warning' ? 'high' as const : 'normal' as const,
      status: event.status,
      createdAt: event.createdAt ?? new Date(0).toISOString(),
      projectId: event.projectId,
      runId: null,
      resourceType: event.claimId ? 'knowledge_claim' : event.sourceId ? 'knowledge_source' : 'knowledge_event',
      resourceId: event.claimId ?? event.sourceId ?? event.id,
      actions: [{ label: 'Open Knowledge', href: '/mission-control/knowledge' }],
      evidence: event.evidence.map((evidence) => ({ ...evidence })),
    })),
    ...browser.map((alert) => ({
      id: `browser:${alert.id}`,
      domain: 'browser',
      title: alert.title,
      summary: alert.message ?? 'Browser Operator needs attention.',
      priority: alert.severity === 'critical' ? 'urgent' as const : alert.severity === 'warning' ? 'high' as const : 'normal' as const,
      status: alert.status,
      createdAt: alert.created_at ?? new Date(0).toISOString(),
      projectId: null,
      runId: alert.ops_run_id ?? null,
      resourceType: alert.browser_account_id ? 'browser_account' : 'browser_alert',
      resourceId: alert.browser_account_id ?? alert.id,
      actions: [{ label: alert.primary_cta?.label ?? 'Open Browser Operator', href: alert.href ?? '/mission-control/browser' }],
      evidence: [alert.metadata ?? {}],
    })),
    ...agentOps.map((run) => ({
      id: `agent_ops:${run.id}`,
      domain: 'agent_ops',
      title: run.status === 'blocked' ? 'Agent Ops run is blocked' : 'Agent Ops run failed',
      summary: run.errorMessage ?? `${run.workflowId} is ${run.status}.`,
      priority: run.status === 'failed' ? 'urgent' as const : 'high' as const,
      status: 'open' as const,
      createdAt: run.createdAt ?? new Date(0).toISOString(),
      projectId: run.projectId ?? null,
      runId: run.id,
      resourceType: 'agent_ops_run',
      resourceId: run.id,
      actions: [{ label: 'Open run', href: `/mission-control/runs/${run.id}` }],
      evidence: [{ workflowId: run.workflowId, status: run.status }],
    })),
    ...notices.map((notice) => ({
      id: `notice:${notice.id}`,
      domain: notice.type.startsWith('knowledge') ? 'knowledge' : notice.type.includes('runtime') ? 'runtimes' : notice.type.includes('channel') ? 'channels' : 'system',
      title: notice.title,
      summary: notice.body,
      priority: notice.tone === 'danger' ? 'urgent' as const : notice.tone === 'warning' ? 'high' as const : 'normal' as const,
      status: notice.resolvedAt ? 'resolved' as const : notice.acknowledgedAt ? 'acknowledged' as const : 'open' as const,
      createdAt: notice.createdAt ?? new Date(0).toISOString(),
      projectId: notice.projectId ?? null,
      runId: notice.runId ?? null,
      resourceType: 'system_notice',
      resourceId: notice.id,
      actions: notice.actions,
      evidence: [notice.details],
    })),
    ...templateDrift.map((resource) => ({
      id: `templates:${resource.id}`,
      domain: 'templates',
      title: 'Template resource drifted',
      summary: `${resource.resourceKind} ${resource.resourceKey} drifted from its Lucid Pack definition.`,
      priority: 'normal' as const,
      status: 'open' as const,
      createdAt: resource.updatedAt ?? new Date(0).toISOString(),
      projectId: null,
      runId: null,
      resourceType: resource.resourceKind,
      resourceId: resource.resourceId ?? resource.id,
      actions: [{ label: 'Open templates', href: '/templates' }],
      evidence: [{ installId: resource.installId, specHash: resource.specHash }],
    })),
    ...commerce
      .filter((event) => /blocked|failed|exception|fallback|missing|risk/i.test(event.event_type))
      .map((event) => ({
        id: `commerce:${event.id}`,
        domain: 'commerce',
        title: 'Commerce event needs review',
        summary: event.event_type,
        priority: /blocked|failed/i.test(event.event_type) ? 'high' as const : 'normal' as const,
        status: 'open' as const,
        createdAt: event.created_at ?? new Date(0).toISOString(),
        projectId: null,
        runId: event.run_id ?? null,
        resourceType: event.entity_type,
        resourceId: event.entity_id,
        actions: [{ label: 'Open Commerce', href: '/mission-control/commerce' }],
        evidence: [event.payload],
      })),
  ]

  const filtered = input.domain ? items.filter((item) => item.domain === input.domain) : items
  return dedupeItems(filtered)
    .sort(compareNeedsHumanItems)
    .slice(0, Math.min(Math.max(input.limit ?? 100, 1), 250))
}

function dedupeItems(items: NeedsHumanItem[]): NeedsHumanItem[] {
  const byId = new Map<string, NeedsHumanItem>()
  for (const item of items) byId.set(item.id, item)
  return Array.from(byId.values())
}

function compareNeedsHumanItems(a: NeedsHumanItem, b: NeedsHumanItem): number {
  const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority)
  if (priorityDelta !== 0) return priorityDelta
  return b.createdAt.localeCompare(a.createdAt)
}

function priorityRank(priority: NeedsHumanItem['priority']): number {
  return priority === 'urgent' ? 4 : priority === 'high' ? 3 : priority === 'normal' ? 2 : 1
}
