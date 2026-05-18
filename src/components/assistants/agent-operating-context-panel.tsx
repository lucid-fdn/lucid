'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Brain,
  FileText,
  Fingerprint,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
} from 'lucide-react'
import type {
  AgentIdentityDocument,
  AgentIdentityDocumentStatus,
  AgentIdentityDocumentType,
  AgentIdentityPackage,
} from '@contracts/agent-identity'
import type {
  ResolvedSharedContext,
  SharedContextRecord,
  SharedContextRecordType,
} from '@contracts/shared-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PanelDetailBlock, PanelEmptyState, PanelInfoRow, PanelLayout, PanelStateCard } from '@/components/panels/panel-layout'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type ViewMode = 'overview' | 'identity' | 'context' | 'heartbeat'

type AgentHeartbeat = {
  id: string
  status: string
  focus: string | null
  health: Record<string, unknown>
  next_check_in_at: string | null
  context_record_id: string | null
  created_at: string
}

const IDENTITY_TYPES: AgentIdentityDocumentType[] = [
  'SOUL',
  'USER',
  'HEARTBEAT',
  'MEMORY_POLICY',
  'ACCESS_POLICY',
  'TOOL_POLICY',
  'CURRENT_CONTEXT',
]

const IDENTITY_STATUSES: AgentIdentityDocumentStatus[] = ['draft', 'active', 'superseded', 'archived']

const CONTEXT_TYPES: SharedContextRecordType[] = [
  'thesis',
  'signal',
  'feedback',
  'daily_intel',
  'memory',
  'decision',
  'policy',
  'risk',
  'open_question',
]

const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'identity', label: 'Identity' },
  { value: 'context', label: 'Context' },
  { value: 'heartbeat', label: 'Heartbeat' },
]

interface AgentOperatingContextPanelProps {
  assistantId: string
  assistantName: string
}

