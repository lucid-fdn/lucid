'use client'

/**
 * Command Center — 4-Pane Client Layout
 *
 * Left:   Agent list (status, cost, risk)
 * Center: Live feed (events + pinned approvals)
 * Right:  Context panel (selected agent state)
 * Bottom: Controls (pause/resume/kill/escalate)
 *
 * Uses Supabase Realtime for instant feed + approval updates.
 * Falls back to polling when Realtime is disconnected.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { AgentListPane } from '@/components/mission-control/command-center/agent-list-pane'
import { LiveFeedPane } from '@/components/mission-control/command-center/live-feed-pane'
import { ContextPane } from '@/components/mission-control/command-center/context-pane'
import { ControlsBar } from '@/components/mission-control/command-center/controls-bar'
import { ResizablePanelLayout } from '@/components/panels/resizable-layout'
import { useLiveFeed } from '@/hooks/use-live-feed'
import { useApprovals } from '@/hooks/use-approvals'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { AGENT_LIST_POLL_INTERVAL } from '@/lib/mission-control/constants'
import type { MCAgent, MCAgentContext, FeedEvent, PendingApproval, ControlAction } from '@/lib/mission-control/types'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

interface CommandCenterClientProps {
  orgId: string
  workspaceSlug: string
  initialAgents: MCAgent[]
  initialFeedEvents: FeedEvent[]
  initialApprovals: PendingApproval[]
}

export function CommandCenterClient({
  orgId,
  workspaceSlug,
  initialAgents,
  initialFeedEvents,
  initialApprovals,
}: CommandCenterClientProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    initialAgents[0]?.id ?? null
  )
  const [agentContext, setAgentContext] = useState<MCAgentContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)

  // ─── Live feed via Realtime ───
  const { events: feedEvents, isLoading: feedLoading, realtimeStatus: feedStatus } = useLiveFeed({
    orgId,
    initialEvents: initialFeedEvents,
  })

  // ─── Approvals via Realtime ───
  const {
    approvals,
    approve: handleApprove,
    deny: handleDeny,
    realtimeStatus: approvalStatus,
  } = useApprovals({
    orgId,
    initialApprovals,
  })

  // ─── Agent list via Realtime ───
  const agentSubscriptions: RealtimeSubscription[] = useMemo(() => [
    { table: 'ai_assistants', events: ['UPDATE'] as const },
  ], [])

  const agentQueryFn = useMemo(() => {
    return async (): Promise<MCAgent[]> => {
      const res = await fetch(`/api/mission-control/agents?org_id=${orgId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.agents ?? []
    }
  }, [orgId])

  const {
    data: agents,
    setData: setAgents,
    isRealtimeConnected: agentRealtimeConnected,
  } = useRealtimeQuery<MCAgent[]>({
    queryFn: agentQueryFn,
    realtimeConfig: {
      channelName: `mc-agents-${orgId}`,
      subscriptions: agentSubscriptions,
      orgId,
    },
    initialData: initialAgents,
    pollInterval: AGENT_LIST_POLL_INTERVAL,
    heartbeatInterval: 60_000,
  })

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null

  // ─── Fetch agent context on selection ───
  const fetchContext = useCallback(async (agentId: string) => {
    setContextLoading(true)
    try {
      const res = await fetch(`/api/mission-control/agents/${agentId}?org_id=${orgId}`)
      if (res.ok) {
        const data = await res.json()
        setAgentContext(data)
      }
    } catch {
      // Context fetch failure is non-critical
    } finally {
      setContextLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (selectedAgentId) {
      fetchContext(selectedAgentId)
    } else {
      setAgentContext(null)
    }
  }, [selectedAgentId, fetchContext])

  // ─── Control handlers ───
  const handleControl = useCallback(async (action: ControlAction) => {
    if (!selectedAgentId) return
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/mission-control/agents/${selectedAgentId}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        // Optimistic update
        setAgents((prev) =>
          prev.map((a) =>
            a.id === selectedAgentId
              ? {
                  ...a,
                  status: action === 'pause' ? 'paused' as const : action === 'resume' ? 'active' as const : a.status,
                }
              : a
          )
        )
      }
    } catch {
      // Control action failure — non-critical
    }
  }, [selectedAgentId, setAgents])

  // ─── Connection status indicator ───
  const isFullyRealtime = feedStatus === 'connected' && approvalStatus === 'connected'

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden">
      {/* Realtime status indicator */}
      {isFullyRealtime && (
        <div className="flex items-center gap-1.5 px-4 py-1 bg-green-500/5 border-b border-green-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-green-600 dark:text-green-400">Live</span>
        </div>
      )}

      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <ResizablePanelLayout
          autoSaveId="mc-command-center"
          panels={[
            {
              id: 'agents',
              defaultSize: 20,
              minSize: 12,
              maxSize: 35,
              content: (
                <AgentListPane
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                />
              ),
            },
            {
              id: 'feed',
              defaultSize: 50,
              minSize: 30,
              content: (
                <LiveFeedPane
                  events={feedEvents}
                  approvals={approvals}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  loading={feedLoading}
                  className="h-full flex flex-col min-w-0 overflow-hidden"
                />
              ),
            },
            {
              id: 'context',
              defaultSize: 30,
              minSize: 15,
              maxSize: 40,
              collapsible: true,
              collapsedSize: 0,
              content: (
                <ContextPane
                  agent={selectedAgent}
                  context={agentContext}
                  loading={contextLoading}
                />
              ),
            },
          ]}
        />
      </div>

      {/* Bottom: Controls bar */}
      <ControlsBar
        agent={selectedAgent}
        onControl={handleControl}
      />
    </div>
  )
}
