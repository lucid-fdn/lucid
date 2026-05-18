import 'server-only'

/**
 * Copilot — Fleet Context Builder
 *
 * Builds a real-time fleet snapshot from the MC database layer.
 * This context is injected into the copilot system prompt so the LLM
 * can answer questions about agents, costs, errors, and approvals
 * without tool calls (fast path). Tools provide on-demand deep dives.
 *
 * Reuses centralized DB queries from @/lib/db/mission-control.
 */

import {
  getMCAgentList,
  getMCFeedEvents,
  getPendingApprovals,
} from '@/lib/db'
import type { FleetSnapshot, FleetAgent, FleetError } from './types'
import type { MCAgent, FeedEvent } from '@/lib/mission-control/types'

/**
 * Build a fleet snapshot for the copilot system prompt.
 * Fetches agents, recent errors, and pending approvals in parallel.
 */
export async function buildFleetSnapshot(orgId: string): Promise<FleetSnapshot> {
  const [agents, feedEvents, approvals] = await Promise.all([
    getMCAgentList(orgId),
    getMCFeedEvents(orgId, { limit: 50 }),
    getPendingApprovals(orgId),
  ])

  const fleetAgents: FleetAgent[] = agents.map((a: MCAgent) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    model: a.lucid_model,
    healthScore: a.health_score ?? null,
    costTodayUsd: a.cost_today_usd,
    errorsLastHour: a.errors_last_hour,
    riskLevel: a.risk_level,
    pendingApprovals: a.pending_approvals ?? 0,
    lastActiveAt: a.last_active_at,
    runtime: a.runtime
      ? {
          name: a.runtime.runtimeName,
          provider: a.runtime.runtimeProvider,
          status: a.runtime.runtimeStatus,
        }
      : undefined,
  }))

  const recentErrors: FleetError[] = feedEvents
    .filter((e: FeedEvent) => e.event_type === 'error')
    .slice(0, 10)
    .map((e: FeedEvent) => ({
      agentName: fleetAgents.find((a) => a.id === e.agent_id)?.name ?? e.agent_id,
      eventType: e.event_type,
      message: typeof e.payload === 'object' && e.payload
        ? ((e.payload as Record<string, unknown>).error as string) ?? e.event_type
        : e.event_type,
      timestamp: e.created_at,
    }))

  const pendingApprovalsList = approvals.filter((a) => a.status === 'pending')

  const costTodayUsd = fleetAgents.reduce((sum, a) => sum + a.costTodayUsd, 0)

  return {
    agents: fleetAgents,
    pendingApprovals: pendingApprovalsList.length,
    recentErrors,
    costTodayUsd,
  }
}

/**
 * Serialize a fleet snapshot into a structured text block for the system prompt.
 * Includes enough detail for the LLM to answer most questions without tool calls.
 */
export function serializeFleetContext(snapshot: FleetSnapshot): string {
  const lines: string[] = []

  // Summary stats
  const active = snapshot.agents.filter((a) => a.status === 'active').length
  const paused = snapshot.agents.filter((a) => a.status === 'paused').length
  const totalErrors = snapshot.agents.reduce((s, a) => s + a.errorsLastHour, 0)
  const healthScores = snapshot.agents
    .filter((a) => a.healthScore != null)
    .map((a) => a.healthScore as number)
  const avgHealth =
    healthScores.length > 0
      ? Math.round(healthScores.reduce((s, h) => s + h, 0) / healthScores.length)
      : null
  const criticalAgents = snapshot.agents.filter(
    (a) => a.riskLevel === 'critical' || a.riskLevel === 'high',
  )

  lines.push('## Fleet Summary')
  lines.push(
    `- **Total agents:** ${snapshot.agents.length} (${active} active, ${paused} paused)`,
  )
  lines.push(`- **Cost today:** $${snapshot.costTodayUsd.toFixed(2)}`)
  lines.push(`- **Errors (last hour):** ${totalErrors} across fleet`)
  if (avgHealth != null) {
    lines.push(`- **Avg health score:** ${avgHealth}/100`)
  }
  lines.push(`- **Pending approvals:** ${snapshot.pendingApprovals}`)
  if (criticalAgents.length > 0) {
    lines.push(
      `- **⚠ Agents needing attention:** ${criticalAgents.map((a) => `${a.name} (${a.riskLevel})`).join(', ')}`,
    )
  }
  lines.push('')

  // Agent table
  if (snapshot.agents.length > 0) {
    lines.push('## Agents')
    lines.push('| Name | Status | Model | Health | Errors/hr | Cost Today | Risk | Approvals |')
    lines.push('|------|--------|-------|--------|-----------|------------|------|-----------|')
    for (const a of snapshot.agents) {
      const health = a.healthScore != null ? `${a.healthScore}/100` : 'n/a'
      const runtime = a.runtime ? ` [${a.runtime.provider ?? 'default'}]` : ''
      lines.push(
        `| ${a.name}${runtime} | ${a.status} | ${a.model} | ${health} | ${a.errorsLastHour} | $${a.costTodayUsd.toFixed(2)} | ${a.riskLevel} | ${a.pendingApprovals} |`,
      )
    }
    lines.push('')
  }

  // Recent errors
  if (snapshot.recentErrors.length > 0) {
    lines.push('## Recent Errors (last 10)')
    for (const e of snapshot.recentErrors) {
      lines.push(`- **${e.agentName}:** ${e.message} — ${formatRelative(e.timestamp)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Format timestamp as relative time for readability */
function formatRelative(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
