import React from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, Clock3, Loader2 } from 'lucide-react'
import type { CrewRun } from '@contracts/crew'
import { Badge } from '@/components/ui/badge'
import { formatNarrativeDuration } from '@/lib/runs/narrative'
import { deriveCrewRunContinuation } from '@/lib/runs/continuation'

function getLiveRunDuration(run: CrewRun) {
  const startedAtMs = new Date(run.started_at).getTime()
  if (Number.isNaN(startedAtMs)) return null
  return formatNarrativeDuration(Math.max(0, Date.now() - startedAtMs))
}

export function LiveRunWidget({
  run,
  title,
  ownerLabel,
  href,
}: {
  run: CrewRun
  title?: string
  ownerLabel?: string | null
  href?: string | null
}) {
  const handoff = deriveCrewRunContinuation(run)
  const duration = getLiveRunDuration(run)

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{title ?? 'Live run in progress'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ownerLabel ?? 'Operator attention remains lightweight unless this stalls or errors.'}
              </p>
            </div>
          </div>
        </div>
        <Badge className="bg-blue-500/15 text-blue-500">{run.status}</Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Started</p>
          <p className="mt-1 text-xs text-foreground">{new Date(run.started_at).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Elapsed</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-foreground">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            {duration ?? 'Unknown'}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost so far</p>
          <p className="mt-1 text-xs text-foreground">${Number(run.total_cost_usd ?? 0).toFixed(4)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Activity className="h-3.5 w-3.5 text-blue-500" />
          Current operator read
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {run.outcome_summary ?? handoff?.detail ?? 'The run is active and has not emitted a terminal receipt yet.'}
        </p>
      </div>

      {handoff ? (
        <div className="mt-3 rounded-lg border border-border/60 bg-background/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next action if this stalls</p>
          <p className="mt-1 text-xs text-foreground/85">{handoff.nextAction}</p>
        </div>
      ) : null}

      {href ? (
        <div className="mt-4">
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open full run context
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
