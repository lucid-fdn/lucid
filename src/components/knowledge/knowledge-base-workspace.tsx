'use client'

import { BookOpen, Database, FileText, Layers3, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KnowledgeDocumentUploader } from '@/components/knowledge/knowledge-document-uploader'
import { KnowledgeEmptyState } from '@/components/knowledge/knowledge-empty-states'
import { KnowledgeFactEditor } from '@/components/knowledge/knowledge-fact-editor'
import { KnowledgeSourceEditor } from '@/components/knowledge/knowledge-source-editor'
import {
  KnowledgeDocumentList,
  KnowledgeFactList,
  KnowledgeSourceList,
} from '@/components/knowledge/knowledge-lists'
import type {
  KnowledgeBaseSection,
  KnowledgeDocumentItem,
  KnowledgeFactItem,
  KnowledgeManagerData,
  KnowledgeSourceItem,
} from '@/features/knowledge-manager/types'
import { cn } from '@/lib/utils'

interface KnowledgeBaseWorkspaceProps {
  data: KnowledgeManagerData
  section: KnowledgeBaseSection
  onSectionChange: (section: KnowledgeBaseSection) => void
  showFactEditor: boolean
  showDocumentUploader: boolean
  showSourceEditor: boolean
  editingFact: KnowledgeFactItem | null
  editingSource: KnowledgeSourceItem | null
  deletingDocumentId: string | null
  busyFactId: string | null
  busySourceId: string | null
  onShowFactEditor: (fact: KnowledgeFactItem | null) => void
  onShowDocumentUploader: () => void
  onShowSourceEditor: (source: KnowledgeSourceItem | null) => void
  onFactSaved: (query?: string) => void
  onDocumentUploaded: () => void
  onSourceSaved: () => void
  onTestFact: (fact: KnowledgeFactItem) => void
  onArchiveFact: (fact: KnowledgeFactItem) => void
  onDeleteFact: (fact: KnowledgeFactItem) => void
  onDeleteDocument: (document: KnowledgeDocumentItem) => void
  onRefreshSource: (source: KnowledgeSourceItem) => void
  onArchiveSource: (source: KnowledgeSourceItem) => void
}

const SECTIONS: Array<{
  id: KnowledgeBaseSection
  label: string
  description: string
  icon: typeof Database
}> = [
  {
    id: 'all',
    label: 'All',
    description: 'Unified library view across facts, documents, and sources.',
    icon: Layers3,
  },
  {
    id: 'facts',
    label: 'Facts',
    description: 'Short, scoped truths agents can cite and obey.',
    icon: BookOpen,
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Docs, FAQs, specs, playbooks, and uploaded references.',
    icon: FileText,
  },
  {
    id: 'sources',
    label: 'Sources',
    description: 'Trust, provenance, refresh policy, and retrieval eligibility.',
    icon: Database,
  },
]

