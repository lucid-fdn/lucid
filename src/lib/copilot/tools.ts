import 'server-only'

/**
 * Copilot — Tool Definitions
 *
 * Vercel AI SDK tool calling for on-demand fleet queries.
 * The system prompt contains a fleet snapshot (fast path), but tools
 * let the copilot drill deeper when needed.
 *
 * Pattern: same as @/lib/ai/tools.ts — tool() + zod schema + execute.
 * Reuses centralized DB queries from @/lib/db/mission-control.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  getMCAgentList,
  getMCFeedEvents,
  getPendingApprovals,
  getMCAgentContext,
  getAgentGuardrails,
} from '@/lib/db'
import { retrieveContext } from '@/lib/rag'
import { ErrorService } from '@/lib/errors/error-service'
import type { MCAgent, FeedEvent } from '@/lib/mission-control/types'

// ── Factory ─────────────────────────────────────────────────────────
// Tools are scoped to an org. Factory pattern keeps orgId out of schemas.

export function createCopilotTools(orgId: string) {
  return {
    getFleetOverview: tool({
      description:
        'Get a real-time summary of all agents: statuses, total cost, error rates, health distribution. Use for fleet health or broad overview questions.',
      inputSchema: z.object({}),
      execute: async () => {
        const agents = await getMCAgentList(orgId)
        const active = agents.filter((a: MCAgent) => a.status === 'active').length
        const paused = agents.filter((a: MCAgent) => a.status === 'paused').length
        const totalCost = agents.reduce((s: number, a: MCAgent) => s + a.cost_today_usd, 0)
        const totalErrors = agents.reduce((s: number, a: MCAgent) => s + a.errors_last_hour, 0)
        const healthScores = agents
          .filter((a: MCAgent) => a.health_score != null)
          .map((a: MCAgent) => a.health_score as number)
        const avgHealth =
          healthScores.length > 0
            ? Math.round(healthScores.reduce((s, h) => s + h, 0) / healthScores.length)
            : null

        return {
          totalAgents: agents.length,
          active,
          paused,
          costTodayUsd: Number(totalCost.toFixed(2)),
          errorsLastHour: totalErrors,
          averageHealthScore: avgHealth,
          healthDistribution: {
            critical: healthScores.filter((h) => h < 40).length,
            unhealthy: healthScores.filter((h) => h >= 40 && h < 60).length,
            degraded: healthScores.filter((h) => h >= 60 && h < 80).length,
            healthy: healthScores.filter((h) => h >= 80).length,
          },
          criticalAgents: agents
            .filter((a: MCAgent) => a.risk_level === 'critical' || a.risk_level === 'high')
            .map((a: MCAgent) => ({
              name: a.name,
              risk: a.risk_level,
              health: a.health_score ?? null,
              errors: a.errors_last_hour,
              cost: Number(a.cost_today_usd.toFixed(2)),
            })),
          topCostAgents: [...agents]
            .sort((a, b) => b.cost_today_usd - a.cost_today_usd)
            .slice(0, 3)
            .map((a: MCAgent) => ({
              name: a.name,
              cost: Number(a.cost_today_usd.toFixed(2)),
            })),
        }
      },
    }),

    getAgentDetail: tool({
      description:
        'Get comprehensive detail about a specific agent: status, health, cost, channels, recent memories, last error, cost limits, and approval policy. Use when the user asks about a particular agent.',
      inputSchema: z.object({
        agentName: z.string().describe('Agent name or partial name to search for'),
      }),
      execute: async ({ agentName }: { agentName: string }) => {
        const agents = await getMCAgentList(orgId)
        const query = agentName.toLowerCase()
        const match = agents.find(
          (a: MCAgent) =>
            a.name.toLowerCase() === query ||
            a.name.toLowerCase().includes(query),
        )

        if (!match) {
          return {
            found: false,
            message: `No agent found matching "${agentName}". Available agents: ${agents.map((a: MCAgent) => a.name).join(', ')}`,
          }
        }

        // Fetch full context + guardrails in parallel
        const [context, guardrails] = await Promise.all([
          getMCAgentContext(match.id, orgId),
          getAgentGuardrails(match.id, orgId),
        ])

        return {
          found: true,
          agent: {
            id: match.id,
            name: match.name,
            status: match.status,
            model: match.lucid_model,
            healthScore: match.health_score ?? null,
            costTodayUsd: Number(match.cost_today_usd.toFixed(2)),
            errorsLastHour: match.errors_last_hour,
            riskLevel: match.risk_level,
            pendingApprovals: match.pending_approvals ?? 0,
            lastActiveAt: match.last_active_at,
            approvalRequiredTools: match.approval_required_tools,
            runtime: match.runtime
              ? {
                  name: match.runtime.runtimeName,
                  provider: match.runtime.runtimeProvider,
                  status: match.runtime.runtimeStatus,
                }
              : null,
            channels: context?.channels ?? [],
            recentMemories: (context?.recent_memories ?? []).map((m) => ({
              content: m.content,
              category: m.category,
              importance: m.importance,
            })),
            lastError: context?.last_error ?? null,
            policySummary: context?.policy_summary ?? null,
            guardrails: guardrails
              ? {
                  approvalRequiredTools: guardrails.approval_required_tools,
                  costLimitPerRunUsd: guardrails.cost_limit_per_run_usd,
                  costLimitDailyUsd: guardrails.cost_limit_daily_usd,
                  costLimitMonthlyUsd: guardrails.cost_limit_monthly_usd,
                }
              : null,
          },
        }
      },
    }),

    getRecentEvents: tool({
      description:
        'Get recent feed events (messages, tool calls, errors, approvals, runs). Optionally filter by agent name or event type. Use to investigate what happened recently or debug issues.',
      inputSchema: z.object({
        agentName: z
          .string()
          .optional()
          .describe('Optional agent name to filter events'),
        eventType: z
          .enum([
            'error',
            'tool_call',
            'approval_requested',
            'approval_resolved',
            'message_received',
            'message_sent',
            'run_started',
            'run_finished',
          ])
          .optional()
          .describe('Optional event type filter'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .describe('Number of events to return'),
      }),
      execute: async ({
        agentName,
        eventType,
        limit,
      }: {
        agentName?: string
        eventType?: string
        limit: number
      }) => {
        const agents = await getMCAgentList(orgId)
        const agentMap = new Map(agents.map((a: MCAgent) => [a.id, a.name]))

        let agentId: string | undefined
        if (agentName) {
          const match = agents.find((a: MCAgent) =>
            a.name.toLowerCase().includes(agentName.toLowerCase()),
          )
          if (match) agentId = match.id
        }

        let events = await getMCFeedEvents(orgId, { limit: limit * 2, agentId })

        // Filter by event type if specified
        if (eventType) {
          events = events.filter((e: FeedEvent) => e.event_type === eventType)
        }
        events = events.slice(0, limit)

        return {
          events: events.map((e: FeedEvent) => ({
            type: e.event_type,
            agent: agentMap.get(e.agent_id) ?? e.agent_id,
            summary: summarizeEvent(e),
            timestamp: e.created_at,
            relativeTime: formatRelative(e.created_at),
            details: extractEventDetails(e),
          })),
          total: events.length,
          ...(agentName && !agentId
            ? {
                warning: `No agent found matching "${agentName}". Showing all events.`,
              }
            : {}),
        }
      },
    }),

    getPendingApprovalsList: tool({
      description:
        'Get all pending approval requests that need operator action, with time remaining before auto-deny. Use when the user asks about approvals, what needs attention, or urgent items.',
      inputSchema: z.object({}),
      execute: async () => {
        const [approvals, agents] = await Promise.all([
          getPendingApprovals(orgId),
          getMCAgentList(orgId),
        ])
        const agentMap = new Map(agents.map((a: MCAgent) => [a.id, a.name]))
        const pending = approvals.filter((a) => a.status === 'pending')

        return {
          count: pending.length,
          approvals: pending.map((a) => {
            const expiresAt = new Date(a.expires_at)
            const msRemaining = expiresAt.getTime() - Date.now()
            const minutesRemaining = Math.max(0, Math.round(msRemaining / 60000))

            return {
              id: a.id,
              agent: agentMap.get(a.agent_id) ?? a.agent_id,
              tool: a.tool_name,
              toolArgs: a.tool_args,
              estimatedCostUsd: a.estimated_cost_usd,
              riskLevel: a.risk_level,
              requestedAt: a.requested_at,
              expiresAt: a.expires_at,
              minutesRemaining,
              urgent: minutesRemaining < 2,
            }
          }),
        }
      },
    }),
    searchDocs: tool({
      description:
        'Search the platform knowledge base for documentation about how to use Lucid features. Use when the user asks "how do I...", "what is...", "how to...", or any question about platform features, setup, configuration, plugins, channels, billing, workflows, or Mission Control.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'Natural language search query about the platform (e.g., "how to create an agent", "what plugins are available", "set up Telegram")',
          ),
      }),
      execute: async ({ query }: { query: string }) => {
        try {
          // Lower threshold (0.3 vs default 0.5) to surface more docs for user-facing help
          const result = await Promise.race([
            retrieveContext({
              orgId: orgId,
              query,
              topK: 5,
              threshold: 0.3,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('RAG search timeout')), 10_000),
            ),
          ])

          if (result.chunks.length === 0) {
            return {
              found: false,
              message:
                'No relevant documentation found. Try rephrasing your question.',
            }
          }

          return {
            found: true,
            results: result.chunks.map((chunk) => ({
              document: chunk.documentTitle,
              section: chunk.sectionHeading,
              content: chunk.content,
              relevance: Number(chunk.similarity.toFixed(3)),
            })),
            tokenEstimate: result.tokenEstimate,
          }
        } catch (err) {
          ErrorService.captureException(err instanceof Error ? err : new Error(String(err)), {
            severity: 'warning',
            context: { tool: 'searchDocs', query },
            tags: { layer: 'copilot', action: 'rag-search' },
          })
          return {
            found: false,
            message: `Documentation search failed: ${err instanceof Error ? err.message : 'Unknown error'}. Answer from your general knowledge instead.`,
          }
        }
      },
    }),
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function summarizeEvent(event: FeedEvent): string {
  const payload = event.payload as Record<string, unknown> | null
  switch (event.event_type) {
    case 'message_received':
      return `Received message${payload?.channel ? ` via ${payload.channel}` : ''}`
    case 'message_sent':
      return `Sent response${payload?.channel ? ` via ${payload.channel}` : ''}`
    case 'tool_call':
      return `Called tool: ${payload?.tool_name ?? 'unknown'}`
    case 'tool_result':
      return `Tool result: ${payload?.tool_name ?? 'unknown'} — ${payload?.success ? 'success' : 'failed'}`
    case 'error':
      return `Error: ${payload?.error ?? payload?.message ?? 'unknown'}`
    case 'approval_requested':
      return `Approval requested for ${payload?.tool_name ?? 'unknown tool'}${payload?.estimated_cost_usd ? ` ($${payload.estimated_cost_usd})` : ''}`
    case 'approval_resolved':
      return `Approval ${payload?.action ?? 'resolved'}: ${payload?.tool_name ?? 'unknown'}`
    case 'run_started':
      return `Run started${payload?.trigger ? ` (${payload.trigger})` : ''}`
    case 'run_finished':
      return `Run finished${payload?.tokens_used ? ` — ${payload.tokens_used} tokens` : ''}`
    case 'agent_paused':
      return 'Agent paused'
    case 'agent_resumed':
      return 'Agent resumed'
    case 'transaction_submitted':
      return `Transaction: ${payload?.type ?? 'unknown'}${payload?.amount ? ` — ${payload.amount}` : ''}`
    default:
      return event.event_type.replace(/_/g, ' ')
  }
}

/** Extract structured details from event payload for the LLM */
function extractEventDetails(event: FeedEvent): Record<string, unknown> | null {
  const payload = event.payload as Record<string, unknown> | null
  if (!payload) return null

  // Only include relevant fields, not the full payload blob
  const details: Record<string, unknown> = {}

  if (payload.tool_name) details.tool = payload.tool_name
  if (payload.error) details.error = payload.error
  if (payload.message) details.message = payload.message
  if (payload.channel) details.channel = payload.channel
  if (payload.tokens_used) details.tokensUsed = payload.tokens_used
  if (payload.estimated_cost_usd) details.estimatedCostUsd = payload.estimated_cost_usd
  if (payload.action) details.action = payload.action
  if (payload.success !== undefined) details.success = payload.success
  if (payload.duration_ms) details.durationMs = payload.duration_ms

  return Object.keys(details).length > 0 ? details : null
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
