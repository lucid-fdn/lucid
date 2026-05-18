import {
  Archive,
  ArrowRight,
  CheckCircle2,
  FileText,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type {
  KnowledgeDocumentItem,
  KnowledgeFactItem,
  KnowledgeReviewItem,
  KnowledgeSourceItem,
} from '@/features/knowledge-manager/types'
import { KnowledgeStatusBadge } from './knowledge-status-badge'

export function KnowledgeFactList({
  facts,
  onTest,
  onEdit,
  onArchive,
  onDelete,
  busyId,
}: {
  facts: KnowledgeFactItem[]
  onTest?: (fact: KnowledgeFactItem) => void
  onEdit?: (fact: KnowledgeFactItem) => void
  onArchive?: (fact: KnowledgeFactItem) => void
  onDelete?: (fact: KnowledgeFactItem) => void
  busyId?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Facts</CardTitle>
        <CardDescription>
          Short rules and truths agents can use with scope, trust, and evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {facts.map((fact) => (
          <div key={fact.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{fact.subject}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fact.truth}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <KnowledgeStatusBadge status={fact.status} />
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {fact.trustLabel}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {fact.scope.label} -{' '}
                {fact.storageType === 'board_memory'
                  ? 'workspace memory'
                  : 'knowledge page'}{' '}
                - {fact.evidenceCount} evidence link
                {fact.evidenceCount === 1 ? '' : 's'} - updated{' '}
                {formatShortDate(fact.updatedAt)}
              </span>
              <div className="flex flex-wrap gap-1">
                {onTest ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onTest(fact)}
                  >
                    Test recall
                  </Button>
                ) : null}
                {onEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(fact)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                ) : null}
                {onArchive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === fact.id}
                    onClick={() => onArchive(fact)}
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === fact.id}
                    onClick={() => onDelete(fact)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function KnowledgeDocumentList({
  documents,
  onDelete,
  deletingId,
}: {
  documents: KnowledgeDocumentItem[]
  onDelete?: (document: KnowledgeDocumentItem) => void
  deletingId?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          Indexed docs and pasted knowledge. Advanced details can show chunks
          and source policy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.map((document) => (
          <div
            key={document.id}
            className="flex items-start justify-between gap-4 rounded-xl border p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <p className="truncate font-medium text-foreground">
                  {document.title}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {document.scope.label} - {document.chunkCount} chunks -{' '}
                {document.sourceType}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {documentStatusHelp(document)}
              </p>
              {document.error ? (
                <p className="mt-1 text-xs text-destructive">
                  {document.error}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <KnowledgeStatusBadge status={document.status} />
              {onDelete ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete document"
                  disabled={deletingId === document.id}
                  onClick={() => onDelete(document)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function documentStatusHelp(document: KnowledgeDocumentItem): string {
  if (document.status === 'indexing')
    return 'Indexing now. Agents will use it after chunks and embeddings are ready.'
  if (document.status === 'failed')
    return 'Indexing failed. Delete it, fix the source content, then upload again.'
  if (document.status === 'paused')
    return 'Retrieval is paused for this document.'
  if (document.status === 'archived')
    return 'Archived documents are kept for audit but not retrieved.'
  return document.retrievalEnabled
    ? 'Ready for retrieval by agents.'
    : 'Stored, but not enabled for retrieval.'
}

export function KnowledgeSourceList({
  sources,
  onRefresh,
  onEdit,
  onArchive,
  busyId,
}: {
  sources: KnowledgeSourceItem[]
  onRefresh?: (source: KnowledgeSourceItem) => void
  onEdit?: (source: KnowledgeSourceItem) => void
  onArchive?: (source: KnowledgeSourceItem) => void
  busyId?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources</CardTitle>
        <CardDescription>
          Where knowledge came from, whether agents can use it, and when it was
          refreshed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-start justify-between gap-4 rounded-xl border p-4"
          >
            <div>
              <p className="font-medium text-foreground">{source.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {source.scope.label} - {source.type} - {source.trustLabel} -{' '}
                {source.visibility}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.federationPolicy.replace(/_/g, ' ')} -{' '}
                {source.retentionPolicy.replace(/_/g, ' ')} retention - refresh{' '}
                {source.refreshLabel} -{' '}
                {source.retrievalEnabled
                  ? 'retrieval enabled'
                  : 'retrieval disabled'}
                {source.lastRefreshAt
                  ? ` - last refresh ${formatShortDate(source.lastRefreshAt)}`
                  : ''}
                {source.nextRefreshAt
                  ? ` - next ${formatShortDate(source.nextRefreshAt)}`
                  : ''}
              </p>
              {source.error ? (
                <p className="mt-1 text-xs text-destructive">
                  {source.error} - use Refresh source after fixing the upstream
                  connector or source URL.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <KnowledgeStatusBadge status={source.status} />
              {onRefresh ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Refresh source"
                  onClick={() => onRefresh(source)}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
              {onEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit source"
                  onClick={() => onEdit(source)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
              {onArchive ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Archive source"
                  disabled={busyId === source.id}
                  onClick={() => onArchive(source)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function KnowledgeReviewQueue({
  items,
}: {
  items: KnowledgeReviewItem[]
}) {
  return (
    <Card className="overflow-hidden rounded-[28px] border-border/70 bg-card/60">
      <CardHeader className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.1),transparent_34%)]">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Brain health checkup
        </CardTitle>
        <CardDescription>
          Actionable trust issues before agents rely on stale, conflicting,
          unproven, or failed knowledge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-border/70 bg-background/45 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-card">
                  {item.severity === 'critical' ? (
                    <TriangleAlert className="h-4 w-4 text-destructive" />
                  ) : item.severity === 'warning' ? (
                    <TriangleAlert className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground capitalize">
                  {item.severity}
                </span>
                <Button size="sm" variant="ghost" className="rounded-full">
                  {item.actionLabel || 'Review'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function KnowledgeHealthyState() {
  return (
    <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(135deg,hsl(var(--card)/0.92),hsl(var(--background)/0.84))] p-6">
      <div className="max-w-2xl">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-500">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Brain health is clean.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Stale sources, missing evidence, conflicting facts, failed indexing,
          and recall gaps will appear here with a direct repair action.
        </p>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {['No stale sources', 'No failed indexing', 'No open recall gaps'].map(
          (label) => (
            <div
              key={label}
              className="rounded-2xl border border-border/70 bg-background/45 p-3 text-sm text-foreground"
            >
              <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-500" />
              {label}
            </div>
          ),
        )}
      </div>
    </section>
  )
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
