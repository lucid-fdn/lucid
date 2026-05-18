'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Clock, Pause, Play, RefreshCw, Search, Zap } from 'lucide-react'
import { RoutineStatusBadge } from './routine-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RoutineDefinition, RoutineTargetType } from '@/lib/routines/types'

interface RoutineListProps {
  routines: RoutineDefinition[]
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
  onRunNow?: (routine: RoutineDefinition) => Promise<void>
  onToggle?: (routine: RoutineDefinition, enabled: boolean) => Promise<void>
  onCancel?: (routine: RoutineDefinition) => Promise<void>
  detailHref?: (routine: RoutineDefinition) => string
}

export const TARGET_LABELS: Record<RoutineTargetType, string> = {
  assistant: 'Assistant',
  team: 'Team',
  work_graph: 'Work Graph',
  agent_ops: 'Agent Ops',
  browser_procedure: 'Browser',
  knowledge: 'Knowledge',
  engine_home: 'Engine Home',
  plugin_job: 'Plugin',
  pm_sync: 'PM Sync',
}

export function RoutineList({
  routines,
  loading = false,
  error = null,
  onRefresh,
  onRunNow,
  onToggle,
  onCancel,
  detailHref,
}: RoutineListProps) {
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<'all' | RoutineTargetType>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const summary = useMemo(() => summarizeRoutines(routines), [routines])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return routines.filter((routine) => {
      if (target !== 'all' && routine.target_type !== target) return false
      if (!needle) return true
      return [
        routine.name,
        routine.description ?? '',
        routine.task_prompt,
        routine.target_type,
        routine.task_kind,
        routine.source_kind,
      ].some((value) => value.toLowerCase().includes(needle))
    })
  }, [query, routines, target])

  async function withBusy(routine: RoutineDefinition, action: () => Promise<void>) {
    setBusyId(routine.id)
    try {
      await action()
    } finally {
      setBusyId(null)
    }
  }

  if (loading && routines.length === 0) {
    return <RoutineListSkeleton />
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <RoutineMetric label="Active" value={summary.active} tone="default" />
        <RoutineMetric label="Due soon" value={summary.dueSoon} tone="info" />
        <RoutineMetric label="Failed" value={summary.failed} tone={summary.failed > 0 ? 'danger' : 'default'} />
        <RoutineMetric label="Team" value={summary.team} tone="default" />
      </div>

      <section className="rounded-lg border bg-background">
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search routines"
                className="h-9 pl-8"
              />
            </div>
            <Select value={target} onValueChange={(value) => setTarget(value as 'all' | RoutineTargetType)}>
              <SelectTrigger className="h-9 w-full sm:w-48">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                {Object.entries(TARGET_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={!onRefresh || loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="flex items-start gap-3 border-b bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <RoutineEmptyState hasFilters={query.length > 0 || target !== 'all'} />
        ) : (
          <div className="divide-y">
            {filtered.map((routine) => {
              const busy = busyId === routine.id
              return (
                <div key={routine.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_220px] lg:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {detailHref ? (
                        <Link href={detailHref(routine)} className="truncate text-sm font-medium hover:underline">
                          {routine.name}
                        </Link>
                      ) : (
                        <h3 className="truncate text-sm font-medium">{routine.name}</h3>
                      )}
                      <RoutineStatusBadge routine={routine} />
                      <Badge variant="outline" className="rounded-md text-[11px]">
                        {TARGET_LABELS[routine.target_type]}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {routine.description || routine.task_prompt}
                    </p>
                  </div>

                  <RoutineSchedule routine={routine} />

                  <div className="space-y-1 text-xs">
                    <p className="text-muted-foreground">Source</p>
                    <p className="font-medium capitalize">{routine.source_kind.replaceAll('_', ' ')}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                      <Label htmlFor={`routine-enabled-${routine.id}`} className="text-xs text-muted-foreground">
                        {routine.enabled ? 'On' : 'Off'}
                      </Label>
                      <Switch
                        id={`routine-enabled-${routine.id}`}
                        checked={routine.enabled}
                        disabled={busy || !onToggle}
                        onCheckedChange={(enabled) => {
                          if (!onToggle) return
                          void withBusy(routine, () => onToggle(routine, enabled))
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || !onRunNow}
                      onClick={() => {
                        if (!onRunNow) return
                        void withBusy(routine, () => onRunNow(routine))
                      }}
                    >
                      <Play className="h-4 w-4" />
                      Run
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || !onCancel || routine.status === 'cancelled'}
                      onClick={() => {
                        if (!onCancel) return
                        void withBusy(routine, () => onCancel(routine))
                      }}
                    >
                      <Pause className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function RoutineSchedule({ routine }: { routine: RoutineDefinition }) {
  const nextRun = routine.next_run_at ? formatDateTime(routine.next_run_at) : 'Not scheduled'
  const cadence = routine.cron_expression
    ? routine.cron_expression
    : routine.run_at
      ? 'One-shot'
      : routine.trigger_kind.replaceAll('_', ' ')

  return (
    <div className="flex items-start gap-2 text-xs">
      <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium">{cadence}</p>
        <p className="text-muted-foreground">{nextRun}</p>
      </div>
    </div>
  )
}

function RoutineMetric({ label, value, tone }: { label: string; value: number; tone: 'default' | 'info' | 'danger' }) {
  return (
    <div className={cn(
      'rounded-lg border bg-background px-4 py-3',
      tone === 'info' && 'border-blue-500/30 bg-blue-500/5',
      tone === 'danger' && 'border-destructive/30 bg-destructive/5',
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function RoutineEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <Clock className="h-5 w-5 text-muted-foreground" />
      <div>
        <h3 className="text-sm font-medium">{hasFilters ? 'No matching routines' : 'No routines yet'}</h3>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {hasFilters
            ? 'Adjust the filters to see more scheduled work.'
            : 'Promote proven agent runs, Agent Ops workflows, team work, or engine-home jobs into durable routines.'}
        </p>
      </div>
    </div>
  )
}

function RoutineListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 rounded-lg bg-muted/60" />
        ))}
      </div>
      <div className="rounded-lg border bg-background">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="border-b px-4 py-4 last:border-b-0">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="mt-2 h-3 w-2/3 rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  )
}

function summarizeRoutines(routines: RoutineDefinition[]) {
  const now = Date.now()
  const soon = now + 24 * 60 * 60 * 1000
  return routines.reduce((acc, routine) => {
    if (routine.enabled && routine.status !== 'cancelled') acc.active += 1
    if (routine.target_type === 'team') acc.team += 1
    if (routine.status === 'failed' || routine.status === 'dead_letter' || routine.last_run_status === 'failed') acc.failed += 1
    const next = routine.next_run_at ? new Date(routine.next_run_at).getTime() : Number.POSITIVE_INFINITY
    if (next >= now && next <= soon) acc.dueSoon += 1
    return acc
  }, { active: 0, dueSoon: 0, failed: 0, team: 0 })
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
