'use client'

import { useState, useEffect } from 'react'
import { Check, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PostCreateGuideProps {
  agentId: string
  hasChannels: boolean
  hasRuntime: boolean
  hasSuccessfulRun: boolean
  onAddChannel?: () => void
  onDeploy?: () => void
  onOpenChat?: () => void
}

interface Step {
  label: string
  description: string
  completed: boolean
  onClick?: () => void
}

export function PostCreateGuide({
  agentId,
  hasChannels,
  hasRuntime,
  hasSuccessfulRun,
  onAddChannel,
  onDeploy,
  onOpenChat,
}: PostCreateGuideProps) {
  const [dismissed, setDismissed] = useState(false)

  // Check localStorage on mount
  useEffect(() => {
    try {
      if (localStorage.getItem(`guide-dismissed-${agentId}`)) {
        setDismissed(true)
      }
    } catch {
      // localStorage unavailable
    }
  }, [agentId])

  const isActivated = hasChannels && hasSuccessfulRun
  if (isActivated || dismissed) return null

  const steps: Step[] = [
    {
      label: 'Add a channel',
      description: 'Connect Telegram, Discord, or Slack',
      completed: hasChannels,
      onClick: onAddChannel,
    },
    {
      label: 'Deploy',
      description: 'Assign a runtime for 24/7 availability',
      completed: hasRuntime,
      onClick: onDeploy,
    },
    {
      label: 'Send a test',
      description: 'Open the chat panel and say hello',
      completed: hasSuccessfulRun,
      onClick: onOpenChat,
    },
  ]

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(`guide-dismissed-${agentId}`, '1')
    } catch {
      // localStorage unavailable
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 mx-6 mt-3 relative">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors duration-150"
        aria-label="Dismiss guide"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="text-sm text-foreground mb-3">Your agent is ready.</p>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <button
            key={step.label}
            type="button"
            onClick={step.completed ? undefined : step.onClick}
            disabled={step.completed}
            className={cn(
              'flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm',
              'transition-colors duration-150',
              step.completed
                ? 'text-muted-foreground cursor-default'
                : 'text-foreground hover:bg-accent cursor-pointer',
            )}
          >
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              {step.completed ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className={cn(step.completed && 'line-through')}>{step.label}</div>
              <div className="text-[11px] text-muted-foreground">{step.description}</div>
            </div>
            {!step.completed && step.onClick && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
