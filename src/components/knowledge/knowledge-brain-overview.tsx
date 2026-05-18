'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, BookOpenText, Brain, Gauge, ShieldCheck, Sparkles } from 'lucide-react'

import { BrainIntakeInput } from '@/components/brain-intake/brain-intake-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'
import type { KnowledgeManagerOverview } from '@/features/knowledge-manager/types'
import { cn } from '@/lib/utils'

interface KnowledgeBrainOverviewProps {
  overview: KnowledgeManagerOverview
  workspaceSlug: string
  workspaceId: string
  onOpenContext: () => void
  onOpenKnowledge: () => void
  onOpenHealth: () => void
  onRecall?: (query: string) => void
}

export function KnowledgeBrainOverview({
  overview,
  workspaceSlug,
  workspaceId,
  onOpenContext,
  onOpenKnowledge,
  onOpenHealth,
  onRecall,
}: KnowledgeBrainOverviewProps) {
  const hasReviewBlockers = overview.counts.review.open > 0 || overview.health.staleSourceCount > 0
  const hasKnowledge = overview.activation.hasKnowledge
  const factsCount = overview.counts.facts.workspace + overview.counts.facts.project

  return (
    <div className="space-y-5">
      <section>
        <Card className="overflow-hidden rounded-[32px] border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_32%),linear-gradient(135deg,hsl(var(--card)/0.98),hsl(var(--background)/0.92))] shadow-sm">
          <CardContent className="p-0">
            <div className="grid min-h-[320px] lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
              <div className="flex flex-col justify-center gap-7 p-7">
                <div className="max-w-2xl space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Workspace Brain
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      {hasKnowledge ? 'Your agents have one source of truth.' : 'Set the source of truth before agents act.'}
                    </h2>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      Context tells agents what to believe and obey. Knowledge gives them facts, documents, and sources to retrieve. Health shows whether the Brain is safe to rely on.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button className="rounded-full" onClick={onOpenContext}>
                    {hasKnowledge ? 'Open context' : 'Add context'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="rounded-full bg-background/70" onClick={onOpenKnowledge}>
                    {hasKnowledge ? 'Open knowledge' : 'Add knowledge'}
                  </Button>
                </div>
              </div>

              <div className="border-t border-border/60 bg-background/35 p-5 lg:border-l lg:border-t-0">
                <div className="flex h-full flex-col justify-center gap-3">
                  <BrainLayerCard
                    icon={<Brain className="h-4 w-4" />}
                    title="Context"
                    description="Thesis, policy, decisions, risks, signals, Daily Intel, and long-lived operating memory."
                    status={factsCount > 0 ? 'Configured' : 'Needs setup'}
                    ready={factsCount > 0}
                    onClick={onOpenContext}
                  />
                  <BrainLayerCard
                    icon={<BookOpenText className="h-4 w-4" />}
                    title="Knowledge"
                    description="Facts, documents, and source URLs with provenance, retrieval eligibility, and citations."
                    status={hasKnowledge ? 'Available' : 'Empty'}
                    ready={hasKnowledge}
                    onClick={onOpenKnowledge}
                  />
                  <BrainLayerCard
                    icon={<ShieldCheck className="h-4 w-4" />}
                    title="Health"
                    description="Review stale sources, unresolved issues, indexing failures, and recall confidence."
                    status={hasReviewBlockers ? 'Needs review' : 'Clean'}
                    ready={!hasReviewBlockers}
                    onClick={onOpenHealth}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <BrainIntakeInput
        orgId={workspaceId}
        scopeId={workspaceId}
        onRecall={onRecall}
      />

      {hasKnowledge ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <BrainMetric label="Facts" value={factsCount} detail="workspace + project" />
            <BrainMetric label="Documents" value={overview.counts.documents.total} detail="indexed files" />
            <BrainMetric label="Sources" value={overview.counts.sources.total} detail={`${overview.counts.sources.active} active`} />
            <BrainMetric label="Open review" value={overview.counts.review.open} detail="health queue" tone={hasReviewBlockers ? 'warning' : 'default'} />
          </section>

          <div className="flex flex-col gap-3 rounded-[24px] border border-border/70 bg-card/45 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Need raw provenance, evals, or repair tools? Use Mission Control Knowledge.
            </span>
            <Button asChild variant="outline" size="sm" className="w-fit rounded-full bg-background/70">
              <Link href={`/${workspaceSlug}/mission-control/knowledge`}>
                Open Knowledge
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function BrainLayerCard({
  icon,
  title,
  description,
  status,
  ready,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  status: string
  ready: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="group flex flex-col rounded-3xl border border-border/70 bg-card/80 p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/70 bg-background text-primary">
          {icon}
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[11px] font-medium',
            ready
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
          )}
        >
          {status}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <span className="pt-3 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Open
      </span>
    </button>
  )
}

function BrainMetric({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: number
  detail: string
  tone?: 'default' | 'warning'
}) {
  return (
    <WorkspaceMetricCard
      label={label}
      value={value}
      detail={detail}
      icon={Gauge}
      tone={tone}
      className="bg-card/45"
    />
  )
}