export function AgentOperatingContextPanel({ assistantId, assistantName }: AgentOperatingContextPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingIdentity, setIsSavingIdentity] = useState(false)
  const [isSavingContext, setIsSavingContext] = useState(false)
  const [isSavingHeartbeat, setIsSavingHeartbeat] = useState(false)
  const [documents, setDocuments] = useState<AgentIdentityDocument[]>([])
  const [identityPackage, setIdentityPackage] = useState<AgentIdentityPackage | null>(null)
  const [resolvedContext, setResolvedContext] = useState<ResolvedSharedContext | null>(null)
  const [heartbeats, setHeartbeats] = useState<AgentHeartbeat[]>([])

  const [documentType, setDocumentType] = useState<AgentIdentityDocumentType>('CURRENT_CONTEXT')
  const [documentStatus, setDocumentStatus] = useState<AgentIdentityDocumentStatus>('active')
  const [documentContent, setDocumentContent] = useState('{\n  "summary": ""\n}')

  const [contextType, setContextType] = useState<SharedContextRecordType>('thesis')
  const [contextTitle, setContextTitle] = useState('')
  const [contextBody, setContextBody] = useState('')
  const [contextConfidence, setContextConfidence] = useState('0.8')
  const [editingContextRecordId, setEditingContextRecordId] = useState<string | null>(null)
  const [busyContextRecordId, setBusyContextRecordId] = useState<string | null>(null)

  const [heartbeatStatus, setHeartbeatStatus] = useState('active')
  const [heartbeatFocus, setHeartbeatFocus] = useState('')
  const [heartbeatHealth, setHeartbeatHealth] = useState('{\n  "readiness": "normal"\n}')
  const [nextHeartbeatAt, setNextHeartbeatAt] = useState('')

  const activeDocuments = useMemo(
    () => documents.filter((document) => document.status === 'active'),
    [documents],
  )
  const latestHeartbeat = heartbeats[0] ?? null
  const activeRecords = resolvedContext?.records.filter((record) => record.status === 'active') ?? []
  const inheritedPolicyKeys = Object.keys(resolvedContext?.inherited_policy ?? {})

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const [identityResponse, contextResponse, heartbeatResponse] = await Promise.all([
        fetch(`/api/assistants/${assistantId}/identity`, { cache: 'no-store' }),
        fetch(`/api/assistants/${assistantId}/context?resolve=true`, { cache: 'no-store' }),
        fetch(`/api/assistants/${assistantId}/heartbeat`, { cache: 'no-store' }),
      ])

      if (!identityResponse.ok || !contextResponse.ok || !heartbeatResponse.ok) {
        throw new Error('Failed to load operating context')
      }

      const identityJson = await identityResponse.json() as {
        documents?: AgentIdentityDocument[]
        identityPackage?: AgentIdentityPackage
      }
      const contextJson = await contextResponse.json() as { context?: ResolvedSharedContext }
      const heartbeatJson = await heartbeatResponse.json() as { heartbeats?: AgentHeartbeat[] }

      setDocuments(identityJson.documents ?? [])
      setIdentityPackage(identityJson.identityPackage ?? null)
      setResolvedContext(contextJson.context ?? null)
      setHeartbeats(heartbeatJson.heartbeats ?? [])
    } catch {
      toast.error('Could not load operating context')
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  useEffect(() => {
    void reload()
  }, [reload])

  const csrfHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf').catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    return csrfToken ? { 'x-csrf-token': csrfToken } : {}
  }, [])

  const createIdentityDocument = useCallback(async () => {
    setIsSavingIdentity(true)
    try {
      let content: Record<string, unknown>
      try {
        const parsed = JSON.parse(documentContent) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Identity content must be a JSON object')
        }
        content = parsed as Record<string, unknown>
      } catch {
        toast.error('Identity content must be valid JSON')
        return
      }

      const headers = await csrfHeaders()
      const response = await fetch(`/api/assistants/${assistantId}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          document_type: documentType,
          status: documentStatus,
          content,
        }),
      })

      if (!response.ok) throw new Error('Failed to create identity document')
      toast.success('Identity document saved')
      setDocumentContent('{\n  "summary": ""\n}')
      await reload()
    } catch {
      toast.error('Could not save identity document')
    } finally {
      setIsSavingIdentity(false)
    }
  }, [assistantId, csrfHeaders, documentContent, documentStatus, documentType, reload])

  const createContextRecord = useCallback(async () => {
    if (!contextTitle.trim() || !contextBody.trim()) {
      toast.error('Context title and body are required')
      return
    }

    setIsSavingContext(true)
    try {
      const parsedConfidence = contextConfidence.trim()
        ? Number(contextConfidence)
        : null
      if (parsedConfidence !== null && (!Number.isFinite(parsedConfidence) || parsedConfidence < 0 || parsedConfidence > 1)) {
        toast.error('Confidence must be between 0 and 1')
        return
      }

      const headers = await csrfHeaders()
      const response = await fetch(
        editingContextRecordId
          ? `/api/assistants/${assistantId}/context/${editingContextRecordId}`
          : `/api/assistants/${assistantId}/context`,
        {
        method: editingContextRecordId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(editingContextRecordId ? {
          record_type: contextType,
          title: contextTitle.trim(),
          body: contextBody.trim(),
          confidence: parsedConfidence,
        } : {
          record_type: contextType,
          title: contextTitle.trim(),
          body: contextBody.trim(),
          confidence: parsedConfidence,
          metadata: { created_from: 'assistant_operating_context_panel' },
        }),
      })

      if (!response.ok) throw new Error('Failed to create context record')
      toast.success(editingContextRecordId ? 'Context record updated' : 'Context record saved')
      setEditingContextRecordId(null)
      setContextTitle('')
      setContextBody('')
      await reload()
    } catch {
      toast.error('Could not save context record')
    } finally {
      setIsSavingContext(false)
    }
  }, [assistantId, contextBody, contextConfidence, contextTitle, contextType, csrfHeaders, editingContextRecordId, reload])

  const editContextRecord = useCallback((record: SharedContextRecord) => {
    setEditingContextRecordId(record.id)
    setContextType(record.record_type)
    setContextTitle(record.title)
    setContextBody(record.body)
    setContextConfidence(record.confidence == null ? '' : String(record.confidence))
  }, [])

  const clearContextEditor = useCallback(() => {
    setEditingContextRecordId(null)
    setContextTitle('')
    setContextBody('')
    setContextConfidence('0.8')
  }, [])

  const archiveContextRecord = useCallback(async (record: SharedContextRecord) => {
    setBusyContextRecordId(record.id)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(`/api/assistants/${assistantId}/context/${record.id}`, {
        method: 'DELETE',
        headers,
      })
      if (!response.ok) throw new Error('Failed to archive context record')
      if (editingContextRecordId === record.id) clearContextEditor()
      toast.success('Context record archived')
      await reload()
    } catch {
      toast.error('Could not archive context record')
    } finally {
      setBusyContextRecordId(null)
    }
  }, [assistantId, clearContextEditor, csrfHeaders, editingContextRecordId, reload])

  const createHeartbeat = useCallback(async () => {
    setIsSavingHeartbeat(true)
    try {
      let health: Record<string, unknown>
      try {
        const parsed = JSON.parse(heartbeatHealth) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Health must be a JSON object')
        }
        health = parsed as Record<string, unknown>
      } catch {
        toast.error('Heartbeat health must be valid JSON')
        return
      }

      const headers = await csrfHeaders()
      const response = await fetch(`/api/assistants/${assistantId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          status: heartbeatStatus.trim() || 'active',
          focus: heartbeatFocus.trim() || null,
          health,
          next_heartbeat_at: nextHeartbeatAt ? new Date(nextHeartbeatAt).toISOString() : null,
        }),
      })

      if (!response.ok) throw new Error('Failed to create heartbeat')
      toast.success('Heartbeat recorded')
      setHeartbeatFocus('')
      await reload()
    } catch {
      toast.error('Could not record heartbeat')
    } finally {
      setIsSavingHeartbeat(false)
    }
  }, [assistantId, csrfHeaders, heartbeatFocus, heartbeatHealth, heartbeatStatus, nextHeartbeatAt, reload])

  const stateSubtitle = isLoading
    ? 'Loading identity and context'
    : `${activeDocuments.length} active docs · ${activeRecords.length} context records · ${heartbeats.length} heartbeats`

  return (
    <PanelLayout
      context="Agent-only identity documents plus inherited workspace, project, team, and agent context."
      state={(
        <PanelStateCard
          icon={<Fingerprint className="h-4 w-4 text-cyan-400" />}
          title={assistantName || 'Agent operating context'}
          subtitle={stateSubtitle}
          status={(
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void reload()}
              disabled={isLoading}
              aria-label="Refresh operating context"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          )}
        >
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Identity" value={`${activeDocuments.length}/${documents.length}`} />
            <Metric label="Context" value={String(activeRecords.length)} />
            <Metric label="Policy" value={String(inheritedPolicyKeys.length)} />
            <Metric label="Heartbeat" value={latestHeartbeat?.status ?? 'none'} />
          </div>
        </PanelStateCard>
      )}
    >
      <div className="flex rounded-md border border-border/60 bg-muted/20 p-0.5">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors',
              viewMode === mode.value && 'bg-background text-foreground shadow-sm',
            )}
            onClick={() => setViewMode(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {viewMode === 'overview' ? (
        <OverviewView
          documents={documents}
          identityPackage={identityPackage}
          resolvedContext={resolvedContext}
          latestHeartbeat={latestHeartbeat}
        />
      ) : null}

      {viewMode === 'identity' ? (
        <IdentityView
          documents={documents}
          documentType={documentType}
          documentStatus={documentStatus}
          documentContent={documentContent}
          isSaving={isSavingIdentity}
          onDocumentTypeChange={setDocumentType}
          onDocumentStatusChange={setDocumentStatus}
          onDocumentContentChange={setDocumentContent}
          onCreate={() => void createIdentityDocument()}
        />
      ) : null}

      {viewMode === 'context' ? (
        <ContextView
          records={activeRecords}
          resolvedContext={resolvedContext}
          contextType={contextType}
          contextTitle={contextTitle}
          contextBody={contextBody}
          contextConfidence={contextConfidence}
          isSaving={isSavingContext}
          editingRecordId={editingContextRecordId}
          busyRecordId={busyContextRecordId}
          assistantId={assistantId}
          onContextTypeChange={setContextType}
          onContextTitleChange={setContextTitle}
          onContextBodyChange={setContextBody}
          onContextConfidenceChange={setContextConfidence}
          onCreate={() => void createContextRecord()}
          onCancelEdit={clearContextEditor}
          onEditRecord={editContextRecord}
          onArchiveRecord={(record) => void archiveContextRecord(record)}
        />
      ) : null}

      {viewMode === 'heartbeat' ? (
        <HeartbeatView
          heartbeats={heartbeats}
          heartbeatStatus={heartbeatStatus}
          heartbeatFocus={heartbeatFocus}
          heartbeatHealth={heartbeatHealth}
          nextHeartbeatAt={nextHeartbeatAt}
          isSaving={isSavingHeartbeat}
          onHeartbeatStatusChange={setHeartbeatStatus}
          onHeartbeatFocusChange={setHeartbeatFocus}
          onHeartbeatHealthChange={setHeartbeatHealth}
          onNextHeartbeatAtChange={setNextHeartbeatAt}
          onCreate={() => void createHeartbeat()}
        />
      ) : null}
    </PanelLayout>
  )
}

