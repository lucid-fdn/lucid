import type { Agent } from '@/types/agent'
import { getChannelUiStats } from '@/lib/channels/types'
import type { FeedEvent, PendingApproval } from '@/lib/mission-control/types'
import { getRuntimeModePresentation } from '@/lib/engines/presentation'

export interface AgentUiProjection {
  id: string
  pendingApprovals: number
  channelCount: number
  teamLabel: string
  lastEventLabel: string | null
  lastEventAt: string | null
  lastFailureLabel: string | null
  lastFailureAt: string | null
  needsAttention: boolean
  attentionLabel: string | null
  runtimeTitle: string
  runtimeDescription: string
  runtimeOperator: string
  runtimeProviderLabel: string | null
}

function formatEventLabel(eventType: string) {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isAttentionEvent(event: FeedEvent | null | undefined) {
  if (!event) return false

  return (
    event.severity === 'error' ||
    event.severity === 'critical' ||
    event.event_type === 'task_failed' ||
    event.event_type === 'crew_run_failed' ||
    event.event_type === 'crew_member_failed'
  )
}

function buildTeamLabel(agent: Agent) {
  return agent.crew_id ? 'Team-linked' : 'Standalone'
}

export function buildAgentUiProjection(params: {
  agent: Agent
  feedEvents: FeedEvent[]
  approvals: PendingApproval[]
}): AgentUiProjection {
  const { agent, feedEvents, approvals } = params
  const latestEvent = feedEvents
    .filter((event) => event.agent_id === agent.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
  const latestFailureEvent = feedEvents
    .filter((event) => event.agent_id === agent.id && isAttentionEvent(event))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
  const pendingApprovals = approvals.filter((approval) => approval.agent_id === agent.id).length
  const channelCount = getChannelUiStats(agent.assistant_channels ?? []).connected
  const inferredRuntimeFlavor =
    agent.runtime_flavor ?? (agent.runtime_id ? 'c1_managed' : 'shared')
  const runtimeMode = getRuntimeModePresentation({
    runtimeFlavor: inferredRuntimeFlavor,
    runtimeTier:
      inferredRuntimeFlavor === 'c2a_autonomous'
        ? 'byo'
        : inferredRuntimeFlavor === 'c1_managed'
          ? 'dedicated'
          : null,
  })
  const needsAttention = pendingApprovals > 0 || isAttentionEvent(latestEvent)
  const attentionLabel =
    pendingApprovals > 0
      ? `${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} waiting`
      : latestFailureEvent
        ? formatEventLabel(latestFailureEvent.event_type)
        : null

  return {
    id: agent.id,
    pendingApprovals,
    channelCount,
    teamLabel: buildTeamLabel(agent),
    lastEventLabel: latestEvent ? formatEventLabel(latestEvent.event_type) : null,
    lastEventAt: latestEvent?.created_at ?? null,
    lastFailureLabel: latestFailureEvent ? formatEventLabel(latestFailureEvent.event_type) : null,
    lastFailureAt: latestFailureEvent?.created_at ?? null,
    needsAttention,
    attentionLabel,
    runtimeTitle: runtimeMode.title,
    runtimeDescription: runtimeMode.description,
    runtimeOperator: runtimeMode.operator,
    runtimeProviderLabel: runtimeMode.providerLabel,
  }
}

export function buildAgentUiProjectionMap(params: {
  agents: Agent[]
  feedEvents: FeedEvent[]
  approvals: PendingApproval[]
}) {
  const { agents, feedEvents, approvals } = params

  return new Map(
    agents.map((agent) => [
      agent.id,
      buildAgentUiProjection({
        agent,
        feedEvents,
        approvals,
      }),
    ]),
  )
}
