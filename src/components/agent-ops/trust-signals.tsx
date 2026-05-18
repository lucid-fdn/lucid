import { AlertTriangle, CheckCircle2, CircleDot } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentOpsTrustAction, AgentOpsTrustSignal } from '@/lib/agent-ops/trust-center'

export function TrustSignals({
  signals,
  onAction,
}: {
  signals: AgentOpsTrustSignal[]
  onAction?: (action: AgentOpsTrustAction) => void
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {signals.map((signal) => (
        <div
          key={signal.id}
          className={cn(
            'rounded-2xl border bg-background/70 p-4',
            signal.state === 'blocked' && 'border-red-500/30 bg-red-500/5',
            signal.state === 'watch' && 'border-amber-500/30 bg-amber-500/5',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {signal.state === 'clear' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : signal.state === 'blocked' ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <CircleDot className="h-4 w-4 text-amber-500" />
                )}
                <h4 className="text-sm font-semibold">{signal.label}</h4>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{signal.summary}</p>
            </div>
            <span className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
              {signal.count || formatLabel(signal.state)}
            </span>
          </div>
          {signal.actions.length > 0 ? (
            <div className="mt-3 space-y-2">
              {signal.actions.map((action) => (
                <div key={action.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{action.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{action.impact}</p>
                  </div>
                  {onAction ? (
                    <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => onAction(action)}>
                      {action.ctaLabel}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
