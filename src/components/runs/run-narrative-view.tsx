'use client'

import React, { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  DollarSign,
  MessageSquare,
  User,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatNarrativeLabel,
  formatNarrativeTime,
  getNarrativeDetailSections,
  getNarrativeMetrics,
  isNarrativeError,
  type NarrativeDetailSection,
  type RunNarrativeItem,
} from '@/lib/runs/narrative'

export function RunNarrativeView({
  items,
  emptyTitle = 'No execution narrative yet',
}: {
  items: RunNarrativeItem[]
  emptyTitle?: string
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const totals = useMemo(
    () => ({
      tokens: items.reduce((sum, item) => sum + (item.tokensUsed ?? 0), 0),
      cost: items.reduce((sum, item) => sum + (item.costUsd ?? 0), 0),
      errors: items.filter((item) => isNarrativeError(item.status)).length,
    }),
    [items],
  )

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyTitle}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{items.length} event{items.length === 1 ? '' : 's'}</span>
        {totals.tokens > 0 ? <span>{totals.tokens.toLocaleString()} tokens</span> : null}
        {totals.cost > 0 ? (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            ${totals.cost.toFixed(4)}
          </span>
        ) : null}
        {totals.errors > 0 ? (
          <span className="flex items-center gap-1 text-red-500">
            <AlertTriangle className="h-3 w-3" />
            {totals.errors} error{totals.errors === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const sections = getNarrativeDetailSections(item)
          const expanded = expandedIds.has(item.id)
          return (
            <RunNarrativeLedgerCard
              key={item.id}
              item={item}
              index={index}
              sections={sections}
              expanded={expanded}
              onToggle={() =>
                setExpandedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(item.id)) next.delete(item.id)
                  else next.add(item.id)
                  return next
                })
              }
            />
          )
        })}
      </div>
    </div>
  )
}

function RunNarrativeLedgerCard({
  item,
  index,
  sections,
  expanded,
  onToggle,
}: {
  item: RunNarrativeItem
  index: number
  sections: NarrativeDetailSection[]
  expanded: boolean
  onToggle: () => void
}) {
  const isError = isNarrativeError(item.status)
  const Icon = getNarrativeIcon(item)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const metrics = getNarrativeMetrics(item)
  const firstSection = sections[0] ?? null
  const hasExpandableDetails = sections.length > 1

  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <div className="flex min-h-full flex-col items-center">
        <div
          className={cn(
            'mt-1 flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-medium',
            isError
              ? 'border-red-500/30 bg-red-500/10 text-red-500'
              : item.status === 'running' || item.status === 'starting'
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-500'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
          )}
        >
          {index + 1}
        </div>
        <div className="mt-2 w-px flex-1 bg-border/60" />
      </div>

      <div
        className={cn(
          'rounded-xl border transition-colors',
          isError ? 'border-red-500/30 bg-red-500/5' : 'border-border/70 bg-background/40',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md border',
                  isError
                    ? 'border-red-500/20 bg-red-500/10 text-red-500'
                    : 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.title}</p>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatNarrativeTime(item.timestamp)}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
              {item.direction ? <NarrativeBadge>{item.direction}</NarrativeBadge> : null}
              {item.kind ? <NarrativeBadge>{formatNarrativeLabel(item.kind)}</NarrativeBadge> : null}
              {item.channel ? <NarrativeBadge>{item.channel}</NarrativeBadge> : null}
              {item.status ? (
                <NarrativeBadge tone={isError ? 'error' : item.status === 'running' || item.status === 'starting' ? 'accent' : 'default'}>
                  {formatNarrativeLabel(item.status)}
                </NarrativeBadge>
              ) : null}
              {metrics.map((metric) => (
                <NarrativeBadge key={metric}>{metric}</NarrativeBadge>
              ))}
            </div>

            {item.summary ? (
              <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p>
            ) : null}

            {firstSection ? (
              <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {firstSection.label}
                </div>
                <p className={cn('mt-1 whitespace-pre-wrap text-xs', getSectionToneClass(firstSection))}>
                  {firstSection.content}
                </p>
              </div>
            ) : null}
          </div>

          {hasExpandableDetails ? (
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 rounded-md border border-border/60 p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              aria-label={expanded ? 'Collapse run details' : 'Expand run details'}
            >
              <Chevron className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {expanded && sections.length > 0 ? (
          <div className="space-y-3 border-t border-border/50 px-4 py-3">
            {sections.slice(firstSection ? 1 : 0).map((section) => (
              <div key={section.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </div>
                <p className={cn('mt-1 whitespace-pre-wrap text-xs', getSectionToneClass(section))}>
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function NarrativeBadge({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'error' | 'accent'
}) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5',
        tone === 'error'
          ? 'bg-red-500/15 text-red-500'
          : tone === 'accent'
            ? 'bg-blue-500/15 text-blue-500'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

function getSectionToneClass(section: NarrativeDetailSection) {
  if (section.tone === 'error') return 'text-red-500'
  if (section.tone === 'muted') return 'text-muted-foreground'
  return 'text-foreground/85'
}

function getNarrativeIcon(item: RunNarrativeItem) {
  if (item.direction === 'inbound') return User
  if (item.kind === 'tool_call' || item.kind === 'tool_result') return Wrench
  if (isNarrativeError(item.status)) return AlertTriangle
  if (item.kind?.includes('message') || item.kind?.includes('chat')) return MessageSquare
  return Bot
}