function OverviewView({
  documents,
  identityPackage,
  resolvedContext,
  latestHeartbeat,
}: {
  documents: AgentIdentityDocument[]
  identityPackage: AgentIdentityPackage | null
  resolvedContext: ResolvedSharedContext | null
  latestHeartbeat: AgentHeartbeat | null
}) {
  const activeTypes = new Set(documents.filter((document) => document.status === 'active').map((document) => document.document_type))
  const web3Identity = identityPackage?.web3Identity

  return (
    <div className="space-y-3">
      <PanelDetailBlock>
        <div className="flex flex-wrap gap-1.5">
          {IDENTITY_TYPES.map((type) => (
            <Badge
              key={type}
              variant="outline"
              className={cn(
                'h-5 border-border text-[9px] text-muted-foreground',
                activeTypes.has(type) && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
              )}
            >
              {formatIdentityType(type)}
            </Badge>
          ))}
        </div>
      </PanelDetailBlock>

      <PanelDetailBlock>
        <PanelInfoRow label="Resolved scopes" value={resolvedContext?.scopes.map((scope) => scope.scope_type).join(' → ') || 'none'} />
        <PanelInfoRow label="Prompt sections" value={identityPackage?.compiledPromptSections.length ?? 0} />
        <PanelInfoRow label="Web3 identity" value={web3Identity ? web3Identity.passportId ?? web3Identity.walletAddress ?? 'anchored' : 'optional'} />
        <PanelInfoRow label="Latest heartbeat" value={latestHeartbeat ? `${latestHeartbeat.status} · ${formatDate(latestHeartbeat.created_at)}` : 'none'} />
      </PanelDetailBlock>

      <MergedPolicyPreview resolvedContext={resolvedContext} />

      <RecordsList
        records={(resolvedContext?.records ?? []).slice(0, 6)}
        emptyTitle="No resolved context"
        emptyDescription="Workspace, project, team, and agent records will appear here once present."
      />
    </div>
  )
}