export function KnowledgeBaseWorkspace({
  data,
  section,
  onSectionChange,
  showFactEditor,
  showDocumentUploader,
  showSourceEditor,
  editingFact,
  editingSource,
  deletingDocumentId,
  busyFactId,
  busySourceId,
  onShowFactEditor,
  onShowDocumentUploader,
  onShowSourceEditor,
  onFactSaved,
  onDocumentUploaded,
  onSourceSaved,
  onTestFact,
  onArchiveFact,
  onDeleteFact,
  onDeleteDocument,
  onRefreshSource,
  onArchiveSource,
}: KnowledgeBaseWorkspaceProps) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-border/70 bg-card/55">
        <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Knowledge base</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage what agents can retrieve and cite. Facts and documents are the usable knowledge; sources show origin, trust, sync, and retrieval eligibility.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => { onShowDocumentUploader(); onSectionChange('documents') }}>
              <Upload className="h-4 w-4" />
              Upload document
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => { onShowSourceEditor(null); onSectionChange('sources') }}>
              <Database className="h-4 w-4" />
              Add source
            </Button>
            <Button className="rounded-full" onClick={() => { onShowFactEditor(null); onSectionChange('facts') }}>
              <Plus className="h-4 w-4" />
              Add fact
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-3">
          {SECTIONS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
                  section === item.id
                    ? 'border-primary/30 bg-primary/10 text-foreground'
                    : 'border-border/70 bg-background/45 text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </section>

      {section === 'all' ? (
        <KnowledgeAllLens
          facts={data.facts}
          documents={data.documents}
          sources={data.sources}
          onOpenFacts={() => onSectionChange('facts')}
          onOpenDocuments={() => onSectionChange('documents')}
          onOpenSources={() => onSectionChange('sources')}
        />
      ) : null}

      {section === 'facts' ? (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            {showFactEditor ? (
              <KnowledgeFactEditor
                key={editingFact?.id ?? 'new-fact'}
                orgId={data.overview.orgId}
                scopes={data.scopes}
                initialFact={editingFact}
                onSaved={onFactSaved}
              />
            ) : (
              <KnowledgeEmptyState
                title="Add a fact"
                description="Facts are short rules your agents should remember, like pricing rules, support policies, or escalation instructions."
                actionLabel="Add fact"
                onAction={() => onShowFactEditor(null)}
              />
            )}
          </div>
          {data.facts.length ? (
            <KnowledgeFactList
              facts={data.facts}
              onTest={onTestFact}
              onEdit={onShowFactEditor}
              onArchive={onArchiveFact}
              onDelete={onDeleteFact}
              busyId={busyFactId}
            />
          ) : (
            <KnowledgeEmptyState title="No facts yet" description="Add your first company fact so agents can cite it during conversations." />
          )}
        </div>
      ) : null}

      {section === 'documents' ? (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div>
            {showDocumentUploader ? (
              <KnowledgeDocumentUploader
                orgId={data.overview.orgId}
                scopes={data.scopes}
                onUploaded={onDocumentUploaded}
              />
            ) : (
              <KnowledgeEmptyState
                title="Upload a document"
                description="Upload docs, FAQs, specs, or playbooks so agents can cite them."
                actionLabel="Upload document"
                onAction={onShowDocumentUploader}
              />
            )}
          </div>
          {data.documents.length ? (
            <KnowledgeDocumentList
              documents={data.documents}
              deletingId={deletingDocumentId}
              onDelete={onDeleteDocument}
            />
          ) : (
            <KnowledgeEmptyState title="No documents indexed yet" description="Documents become searchable context for agents after indexing." />
          )}
        </div>
      ) : null}

      {section === 'sources' ? (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div>
            {showSourceEditor ? (
              <KnowledgeSourceEditor
                key={editingSource?.id ?? 'new-source'}
                orgId={data.overview.orgId}
                scopes={data.scopes}
                initialSource={editingSource}
                onSaved={onSourceSaved}
              />
            ) : (
              <KnowledgeEmptyState
                title="Add a source"
                description="Sources tell Lucid where knowledge came from, how trustworthy it is, and whether agents may retrieve it."
                actionLabel="Add source"
                onAction={() => onShowSourceEditor(null)}
              />
            )}
          </div>
          {data.sources.length ? (
            <KnowledgeSourceList
              sources={data.sources}
              onRefresh={onRefreshSource}
              onEdit={onShowSourceEditor}
              onArchive={onArchiveSource}
              busyId={busySourceId}
            />
          ) : (
            <KnowledgeEmptyState title="No sources yet" description="Add a source to govern trust, provenance, refresh policy, and retrieval eligibility." />
          )}
        </div>
      ) : null}
    </div>
  )
}

function KnowledgeAllLens({
  facts,
  documents,
  sources,
  onOpenFacts,
  onOpenDocuments,
  onOpenSources,
}: {
  facts: KnowledgeFactItem[]
  documents: KnowledgeDocumentItem[]
  sources: KnowledgeSourceItem[]
  onOpenFacts: () => void
  onOpenDocuments: () => void
  onOpenSources: () => void
}) {
  const cards = [
    {
      title: 'Facts',
      count: facts.length,
      detail: 'Approved truths and rules agents can cite.',
      icon: BookOpen,
      action: onOpenFacts,
    },
    {
      title: 'Documents',
      count: documents.length,
      detail: 'Indexed references, playbooks, specs, and FAQs.',
      icon: FileText,
      action: onOpenDocuments,
    },
    {
      title: 'Sources',
      count: sources.length,
      detail: 'Origin, trust, refresh, and retrieval controls.',
      icon: Database,
      action: onOpenSources,
    },
  ]
  const recentFacts = facts.slice(0, 2)
  const recentDocuments = documents.slice(0, 2)
  const recentSources = sources.slice(0, 2)

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="grid gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.title}
              type="button"
              className="rounded-3xl border border-border/70 bg-card/55 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/75 hover:shadow-sm"
              onClick={card.action}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                  {card.count}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">{card.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.detail}</p>
            </button>
          )
        })}
      </div>

      <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent Brain material</h3>
            <p className="mt-1 text-xs text-muted-foreground">One library, filtered by type when you need precision.</p>
          </div>
          <Layers3 className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-4 space-y-2">
          {[...recentFacts.map((item) => ({
            id: `fact-${item.id}`,
            label: item.subject,
            detail: item.truth,
            type: 'Fact',
          })), ...recentDocuments.map((item) => ({
            id: `document-${item.id}`,
            label: item.title,
            detail: `${item.chunkCount} chunks · ${item.status}`,
            type: 'Document',
          })), ...recentSources.map((item) => ({
            id: `source-${item.id}`,
            label: item.label,
            detail: `${item.type} · ${item.status} · ${item.retrievalEnabled ? 'retrievable' : 'not retrievable'}`,
            type: 'Source',
          }))].map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/60 bg-background/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.label}</p>
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{item.type}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
          {facts.length + documents.length + sources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
              Add context, facts, documents, or sources to build the first shared Brain layer.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
