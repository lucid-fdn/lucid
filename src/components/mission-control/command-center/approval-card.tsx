'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Shield, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RISK_BADGE_VARIANTS } from '@/lib/mission-control/constants'
import type { PendingApproval } from '@/lib/mission-control/types'

interface ApprovalCardProps {
  approval: PendingApproval
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

export function ApprovalCard({ approval, onApprove, onDeny }: ApprovalCardProps) {
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const update = () => {
      const remaining = new Date(approval.expires_at).getTime() - Date.now()
      if (remaining <= 0) {
        setCountdown('Expired')
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [approval.expires_at])

  const handleApprove = async () => {
    setLoading('approve')
    onApprove(approval.id)
  }

  const handleDeny = async () => {
    setLoading('deny')
    onDeny(approval.id)
  }

  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 animate-in slide-in-from-top-1 duration-200">
      <div className="flex items-start gap-2.5">
        <Shield className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-300">
              Approval Required
            </span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                RISK_BADGE_VARIANTS[approval.risk_level]
              )}
            >
              {approval.risk_level.toUpperCase()}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              {countdown}
            </span>
          </div>
          <p className="text-sm mt-1">
            <span className="text-muted-foreground">{approval.agent_name}</span>
            {' wants to call '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">
              {approval.tool_name}
            </code>
          </p>
          {approval.estimated_cost_usd !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Estimated cost: ${approval.estimated_cost_usd.toFixed(4)}
            </p>
          )}
          {expanded && (
            <pre className="mt-2 text-[11px] text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(approval.tool_args, null, 2)}
            </pre>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-1"
          >
            {expanded ? 'Hide args' : 'Show args'}
          </button>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          variant="default"
          onClick={handleApprove}
          disabled={loading !== null}
          className="h-8 flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {loading === 'approve' ? 'Approving...' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDeny}
          disabled={loading !== null}
          className="h-8 flex-1"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          {loading === 'deny' ? 'Denying...' : 'Deny'}
        </Button>
      </div>
    </div>
  )
}