function IdentityView({
  documents,
  documentType,
  documentStatus,
  documentContent,
  isSaving,
  onDocumentTypeChange,
  onDocumentStatusChange,
  onDocumentContentChange,
  onCreate,
}: {
  documents: AgentIdentityDocument[]
  documentType: AgentIdentityDocumentType
  documentStatus: AgentIdentityDocumentStatus
  documentContent: string
  isSaving: boolean
  onDocumentTypeChange: (value: AgentIdentityDocumentType) => void
  onDocumentStatusChange: (value: AgentIdentityDocumentStatus) => void
  onDocumentContentChange: (value: string) => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-3">
      <PanelDetailBlock>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Document</Label>
            <Select value={documentType} onValueChange={(value) => onDocumentTypeChange(value as AgentIdentityDocumentType)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDENTITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{formatIdentityType(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
            <Select value={documentStatus} onValueChange={(value) => onDocumentStatusChange(value as AgentIdentityDocumentStatus)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDENTITY_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Content JSON</Label>
          <Textarea
            value={documentContent}
            onChange={(event) => onDocumentContentChange(event.target.value)}
            rows={7}
            className="font-mono text-xs"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" className="h-8 text-xs" disabled={isSaving} onClick={onCreate}>
            {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
            Save document
          </Button>
        </div>
      </PanelDetailBlock>

      {documents.length === 0 ? (
        <PanelEmptyState
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          title="No identity documents"
          description="SOUL, USER, HEARTBEAT, policy, and current context docs will appear here."
        />
      ) : (
        <ScrollArea className="max-h-[360px]">
          <div className="space-y-2 pr-2">
            {documents.map((document) => (
              <PanelDetailBlock key={document.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{formatIdentityType(document.document_type)}</p>
                    <p className="text-[10px] text-muted-foreground">v{document.version} · {formatDate(document.updated_at)}</p>
                  </div>
                  <Badge className={cn('h-5 text-[9px]', getStatusBadgeClass(document.status))}>{document.status}</Badge>
                </div>
                <pre className="mt-2 max-h-24 overflow-hidden rounded border border-border/60 bg-muted/20 p-2 text-[10px] text-muted-foreground">
                  {JSON.stringify(document.content, null, 2)}
                </pre>
              </PanelDetailBlock>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function ContextView({
  records,
  resolvedContext,
  contextType,
  contextTitle,
  contextBody,
  contextConfidence,
  isSaving,
  editingRecordId,
  busyRecordId,
  assistantId,
  onContextTypeChange,
  onContextTitleChange,
  onContextBodyChange,
  onContextConfidenceChange,
  onCreate,
  onCancelEdit,
  onEditRecord,
  onArchiveRecord,
}: {
  records: SharedContextRecord[]
  resolvedContext: ResolvedSharedContext | null
  contextType: SharedContextRecordType
  contextTitle: string
  contextBody: string
  contextConfidence: string
  isSaving: boolean
  editingRecordId: string | null
  busyRecordId: string | null
  assistantId: string
  onContextTypeChange: (value: SharedContextRecordType) => void
  onContextTitleChange: (value: string) => void
  onContextBodyChange: (value: string) => void
  onContextConfidenceChange: (value: string) => void
  onCreate: () => void
  onCancelEdit: () => void
  onEditRecord: (record: SharedContextRecord) => void
  onArchiveRecord: (record: SharedContextRecord) => void
}) {
  return (
    <div className="space-y-3">
      <PanelDetailBlock>
        <div className="grid gap-2 sm:grid-cols-[1fr_92px]">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Record type</Label>
            <Select value={contextType} onValueChange={(value) => onContextTypeChange(value as SharedContextRecordType)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTEXT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{formatContextType(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Confidence</Label>
            <Input
              value={contextConfidence}
              onChange={(event) => onContextConfidenceChange(event.target.value)}
              className="h-8 text-xs"
              inputMode="decimal"
            />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Title</Label>
          <Input
            value={contextTitle}
            onChange={(event) => onContextTitleChange(event.target.value)}
            className="h-8 text-xs"
            placeholder="Operating thesis, signal, decision, or policy"
          />
        </div>
        <div className="mt-2 space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Body</Label>
          <Textarea value={contextBody} onChange={(event) => onContextBodyChange(event.target.value)} rows={4} className="text-xs" />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground">
          <span>{resolvedContext?.scopes.length ?? 0} scopes resolved</span>
          <div className="flex items-center gap-2">
            {editingRecordId ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={isSaving} onClick={onCancelEdit}>
                Cancel
              </Button>
            ) : null}
            <Button type="button" size="sm" className="h-8 text-xs" disabled={isSaving} onClick={onCreate}>
              {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              {editingRecordId ? 'Update record' : 'Add record'}
            </Button>
          </div>
        </div>
      </PanelDetailBlock>

      <RecordsList
        records={records}
        emptyTitle="No context records"
        emptyDescription="Thesis, signals, feedback, Daily Intel, decisions, policies, risks, and questions will appear here."
        editableScope={{ scopeType: 'agent', scopeId: assistantId }}
        busyRecordId={busyRecordId}
        onEditRecord={onEditRecord}
        onArchiveRecord={onArchiveRecord}
      />
    </div>
  )
}

function HeartbeatView({
  heartbeats,
  heartbeatStatus,
  heartbeatFocus,
  heartbeatHealth,
  nextHeartbeatAt,
  isSaving,
  onHeartbeatStatusChange,
  onHeartbeatFocusChange,
  onHeartbeatHealthChange,
  onNextHeartbeatAtChange,
  onCreate,
}: {
  heartbeats: AgentHeartbeat[]
  heartbeatStatus: string
  heartbeatFocus: string
  heartbeatHealth: string
  nextHeartbeatAt: string
  isSaving: boolean
  onHeartbeatStatusChange: (value: string) => void
  onHeartbeatFocusChange: (value: string) => void
  onHeartbeatHealthChange: (value: string) => void
  onNextHeartbeatAtChange: (value: string) => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-3">
      <PanelDetailBlock>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
            <Input value={heartbeatStatus} onChange={(event) => onHeartbeatStatusChange(event.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Next heartbeat</Label>
            <Input
              type="datetime-local"
              value={nextHeartbeatAt}
              onChange={(event) => onNextHeartbeatAtChange(event.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Focus</Label>
          <Textarea value={heartbeatFocus} onChange={(event) => onHeartbeatFocusChange(event.target.value)} rows={3} className="text-xs" />
        </div>
        <div className="mt-2 space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Health JSON</Label>
          <Textarea value={heartbeatHealth} onChange={(event) => onHeartbeatHealthChange(event.target.value)} rows={4} className="font-mono text-xs" />
        </div>
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" className="h-8 text-xs" disabled={isSaving} onClick={onCreate}>
            {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Activity className="mr-1 h-3 w-3" />}
            Record heartbeat
          </Button>
        </div>
      </PanelDetailBlock>

      {heartbeats.length === 0 ? (
        <PanelEmptyState
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          title="No heartbeats"
          description="Agent operating state and cadence records will appear here."
        />
      ) : (
        <ScrollArea className="max-h-[360px]">
          <div className="space-y-2 pr-2">
            {heartbeats.map((heartbeat) => (
              <PanelDetailBlock key={heartbeat.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{heartbeat.status}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDate(heartbeat.created_at)}</p>
                  </div>
                  {heartbeat.context_record_id ? (
                    <Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/10 text-[9px] text-emerald-300">
                      Context
                    </Badge>
                  ) : null}
                </div>
                {heartbeat.focus ? <p className="mt-2 text-[11px] text-muted-foreground">{heartbeat.focus}</p> : null}
                <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                  <span>Next: {heartbeat.next_check_in_at ? formatDate(heartbeat.next_check_in_at) : 'none'}</span>
                  <span>Health: {Object.keys(heartbeat.health ?? {}).length} keys</span>
                </div>
              </PanelDetailBlock>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function MergedPolicyPreview({ resolvedContext }: { resolvedContext: ResolvedSharedContext | null }) {
  const policyEntries = Object.entries(resolvedContext?.inherited_policy ?? {})
  const conflicts = resolvedContext?.policy_conflicts ?? []

  return (
    <PanelDetailBlock>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Shield className="h-3.5 w-3.5 text-emerald-300" />
          Merged policy
        </div>
        <Badge variant={conflicts.length > 0 ? 'outline' : 'secondary'} className="h-5 text-[9px]">
          {conflicts.length > 0 ? `${conflicts.length} override${conflicts.length === 1 ? '' : 's'}` : 'clean'}
        </Badge>
      </div>
      {policyEntries.length > 0 ? (
        <div className="mt-2 space-y-1">
          {policyEntries.slice(0, 5).map(([key, value]) => (
            <div key={key} className="grid gap-1 rounded border border-border/60 bg-background/40 px-2 py-1.5 text-[10px] sm:grid-cols-[104px_1fr]">
              <span className="font-medium text-emerald-300">{key}</span>
              <span className="truncate text-muted-foreground">{formatPolicyValue(value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded border border-dashed border-border/60 p-2 text-[11px] text-muted-foreground">
          No inherited policy records.
        </p>
      )}
      {conflicts.length > 0 ? (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/[0.06] p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-200">
            <AlertTriangle className="h-3 w-3" />
            Override warnings
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {conflicts.slice(0, 5).map((conflict) => (
              <Badge key={conflict.key} variant="outline" className="h-5 border-amber-500/25 text-[9px] text-amber-200">
                {conflict.key}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </PanelDetailBlock>
  )
}

function RecordsList({
  records,
  emptyTitle,
  emptyDescription,
  editableScope,
  busyRecordId,
  onEditRecord,
  onArchiveRecord,
}: {
  records: SharedContextRecord[]
  emptyTitle: string
  emptyDescription: string
  editableScope?: { scopeType: SharedContextRecord['scope_type']; scopeId: string }
  busyRecordId?: string | null
  onEditRecord?: (record: SharedContextRecord) => void
  onArchiveRecord?: (record: SharedContextRecord) => void
}) {
  if (records.length === 0) {
    return (
      <PanelEmptyState
        icon={<Brain className="h-4 w-4 text-muted-foreground" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <ScrollArea className="max-h-[360px]">
      <div className="space-y-2 pr-2">
        {records.map((record) => {
          const editable = Boolean(
            editableScope &&
            record.scope_type === editableScope.scopeType &&
            record.scope_id === editableScope.scopeId &&
            onEditRecord &&
            onArchiveRecord,
          )
          return (
            <PanelDetailBlock key={record.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="h-5 border-border text-[9px] text-muted-foreground">
                      {formatContextType(record.record_type)}
                    </Badge>
                    <Badge variant="outline" className="h-5 border-border text-[9px] text-muted-foreground">
                      {editable ? 'local' : record.scope_type}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground">{record.title}</p>
                </div>
                {record.confidence !== null ? (
                  <Badge className="h-5 bg-blue-500/10 text-[9px] text-blue-300">{Math.round(record.confidence * 100)}%</Badge>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-muted-foreground">{record.body}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">{formatDate(record.updated_at)}</p>
                {editable ? (
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="xs" className="h-6 px-2 text-[10px]" onClick={() => onEditRecord?.(record)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                      disabled={busyRecordId === record.id}
                      onClick={() => onArchiveRecord?.(record)}
                    >
                      {busyRecordId === record.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Archive'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </PanelDetailBlock>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}

function formatIdentityType(type: AgentIdentityDocumentType) {
  return type
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

function formatContextType(type: SharedContextRecordType) {
  return type
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1))
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

function formatPolicyValue(value: unknown): string {
  if (value === null || value === undefined) return 'unset'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return 'policy value'
  }
}

function getStatusBadgeClass(status: AgentIdentityDocumentStatus) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-300'
    case 'draft':
      return 'bg-blue-500/10 text-blue-300'
    case 'superseded':
      return 'bg-amber-500/10 text-amber-300'
    case 'archived':
      return 'bg-muted text-muted-foreground'
    default:
      return 'bg-muted text-muted-foreground'
  }
}
