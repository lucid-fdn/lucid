'use client'

import { useState, useCallback } from 'react'
import {
  Activity,
  Pause,
  Play,
  Skull,
  ArrowUpCircle,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LiveFeedPane } from '@/components/mission-control/command-center/live-feed-pane'
import type { FeedEvent, PendingApproval, ControlAction } from '@/lib/mission-control/types'
import type { Agent as Assistant } from '@/types/agent'

interface OperationsConsoleProps {
  feedEvents: FeedEvent[]
  feedLoading?: boolean
  approvals: PendingApproval[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
  selectedAgent: Assistant | null
  onControl: (action: ControlAction) => Promise<void>
}

export function OperationsConsole({
  feedEvents,
  feedLoading = false,
  approvals,
  onApprove,
  onDeny,
  selectedAgent,
  onControl,
}: OperationsConsoleProps) {
  const [activeTab, setActiveTab] = useState<'feed'>('feed')
  const [loadingAction, setLoadingAction] = useState<ControlAction | null>(null)
  const [copied, setCopied] = useState(false)

  const handleAction = useCallback(async (action: ControlAction) => {
    if (!selectedAgent) return
    setLoadingAction(action)
    try {
      await onControl(action)
    } finally {
      setLoadingAction(null)
    }
  }, [selectedAgent, onControl])

  const handleCopyId = useCallback(() => {
    if (!selectedAgent) return
    navigator.clipboard.writeText(selectedAgent.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [selectedAgent])

  const pendingCount = approvals.filter((a) => a.status === 'pending').length
  const isPaused = selectedAgent && (!selectedAgent.is_active || selectedAgent.mc_status === 'paused')

  return (
    <div className="flex flex-col h-full border-t border-zinc-800">
      {/* Console Header: tabs + controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background">
        {/* Left: tab buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === 'feed' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setActiveTab('feed')}
          >
            <Activity className="h-3 w-3" />
            Feed
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px] animate-pulse">
                {pendingCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Right: inline controls (only when agent selected) */}
        {selectedAgent && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 mr-1 max-w-[120px] truncate">
              {selectedAgent.name}
            </span>

            {/* Pause/Resume */}
            <Button
              size="sm"
              variant={isPaused ? 'default' : 'outline'}
              className="h-6 text-[10px] px-2"
              onClick={() => handleAction(isPaused ? 'resume' : 'pause')}
              disabled={loadingAction !== null}
            >
              {isPaused ? (
                <><Play className="h-3 w-3 mr-0.5" /> Resume</>
              ) : (
                <><Pause className="h-3 w-3 mr-0.5" /> Pause</>
              )}
            </Button>

            {/* Kill */}
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] px-2"
              onClick={() => handleAction('kill')}
              disabled={loadingAction !== null}
            >
              <Skull className="h-3 w-3 mr-0.5" />
              Kill
            </Button>

            {/* Escalate */}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
              onClick={() => handleAction('escalate')}
              disabled={loadingAction !== null}
            >
              <ArrowUpCircle className="h-3 w-3 mr-0.5" />
              Escalate
            </Button>

            {/* Copy ID */}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={handleCopyId}
            >
              <Copy className="h-3 w-3 mr-0.5" />
              {copied ? 'Copied!' : 'ID'}
            </Button>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'feed' && (
          <LiveFeedPane
            events={feedEvents}
            approvals={approvals}
            onApprove={onApprove}
            onDeny={onDeny}
            loading={feedLoading}
            showHeader={false}
            className="flex-1 flex flex-col min-w-0 overflow-hidden h-full"
          />
        )}
      </div>
    </div>
  )
}
