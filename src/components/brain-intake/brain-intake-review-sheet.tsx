'use client'

import { AlertCircle, BookOpenText, Brain, FileText, GitMerge, Link2, SearchCheck, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import type { BrainIntakeDraftItem } from '@/lib/brain-intake/schema'
import { cn } from '@/lib/utils'

export function BrainIntakeReviewSheet({
  open,
  onOpenChange,
  items,
  summary,
  isCommitting,
  onItemsChange,
  onCommit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: BrainIntakeDraftItem[]
  summary: string
  isCommitting: boolean
  onItemsChange: (items: BrainIntakeDraftItem[]) => void
  onCommit: () => Promise<boolean>
}) {
  const selectedCount = items.filter((item) => item.selected).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/70 p-5">
          <SheetTitle>Review Brain update</SheetTitle>
          <SheetDescription>
            Lucid classified this input before saving. Adjust anything that looks wrong.
          </SheetDescription>
          {summary ? (
            <div className="mt-3 w-fit rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
              {summary}
            </div>
          ) : null}
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-5">
            {items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                Nothing to review yet.
              </div>
            ) : null}
            {items.map((item) => (
              <BrainIntakeReviewItem
                key={item.id}
                item={item}
                onChange={(patch) => {
                  onItemsChange(items.map((candidate) => (
                    candidate.id === item.id ? { ...candidate, ...patch } : candidate
                  )))
                }}
              />
            ))}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selectedCount} selected. Recall tests open the tester instead of storing data.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full"
                disabled={selectedCount === 0 || isCommitting}
                onClick={async () => {
                  const ok = await onCommit()
                  if (ok) onOpenChange(false)
                }}
              >
                {isCommitting ? 'Saving...' : 'Save to Brain'}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function BrainIntakeReviewItem({
  item,
  onChange,
}: {
  item: BrainIntakeDraftItem
  onChange: (patch: Partial<BrainIntakeDraftItem>) => void
}) {
  const meta = destinationMeta(item.destination)

  return (
    <div
      className={cn(
        'rounded-3xl border bg-card/70 p-4 shadow-sm transition-opacity',
        item.selected ? 'border-border/70' : 'border-border/40 opacity-55',
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.selected}
          onCheckedChange={(checked) => onChange({ selected: checked === true })}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 rounded-full bg-background/70">
              <meta.icon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {Math.round(item.confidence * 100)}%
            </Badge>
            {item.requiresReview ? (
              <Badge variant="outline" className="gap-1 rounded-full border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-3 w-3" />
                review
              </Badge>
            ) : null}
          </div>

          <Input
            value={item.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="h-10 rounded-2xl bg-background/70"
          />
          <div className="grid gap-2 rounded-2xl border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Trust: {item.trustLevel.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Action: {item.recommendedAction.replace(/_/g, ' ')}</span>
            </div>
            <div>Scope: {item.suggestedScope}</div>
            <div>Priority: {item.priority}</div>
          </div>
          <Textarea
            value={item.body}
            onChange={(event) => onChange({ body: event.target.value })}
            className="min-h-24 rounded-2xl bg-background/70 text-sm leading-6"
          />
          {item.explanation ? (
            <p className="text-xs leading-5 text-muted-foreground">{item.explanation}</p>
          ) : null}
          {item.extractedFacts.length > 0 ? (
            <div className="rounded-2xl border border-border/60 bg-background/50 p-3">
              <p className="mb-2 text-xs font-medium text-foreground">Detected facts</p>
              <div className="space-y-1">
                {item.extractedFacts.slice(0, 3).map((fact) => (
                  <p key={fact.text} className="text-xs leading-5 text-muted-foreground">
                    {fact.text} <span className="text-muted-foreground/70">({Math.round(fact.confidence * 100)}%)</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {item.duplicateOf ? (
            <div className="flex items-start gap-2 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-200">
              <GitMerge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>May duplicate or overlap with "{item.duplicateOf.title}". Review before saving.</p>
            </div>
          ) : null}
          {item.conflicts.length > 0 ? (
            <div className="space-y-1 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {item.conflicts.map((conflict) => (
                <p key={conflict.id}>{conflict.summary}</p>
              ))}
            </div>
          ) : null}
          {item.warnings.length > 0 ? (
            <div className="space-y-1 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              {item.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function destinationMeta(destination: BrainIntakeDraftItem['destination']) {
  if (destination === 'context') return { label: 'Context', icon: Brain }
  if (destination === 'knowledge_fact') return { label: 'Fact', icon: BookOpenText }
  if (destination === 'knowledge_document') return { label: 'Document', icon: FileText }
  if (destination === 'knowledge_source') return { label: 'Source', icon: Link2 }
  return { label: 'Recall test', icon: SearchCheck }
}
