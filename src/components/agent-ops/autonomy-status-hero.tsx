'use client'

import { AlertTriangle, CheckCircle2, CircleDot, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentOpsSignalState, AgentOpsTrustAction, AgentOpsTrustCenterModel } from '@/lib/agent-ops/trust-center'

export function AutonomyStatusHero({
  model,
  onAction,
}: {
  model: AgentOpsTrustCenterModel
  onAction: (action: AgentOpsTrustAction) => void
}) {
  const issueSignals = model.signals.filter((signal) => signal.state !== 'clear')
  const clearCount = model.signals.length - issueSignals.length
  const tone = model.state === 'blocked'
    ? 'border-red-500/30 bg-red-500/5'
    : model.state === 'needs_review'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-emerald-500/30 bg-emerald-500/5'

  return (
    <section className={cn('relative overflow-hidden rounded-[28px] border p-5 sm:p-6', tone)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_38%),linear-gradient(135deg,hsl(var(--background)/0.96),transparent)]" />
      <div className="relative space-y-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {model.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {model.summary}
            </p>
          </div>
          <Button size="lg" className="w-fit rounded-full" onClick={() => onAction(model.recommendedAction)}>
            <ShieldCheck className="h-4 w-4" />
            {model.recommendedAction.ctaLabel}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issueSignals.length === 0 ? (
            <SignalPill label="All safety signals clear" state="clear" />
          ) : (
            issueSignals.map((signal) => (
              <SignalPill
                key={signal.id}
                label={`${signal.label} ${signal.state === 'blocked' ? 'blocked' : 'needs review'}`}
                state={signal.state}
              />
            ))
          )}
          {clearCount > 0 && issueSignals.length > 0 ? (
            <span className="rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
              {clearCount} clear
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function SignalPill({ label, state }: { label: string; state: AgentOpsSignalState }) {
  const Icon = state === 'blocked' ? AlertTriangle : state === 'watch' ? CircleDot : CheckCircle2
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium',
        state === 'blocked' && 'border-red-500/30 bg-red-500/10 text-red-600',
        state === 'watch' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        state === 'clear' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
