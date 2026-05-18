'use client'

import { useState } from 'react'
import { Pause, Play, Skull, ArrowUpCircle, Copy, RotateCcw, AlertTriangle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MCAgent, ControlAction } from '@/lib/mission-control/types'

interface ControlsBarProps {
  agent: MCAgent | null
  onControl: (action: ControlAction, extra?: Record<string, string>) => Promise<void>
}

export function ControlsBar({ agent, onControl }: ControlsBarProps) {
  const [loadingAction, setLoadingAction] = useState<ControlAction | null>(null)
  const [copied, setCopied] = useState(false)

  const handleAction = async (action: ControlAction) => {
    if (!agent) return
    setLoadingAction(action)
    try {
      await onControl(action)
    } finally {
      setLoadingAction(null)
    }
  }

  const handleCopyId = () => {
    if (!agent) return
    navigator.clipboard.writeText(agent.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isPaused = agent?.status === 'paused'
  const isUnreachable = agent?.runtime?.runtimeStatus === 'offline' || agent?.runtime?.runtimeStatus === 'stale'

  return (
    <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap">
      {agent ? (
        <>
          {/* Unreachable runtime warning */}
          {isUnreachable && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 mr-2">
              <AlertTriangle className="h-3 w-3" />
              Action will take effect when runtime reconnects
            </span>
          )}

          {/* Pause/Resume */}
          <Button
            size="sm"
            variant={isPaused ? 'default' : 'outline'}
            onClick={() => handleAction(isPaused ? 'resume' : 'pause')}
            disabled={loadingAction !== null}
            className="h-8"
          >
            {isPaused ? (
              <><Play className="h-3.5 w-3.5 mr-1" /> Resume</>
            ) : (
              <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</>
            )}
          </Button>

          {/* Kill Run */}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleAction('kill')}
            disabled={loadingAction !== null}
            className="h-8"
          >
            <Skull className="h-3.5 w-3.5 mr-1" />
            Kill Run
          </Button>

          {/* Nudge */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('nudge')}
            disabled={loadingAction !== null || isPaused}
            className="h-8"
            title={isPaused ? 'Resume agent first' : 'Send a wake signal to the agent'}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            Nudge
          </Button>

          {/* Escalate Model */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('escalate')}
            disabled={loadingAction !== null}
            className="h-8"
          >
            <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
            Escalate
          </Button>

          {/* Retry (placeholder) */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('kill')}
            disabled={loadingAction !== null}
            className="h-8"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>

          {/* Copy Agent ID */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyId}
            className="h-8 ml-auto"
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            {copied ? 'Copied!' : 'Copy ID'}
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Select an agent to use controls
        </p>
      )}
    </div>
  )
}
