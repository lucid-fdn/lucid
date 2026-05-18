'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  TriangleAlert,
} from 'lucide-react'
import type {
  ResolvedSharedContext,
  SharedContextRecord,
  SharedContextRecordType,
} from '@contracts/shared-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PRIORITY_TYPES: SharedContextRecordType[] = [
  'thesis',
  'policy',
  'decision',
  'risk',
  'daily_intel',
  'signal',
  'feedback',
  'open_question',
  'memory',
]

const TYPE_STYLES: Partial<Record<SharedContextRecordType, string>> = {
  thesis: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300',
  policy: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  decision: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
  risk: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  daily_intel: 'border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300',
}

interface WorkspaceBrainSummaryCardProps {
  endpoint: string
  workspaceBrainHref: string
  className?: string
  title?: string
  description?: string
  primaryActionLabel?: string
}

export function WorkspaceBrainSummaryCard({
  endpoint,
  workspaceBrainHref,
  className,
  title = 'Workspace Brain',
  description = 'Global context inherited by projects, teams, and agents.',
  primaryActionLabel = 'Open Brain',
}: WorkspaceBrainSummaryCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [context, setContext] = useState<ResolvedSharedContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resolvedUrl = useMemo(
    () => `${endpoint}${endpoint.includes('?') ? '&' : '?'}resolve=true`,
    [endpoint],
  )

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(resolvedUrl, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json() as { context?: ResolvedSharedContext }
      setContext(json.context ?? null)
    } catch {
      setError('Could not load Workspace Brain')
    } finally {
      setIsLoading(false)
    }
  }, [resolvedUrl])

  useEffect(() => {
    void reload()
  }, [reload])

  const records = context?.records ?? []
  const activeRecords = records.filter((record) => record.status === 'active')
  const featuredRecords = useMemo(() => {
    return [...activeRecords]
      .sort((a, b) => {
        const typeA = PRIORITY_TYPES.indexOf(a.record_type)
        const typeB = PRIORITY_TYPES.indexOf(b.record_type)
        if (typeA !== typeB) return typeA - typeB
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
      .slice(0, 4)
  }, [activeRecords])

  const policyCount = Object.keys(context?.inherited_policy ?? {}).length
  const conflictCount = context?.policy_conflicts.length ?? 0
  const lastUpdated = activeRecords
    .map((record) => record.updated_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

  return (
    <section className={cn('overflow-hidden rounded-[24px] border border-border/70 bg-card/55 shadow-sm', className)}>
      <div className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_42%)] px-5 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Brain className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
                <p className="text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BrainMetric icon={<FileText className="h-3.5 w-3.5" />} label={`${activeRecords.length} records`} />
              <BrainMetric icon={<Shield className="h-3.5 w-3.5" />} label={`${policyCount} policies`} />
              <BrainMetric
                icon={conflictCount > 0 ? <TriangleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                label={conflictCount > 0 ? `${conflictCount} conflicts` : 'No conflicts'}
                tone={conflictCount > 0 ? 'warning' : 'ok'}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full bg-background/70">
              <Link href={`${workspaceBrainHref}${workspaceBrainHref.includes('?') ? '&' : '?'}intent=daily-intel`}>
                Generate Daily Intel
                <Sparkles className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full bg-background/70"
              onClick={() => void reload()}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link href={workspaceBrainHref}>
                {primaryActionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-border/60 bg-background/45" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200">
            {error}. Open the full Brain page to retry or manage records.
          </div>
        ) : featuredRecords.length === 0 ? (
          <EmptyBrainState workspaceBrainHref={workspaceBrainHref} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {featuredRecords.map((record) => (
              <BrainRecordPreview key={record.id} record={record} />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `Last updated ${formatDate(lastUpdated)}` : 'No context has been added yet.'}
          </p>
          <Button asChild variant="ghost" size="sm" className="h-8 rounded-full text-xs">
            <Link href={workspaceBrainHref}>
              Manage context
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

function BrainMetric({
  icon,
  label,
  tone = 'default',
}: {
  icon: ReactNode
  label: string
  tone?: 'default' | 'ok' | 'warning'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/65 px-2.5 py-1 text-[11px] text-muted-foreground',
        tone === 'ok' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300',
      )}
    >
      {icon}
      {label}
    </span>
  )
}

function BrainRecordPreview({ record }: { record: SharedContextRecord }) {
  return (
    <article className="min-h-[128px] rounded-2xl border border-border/70 bg-background/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <Badge
          variant="outline"
          className={cn(
            'h-6 rounded-full border-border/70 px-2 text-[10px] font-medium',
            TYPE_STYLES[record.record_type],
          )}
        >
          {formatRecordType(record.record_type)}
        </Badge>
        {record.confidence != null ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {Math.round(record.confidence * 100)}%
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 line-clamp-1 text-sm font-semibold text-foreground">{record.title}</h3>
      <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{record.body}</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        <Target className="h-3 w-3" />
        <span>{record.scope_type}</span>
        {record.links?.length ? <span>{record.links.length} source{record.links.length === 1 ? '' : 's'}</span> : null}
      </div>
    </article>
  )
}

function EmptyBrainState({ workspaceBrainHref }: { workspaceBrainHref: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-background/45 p-6 text-center">
      <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">Set the workspace thesis</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        Add the first thesis, policy, decision, or risk so every project and agent inherits the same context.
      </p>
      <Button asChild size="sm" className="mt-4 rounded-full">
        <Link href={workspaceBrainHref}>
          Open Workspace Brain
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

function formatRecordType(type: SharedContextRecordType) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}
