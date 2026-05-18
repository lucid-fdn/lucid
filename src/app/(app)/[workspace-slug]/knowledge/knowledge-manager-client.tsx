'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { PageHeader, PageShell, PageTabs } from '@/components/page'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { KnowledgeBrainOverview } from '@/components/knowledge/knowledge-brain-overview'
import { KnowledgeBaseWorkspace } from '@/components/knowledge/knowledge-base-workspace'
import { KnowledgeHealthyState, KnowledgeReviewQueue } from '@/components/knowledge/knowledge-lists'
import { KnowledgeRecallTester } from '@/components/knowledge/knowledge-recall-tester'
import { SharedOperatingContextManager } from '@/components/operating-context/shared-operating-context-manager'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import type {
  KnowledgeBaseSection,
  KnowledgeDocumentItem,
  KnowledgeFactItem,
  KnowledgeManagerData,
  KnowledgeManagerTab,
  KnowledgeSourceItem,
} from '@/features/knowledge-manager/types'

const TABS: Array<{ id: KnowledgeManagerTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'context', label: 'Context' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'health', label: 'Health' },
]

const LEGACY_TAB_TO_SECTION: Partial<Record<string, KnowledgeBaseSection>> = {
  facts: 'facts',
  documents: 'documents',
  sources: 'sources',
}

