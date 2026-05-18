import { EmptyState } from '@/components/page'
import { Button } from '@/components/ui/button'

export function KnowledgeFirstRun({
  onAddFact,
  onAddDocument,
  onTestRecall,
}: {
  onAddFact: () => void
  onAddDocument: () => void
  onTestRecall: () => void
}) {
  return (
    <section className="rounded-3xl border bg-gradient-to-br from-card via-card to-muted/40 p-8 shadow-sm">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Knowledge setup</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Teach your agents what your company knows
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Add a fact, upload a document, or import a URL. Then test what agents
          will recall before they answer.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onAddFact}>Add knowledge</Button>
          <Button variant="outline" onClick={onTestRecall}>
            Test recall
          </Button>
        </div>
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={onAddFact}
          className="rounded-2xl border bg-background/70 p-4 text-left transition hover:border-primary/50 hover:bg-background"
        >
          <p className="font-medium text-foreground">Add a fact</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Best for policies, pricing rules, support instructions, and handoff
            notes.
          </p>
        </button>
        <button
          type="button"
          onClick={onAddDocument}
          className="rounded-2xl border bg-background/70 p-4 text-left transition hover:border-primary/50 hover:bg-background"
        >
          <p className="font-medium text-foreground">Upload a document</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Best for docs, FAQs, playbooks, and specs.
          </p>
        </button>
        <button
          type="button"
          onClick={onAddDocument}
          className="rounded-2xl border bg-background/70 p-4 text-left transition hover:border-primary/50 hover:bg-background"
        >
          <p className="font-medium text-foreground">Import a URL</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Best for public docs, help centers, and pages that change over time.
          </p>
        </button>
      </div>
    </section>
  )
}

export function KnowledgeEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      className="min-h-0 p-8"
      action={
        actionLabel && onAction ? (
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null
      }
    />
  )
}