export function KnowledgeManagerClient({
  data,
  workspaceSlug,
}: {
  data: KnowledgeManagerData
  workspaceSlug: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initial = parseInitialState(searchParams?.get('tab') ?? null, searchParams?.get('section') ?? null)
  const [tab, setTab] = useState<KnowledgeManagerTab>(initial.tab)
  const [knowledgeSection, setKnowledgeSection] = useState<KnowledgeBaseSection>(initial.section)
  const [showFactEditor, setShowFactEditor] = useState(false)
  const [showDocumentUploader, setShowDocumentUploader] = useState(false)
  const [showSourceEditor, setShowSourceEditor] = useState(false)
  const [editingFact, setEditingFact] = useState<KnowledgeFactItem | null>(null)
  const [editingSource, setEditingSource] = useState<KnowledgeSourceItem | null>(null)
  const [recallQuery, setRecallQuery] = useState('')
  const [showRecallTester, setShowRecallTester] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [busyFactId, setBusyFactId] = useState<string | null>(null)
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const projectScope = data.scopes.find((scope) => scope.type === 'project')
  const projectId = projectScope?.type === 'project' ? projectScope.projectId : null
  const contextEndpoint = `/api/workspaces/${data.overview.orgId}/context`

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 't' || event.key === 'T') {
        openRecallTester()
      }
      if (event.key === 'n' || event.key === 'N') {
        openFactEditor(null)
      }
      if (event.key === 'Escape') {
        setShowFactEditor(false)
        setShowDocumentUploader(false)
        setShowSourceEditor(false)
        setEditingFact(null)
        setEditingSource(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function replaceUrl(nextTab: KnowledgeManagerTab, section = knowledgeSection) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', nextTab)
    if (nextTab === 'knowledge') {
      params.set('section', section)
    } else {
      params.delete('section')
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  function selectTab(nextTab: KnowledgeManagerTab) {
    if (nextTab === 'knowledge') {
      setKnowledgeSection('all')
      setTab('knowledge')
      replaceUrl('knowledge', 'all')
      return
    }
    setTab(nextTab)
    replaceUrl(nextTab)
  }

  function selectKnowledgeSection(section: KnowledgeBaseSection) {
    setKnowledgeSection(section)
    setTab('knowledge')
    replaceUrl('knowledge', section)
  }

  function openRecallTester(query?: string) {
    if (query) setRecallQuery(query)
    setShowRecallTester(true)
  }

  function openFactEditor(fact: KnowledgeFactItem | null) {
    setEditingFact(fact)
    setShowFactEditor(true)
    selectKnowledgeSection('facts')
  }

  function openDocumentUploader() {
    setShowDocumentUploader(true)
    selectKnowledgeSection('documents')
  }

  function openSourceEditor(source: KnowledgeSourceItem | null) {
    setEditingSource(source)
    setShowSourceEditor(true)
    selectKnowledgeSection('sources')
  }

  async function deleteDocument(document: KnowledgeDocumentItem) {
    setDeletingDocumentId(document.id)
    try {
      const response = await fetch(`/api/knowledge/documents/${document.id}`, {
        method: 'DELETE',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({ org_id: data.overview.orgId }),
      })
      if (!response.ok) throw new Error('Delete failed')
      router.refresh()
    } finally {
      setDeletingDocumentId(null)
    }
  }

  async function mutateFact(fact: KnowledgeFactItem, mode: 'archive' | 'delete') {
    setBusyFactId(fact.id)
    try {
      const response = await fetch(`/api/knowledge/facts/${fact.id}`, {
        method: mode === 'delete' ? 'DELETE' : 'PATCH',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: data.overview.orgId,
          storage_type: fact.storageType,
          archive: mode === 'archive',
        }),
      })
      if (!response.ok) throw new Error(`${mode} failed`)
      router.refresh()
    } finally {
      setBusyFactId(null)
    }
  }

  async function archiveSource(source: KnowledgeSourceItem) {
    setBusySourceId(source.id)
    try {
      const response = await fetch(`/api/knowledge/sources/${source.id}`, {
        method: 'PATCH',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: data.overview.orgId,
          status: 'archived',
          include_in_retrieval: false,
        }),
      })
      if (!response.ok) throw new Error('Archive source failed')
      router.refresh()
    } finally {
      setBusySourceId(null)
    }
  }

  async function refreshSource(source: KnowledgeSourceItem) {
    setBusySourceId(source.id)
    try {
      const response = await fetch(`/api/knowledge/sources/${source.id}/refresh`, {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: data.overview.orgId,
          status: 'pending',
        }),
      })
      if (!response.ok) throw new Error('Refresh source failed')
      router.refresh()
    } finally {
      setBusySourceId(null)
    }
  }

  return (
    <PageShell contentClassName="gap-6 px-6 py-6">
      <PageHeader
        className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_36%),linear-gradient(135deg,hsl(var(--card)/0.96),hsl(var(--background)/0.9))] px-6 py-5 shadow-sm"
        eyebrow={<span className="text-sm font-medium text-primary">Workspace Brain</span>}
        title="What agents know, believe, obey, cite, and recall."
        description="Manage context and knowledge from one canonical surface. Mission Control stays reserved for advanced maintenance, provenance, and evals."
      >
        <PageTabs
          value={tab}
          onValueChange={selectTab}
          options={TABS.map((item) => ({ value: item.id, label: item.label }))}
          className="mt-4 w-fit max-w-full"
        />
      </PageHeader>

      <main className="flex w-full flex-col gap-6">
        {tab === 'overview' ? (
          <KnowledgeBrainOverview
            overview={data.overview}
            workspaceSlug={workspaceSlug}
            workspaceId={data.overview.orgId}
            onOpenContext={() => selectTab('context')}
            onOpenKnowledge={() => selectTab('knowledge')}
            onOpenHealth={() => selectTab('health')}
            onRecall={openRecallTester}
          />
        ) : null}

        {tab === 'context' ? (
          <SharedOperatingContextManager
            title="Operating context"
            description="Set the durable guidance, updates, memory, and risks agents inherit before they act."
            workspaceId={data.overview.orgId}
            scopeType="workspace"
            scopeId={data.overview.orgId}
            endpoint={contextEndpoint}
          />
        ) : null}

        {tab === 'knowledge' ? (
          <KnowledgeBaseWorkspace
            data={data}
            section={knowledgeSection}
            onSectionChange={selectKnowledgeSection}
            showFactEditor={showFactEditor}
            showDocumentUploader={showDocumentUploader}
            showSourceEditor={showSourceEditor}
            editingFact={editingFact}
            editingSource={editingSource}
            deletingDocumentId={deletingDocumentId}
            busyFactId={busyFactId}
            busySourceId={busySourceId}
            onShowFactEditor={openFactEditor}
            onShowDocumentUploader={openDocumentUploader}
            onShowSourceEditor={openSourceEditor}
            onFactSaved={(query) => {
              setShowFactEditor(false)
              setEditingFact(null)
              if (query) {
                setRecallQuery(query)
                setShowRecallTester(true)
              }
              router.refresh()
            }}
            onDocumentUploaded={() => {
              setShowDocumentUploader(false)
              router.refresh()
            }}
            onSourceSaved={() => {
              setShowSourceEditor(false)
              setEditingSource(null)
              router.refresh()
            }}
            onTestFact={(fact) => {
              openRecallTester(`What should agents know about ${fact.subject}?`)
            }}
            onArchiveFact={(fact) => { void mutateFact(fact, 'archive') }}
            onDeleteFact={(fact) => { void mutateFact(fact, 'delete') }}
            onDeleteDocument={(document) => { void deleteDocument(document) }}
            onRefreshSource={(source) => { void refreshSource(source) }}
            onArchiveSource={(source) => { void archiveSource(source) }}
          />
        ) : null}

        {tab === 'health' ? (
          data.reviewItems.length ? <KnowledgeReviewQueue items={data.reviewItems} /> : <KnowledgeHealthyState />
        ) : null}
      </main>

      <Sheet open={showRecallTester} onOpenChange={setShowRecallTester}>
        <SheetContent className="w-[min(560px,calc(100vw-24px))] overflow-hidden border-border/70 bg-background/95 p-0 sm:max-w-[560px]">
          <SheetHeader className="border-b border-border/70 px-5 py-4">
            <SheetTitle>Recall test</SheetTitle>
            <SheetDescription>
              Validate what agents retrieve before they answer.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <KnowledgeRecallTester orgId={data.overview.orgId} projectId={projectId} initialQuery={recallQuery} />
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  )
}

function parseInitialState(
  tabValue: string | null,
  sectionValue: string | null,
): { tab: KnowledgeManagerTab; section: KnowledgeBaseSection } {
  const legacySection = tabValue ? LEGACY_TAB_TO_SECTION[tabValue] : undefined
  if (legacySection) {
    return { tab: 'knowledge', section: legacySection }
  }

  const section = isKnowledgeBaseSection(sectionValue) ? sectionValue : 'all'
  const tab = tabValue === 'test'
    ? 'overview'
    : tabValue === 'review'
      ? 'health'
    : tabValue === 'sources'
      ? 'knowledge'
    : TABS.some((item) => item.id === tabValue) ? (tabValue as KnowledgeManagerTab) : 'overview'
  return { tab, section }
}

function isKnowledgeBaseSection(value: string | null): value is KnowledgeBaseSection {
  return value === 'all' || value === 'facts' || value === 'documents' || value === 'sources'
}
