'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Archive, BarChart3, CheckCircle2, Copy, Loader2, PackageCheck, PauseCircle, PlayCircle, Plug, RefreshCw, RotateCcw, Save, Trash2, UploadCloud } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import { toast } from '@/hooks/use-toast'

interface BoardMemoryItem {
  id: string
  content: string
  category: 'insight' | 'policy' | 'alert' | 'context'
  importance: number
  source: string
}

interface KnowledgeSourceItem {
  id: string
  label: string | null
  type: string
  status: string
  visibility: string
  trustLevel: string
  federationPolicy: string
  retentionPolicy: string
  includeInRetrieval: boolean
  refreshStatus: string
}

interface KnowledgeMaintenanceItem {
  id: string
  eventType: string
  claimId?: string | null
  title: string
  summary: string
  severity: 'info' | 'warning' | 'critical'
  status: string
  metadata: Record<string, unknown>
}

interface EngineHomeCandidateItem {
  id: string
  engine: string
  homeKind: string
  homeAuthority: string
  resourceType: string
  projectionPolicy: string
  status: string
  path: string
  summary: string
}

interface ExternalKnowledgeClientItem {
  id: string
  name: string
  scopes: string[]
  projectId?: string | null
  teamId?: string | null
  expiresAt?: string | null
  lastUsedAt?: string | null
}

interface ExternalKnowledgeClientSetup {
  endpointUrl: string
  mcpEndpointUrl: string
  token: string | null
  tokenPreview: string
  allowedOperations: string[]
  mcpConfig: Record<string, unknown>
  curlExample: string
}

interface KnowledgeOpsClientProps {
  orgId: string
  boardMemories: BoardMemoryItem[]
  sources: KnowledgeSourceItem[]
  maintenanceEvents: KnowledgeMaintenanceItem[]
  engineHomeCandidates: EngineHomeCandidateItem[]
  externalClients: ExternalKnowledgeClientItem[]
}

type BusyAction =
  | 'remember'
  | 'correct'
  | 'import-preview'
  | 'import-commit'
  | `forget:${string}`
  | `source:${string}`
  | `event:${string}`
  | `candidate:${string}`
  | 'brain-ops'
  | 'eval-replay'
  | 'source-refresh'
  | 'external-client'
  | 'external-client-verify'
  | null

interface EvalReplayResponse {
  evalRunId: string | null
  summary: {
    caseCount: number
    failureCounts?: Record<string, number>
  } | null
  results?: Array<{
    status: 'passed' | 'failed' | 'warning' | 'skipped'
  }>
}

interface KnowledgeImportPreviewState {
  jobId: string
  summary: {
    itemCount: number
    previewItemCount: number
    skippedItemCount: number
    redactionCount: number
  }
}

function formatEvalReplayToast(body: EvalReplayResponse): string {
  const caseCount = body.summary?.caseCount ?? body.results?.length ?? 0
  const passed = body.results?.filter((result) => result.status === 'passed').length ?? 0
  const warnings = body.results?.filter((result) => result.status === 'warning').length ?? 0
  const failed = body.results?.filter((result) => result.status === 'failed').length ?? 0
  const runLabel = body.evalRunId ? ` Run ${body.evalRunId.slice(0, 8)} recorded.` : ''
  return `Replayed ${caseCount} retrieval eval${caseCount === 1 ? '' : 's'}: ${passed} passed, ${warnings} warning${warnings === 1 ? '' : 's'}, ${failed} failed.${runLabel}`
}

function isEvalReplayResponse(body: EvalReplayResponse | { error?: string } | null): body is EvalReplayResponse {
  return Boolean(body && 'evalRunId' in body && 'summary' in body)
}

function formatConflictIds(metadata: Record<string, unknown>): string {
  const ids = Array.isArray(metadata.conflictingClaimIds)
    ? metadata.conflictingClaimIds.filter((id): id is string => typeof id === 'string')
    : []
  return ids.length > 0 ? ids.map((id) => id.slice(0, 8)).join(', ') : 'n/a'
}

export function KnowledgeOpsClient({
  orgId,
  boardMemories,
  sources,
  maintenanceEvents,
  engineHomeCandidates,
  externalClients,
}: KnowledgeOpsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [memoryContent, setMemoryContent] = useState('')
  const [memoryCategory, setMemoryCategory] = useState<BoardMemoryItem['category']>('insight')
  const [memoryImportance, setMemoryImportance] = useState('0.75')
  const [scopeType, setScopeType] = useState<'project' | 'team'>('project')
  const [scopeId, setScopeId] = useState('')
  const [knowledgeSubject, setKnowledgeSubject] = useState('')
  const [knowledgeTruth, setKnowledgeTruth] = useState('')
  const [importSourceType, setImportSourceType] = useState('manual_upload')
  const [importScopeType, setImportScopeType] = useState<'org' | 'project' | 'team'>('org')
  const [importScopeId, setImportScopeId] = useState('')
  const [importTitle, setImportTitle] = useState('')
  const [importContent, setImportContent] = useState('')
  const [importPreview, setImportPreview] = useState<KnowledgeImportPreviewState | null>(null)
  const [externalClientName, setExternalClientName] = useState('Local agent')
  const [externalClientScopes, setExternalClientScopes] = useState<string[]>(['knowledge:read'])
  const [externalClientProjectId, setExternalClientProjectId] = useState('')
  const [externalClientSetup, setExternalClientSetup] = useState<ExternalKnowledgeClientSetup | null>(null)
  const [externalClientVerifyMessage, setExternalClientVerifyMessage] = useState<string | null>(null)

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  const runMutation = useCallback(async (
    action: Exclude<BusyAction, null>,
    request: () => Promise<Response>,
    successMessage: string,
  ) => {
    setBusyAction(action)
    try {
      const response = await request()
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Request failed with ${response.status}`)
      }
      toast.success(successMessage)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Knowledge action failed')
    } finally {
      setBusyAction(null)
    }
  }, [refresh])

  const handleRemember = useCallback(async () => {
    const content = memoryContent.trim()
    if (!content) {
      toast.error('Add something to remember first')
      return
    }
    await runMutation('remember', () => fetch(`/api/orgs/${orgId}/board-memory`, {
      method: 'POST',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({
        content,
        category: memoryCategory,
        importance: Math.max(0, Math.min(1, Number.parseFloat(memoryImportance) || 0.75)),
        source: 'operator',
      }),
    }), 'Saved to org memory')
    setMemoryContent('')
  }, [memoryCategory, memoryContent, memoryImportance, orgId, runMutation])

  const handleForget = useCallback(async (memoryId: string) => {
    await runMutation(`forget:${memoryId}`, () => fetch(`/api/orgs/${orgId}/board-memory`, {
      method: 'DELETE',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({ memoryId }),
    }), 'Removed from org memory')
  }, [orgId, runMutation])

  const handleSourcePatch = useCallback(async (
    source: KnowledgeSourceItem,
    patch: Record<string, unknown>,
    message: string,
  ) => {
    await runMutation(`source:${source.id}`, () => fetch(`/api/knowledge/sources/${source.id}`, {
      method: 'PATCH',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({ org_id: orgId, ...patch }),
    }), message)
  }, [orgId, runMutation])

  const handleRunSourceRefresh = useCallback(async () => {
    await runMutation('source-refresh', () => fetch('/api/knowledge/sources/refresh/run', {
      method: 'POST',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({ org_id: orgId }),
    }), 'Knowledge source refresh started')
  }, [orgId, runMutation])

  const handleMaintenanceStatus = useCallback(async (
    event: KnowledgeMaintenanceItem,
    status: 'acknowledged' | 'resolved' | 'dismissed',
  ) => {
    await runMutation(`event:${event.id}`, () => fetch(`/api/knowledge/maintenance/events/${event.id}`, {
      method: 'PATCH',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({ org_id: orgId, status }),
    }), `Finding ${status}`)
  }, [orgId, runMutation])

  const handleRunBrainOps = useCallback(async () => {
    await runMutation('brain-ops', () => fetch('/api/knowledge/maintenance/run', {
      method: 'POST',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({ org_id: orgId }),
    }), 'Brain Ops maintenance started')
  }, [orgId, runMutation])

  const handleReplayRetrievalEvals = useCallback(async () => {
    setBusyAction('eval-replay')
    try {
      const response = await fetch('/api/knowledge/evals/replay', {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({ org_id: orgId, limit: 50 }),
      })
      const body = await response.json().catch(() => null) as EvalReplayResponse | { error?: string } | null
      if (!response.ok) {
        throw new Error(body && 'error' in body && body.error ? body.error : `Request failed with ${response.status}`)
      }
      const replayBody = isEvalReplayResponse(body)
        ? body
        : { evalRunId: null, summary: null, results: [] }
      toast.success(formatEvalReplayToast(replayBody))
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Knowledge eval replay failed')
    } finally {
      setBusyAction(null)
    }
  }, [orgId, refresh])

  const handleCandidateAction = useCallback(async (
    candidate: EngineHomeCandidateItem,
    action: 'promote' | 'reject' | 'ignore',
  ) => {
    await runMutation(`candidate:${candidate.id}`, () => fetch(`/api/knowledge/engine-home/candidates/${candidate.id}`, {
      method: 'PATCH',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({
        org_id: orgId,
        action,
        note: `Mission Control ${action} action`,
      }),
    }), `Engine-home candidate ${action === 'ignore' ? 'ignored' : `${action}d`}`)
  }, [orgId, runMutation])

  const handleCorrectKnowledge = useCallback(async () => {
    const trimmedScopeId = scopeId.trim()
    const subject = knowledgeSubject.trim()
    const truth = knowledgeTruth.trim()
    if (!trimmedScopeId || !subject || !truth) {
      toast.error('Scope id, subject, and corrected truth are required')
      return
    }
    await runMutation('correct', () => fetch('/api/knowledge/pages', {
      method: 'POST',
      headers: buildClientMutationHeaders(),
      body: JSON.stringify({
        org_id: orgId,
        scope_type: scopeType,
        project_id: scopeType === 'project' ? trimmedScopeId : null,
        team_id: scopeType === 'team' ? trimmedScopeId : null,
        subject,
        compiled_truth: truth,
        event_type: 'corrected',
        event_summary: 'Operator corrected knowledge from Mission Control.',
        confidence: 0.95,
        source: {
          type: 'manual',
          label: 'Mission Control correction',
          visibility: scopeType,
          trust_level: 'operator_approved',
          federation_policy: 'source_scoped',
          retention_policy: 'audit',
        },
        evidence: [{ kind: 'approval', label: 'Mission Control operator correction' }],
      }),
    }), 'Knowledge correction saved')
    setKnowledgeSubject('')
    setKnowledgeTruth('')
  }, [knowledgeSubject, knowledgeTruth, orgId, runMutation, scopeId, scopeType])

  const handlePreviewImport = useCallback(async () => {
    const content = importContent.trim()
    const title = importTitle.trim()
    const scopeId = importScopeId.trim()
    if (!content) {
      toast.error('Paste transcript, artifact, notes, or doc content first')
      return
    }
    if (importScopeType !== 'org' && !scopeId) {
      toast.error(`Add a ${importScopeType} id before previewing this import`)
      return
    }

    setBusyAction('import-preview')
    try {
      const createResponse = await fetch('/api/knowledge/imports', {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: orgId,
          project_id: importScopeType === 'project' ? scopeId : null,
          team_id: importScopeType === 'team' ? scopeId : null,
          source_type: importSourceType,
          mode: 'preview',
          status: 'queued',
          metadata: {
            ui_surface: 'mission_control_knowledge',
            title: title || undefined,
          },
        }),
      })
      const createBody = await createResponse.json().catch(() => null) as { job?: { id?: string } ; error?: string } | null
      if (!createResponse.ok || !createBody?.job?.id) {
        throw new Error(createBody?.error ?? `Create failed with ${createResponse.status}`)
      }

      const previewResponse = await fetch(`/api/knowledge/imports/${createBody.job.id}/preview`, {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: orgId,
          raw_text: content,
          metadata: {
            ui_surface: 'mission_control_knowledge',
            title: title || undefined,
          },
        }),
      })
      const previewBody = await previewResponse.json().catch(() => null) as {
        summary?: KnowledgeImportPreviewState['summary']
        error?: string
      } | null
      if (!previewResponse.ok || !previewBody?.summary) {
        throw new Error(previewBody?.error ?? `Preview failed with ${previewResponse.status}`)
      }

      setImportPreview({ jobId: createBody.job.id, summary: previewBody.summary })
      toast.success(`Preview ready: ${previewBody.summary.previewItemCount} item${previewBody.summary.previewItemCount === 1 ? '' : 's'}, ${previewBody.summary.redactionCount} redaction${previewBody.summary.redactionCount === 1 ? '' : 's'}`)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import preview failed')
    } finally {
      setBusyAction(null)
    }
  }, [importContent, importScopeId, importScopeType, importSourceType, importTitle, orgId, refresh])

  const handleCommitImport = useCallback(async () => {
    if (!importPreview) {
      toast.error('Preview an import before committing it')
      return
    }

    setBusyAction('import-commit')
    try {
      const response = await fetch(`/api/knowledge/imports/${importPreview.jobId}/commit`, {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({ org_id: orgId, target: 'claims' }),
      })
      const body = await response.json().catch(() => null) as {
        summary?: { committed: number; failed: number; skipped: number }
        error?: string
      } | null
      if (!response.ok || !body?.summary) {
        throw new Error(body?.error ?? `Commit failed with ${response.status}`)
      }
      toast.success(`Import committed: ${body.summary.committed} claim${body.summary.committed === 1 ? '' : 's'}, ${body.summary.failed} failed, ${body.summary.skipped} skipped`)
      setImportPreview(null)
      setImportContent('')
      setImportTitle('')
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import commit failed')
    } finally {
      setBusyAction(null)
    }
  }, [importPreview, orgId, refresh])

  const handleCreateExternalClient = useCallback(async () => {
    const name = externalClientName.trim()
    if (!name) {
      toast.error('Name this local agent client first')
      return
    }
    if (externalClientScopes.length === 0) {
      toast.error('Choose at least one scope')
      return
    }

    setBusyAction('external-client')
    setExternalClientVerifyMessage(null)
    try {
      const response = await fetch('/api/knowledge/external-clients', {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: orgId,
          project_id: externalClientProjectId.trim() || null,
          name,
          scopes: externalClientScopes,
          metadata: {
            ui_surface: 'mission_control_knowledge',
            client_kind: 'local_agent',
          },
        }),
      })
      const body = await response.json().catch(() => null) as {
        setup?: ExternalKnowledgeClientSetup
        error?: string
      } | null
      if (!response.ok || !body?.setup) {
        throw new Error(body?.error ?? `Client creation failed with ${response.status}`)
      }
      setExternalClientSetup(body.setup)
      toast.success('Scoped local-agent client created')
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'External client creation failed')
    } finally {
      setBusyAction(null)
    }
  }, [externalClientName, externalClientProjectId, externalClientScopes, orgId, refresh])

  const handleVerifyExternalClient = useCallback(async () => {
    if (!externalClientSetup?.token) {
      toast.error('Create a client first; the token is only shown once.')
      return
    }
    setBusyAction('external-client-verify')
    setExternalClientVerifyMessage(null)
    try {
      const response = await fetch('/api/knowledge/external/operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${externalClientSetup.token}`,
        },
        body: JSON.stringify({
          operation: 'knowledge.retrieve_context',
          input: {
            query: 'connection smoke test',
          },
        }),
      })
      const body = await response.json().catch(() => null) as {
        ok?: boolean
        requestId?: string
        error?: { message?: string }
      } | null
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? `Verify failed with ${response.status}`)
      }
      setExternalClientVerifyMessage(`Verified. Request ${body.requestId ?? 'recorded'} is audited.`)
      toast.success('Local-agent Knowledge connection verified')
      refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'External client verification failed'
      setExternalClientVerifyMessage(message)
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }, [externalClientSetup, refresh])

  const toggleExternalClientScope = useCallback((scope: string) => {
    setExternalClientScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    )
  }, [])

  const isBusy = (action: BusyAction) => busyAction === action

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Manual Memory Controls</CardTitle>
          <CardDescription>
            Remember org-level context, forget obsolete board memory, and correct scoped project or team knowledge with provenance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_140px_120px]">
              <div className="md:col-span-3">
                <Label htmlFor="memory-content">Remember this for the organization</Label>
                <Textarea
                  id="memory-content"
                  value={memoryContent}
                  onChange={(event) => setMemoryContent(event.target.value)}
                  placeholder="Example: Enterprise customers prefer weekly proof summaries before Friday release reviews."
                  className="mt-2 min-h-24"
                />
              </div>
              <div>
                <Label htmlFor="memory-category">Label</Label>
                <select
                  id="memory-category"
                  value={memoryCategory}
                  onChange={(event) => setMemoryCategory(event.target.value as BoardMemoryItem['category'])}
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="insight">Insight</option>
                  <option value="policy">Org policy</option>
                  <option value="alert">Alert</option>
                  <option value="context">Context</option>
                </select>
              </div>
              <div>
                <Label htmlFor="memory-importance">Importance</Label>
                <Input
                  id="memory-importance"
                  value={memoryImportance}
                  onChange={(event) => setMemoryImportance(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.75"
                  className="mt-2"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={() => { void handleRemember() }} disabled={busyAction === 'remember'}>
                  {busyAction === 'remember' ? <Loader2 className="animate-spin" /> : <Save />}
                  Remember
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="grid gap-3 md:grid-cols-[130px_1fr]">
              <div>
                <Label htmlFor="knowledge-scope">Scope</Label>
                <select
                  id="knowledge-scope"
                  value={scopeType}
                  onChange={(event) => setScopeType(event.target.value as 'project' | 'team')}
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="project">Project</option>
                  <option value="team">Team</option>
                </select>
              </div>
              <div>
                <Label htmlFor="knowledge-scope-id">{scopeType === 'project' ? 'Project id' : 'Team id'}</Label>
                <Input
                  id="knowledge-scope-id"
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  placeholder="UUID"
                  className="mt-2"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="knowledge-subject">Subject to correct or promote</Label>
                <Input
                  id="knowledge-subject"
                  value={knowledgeSubject}
                  onChange={(event) => setKnowledgeSubject(event.target.value)}
                  placeholder="Release process, ICP, Pricing rule, Handoff..."
                  className="mt-2"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="knowledge-truth">Corrected truth</Label>
                <Textarea
                  id="knowledge-truth"
                  value={knowledgeTruth}
                  onChange={(event) => setKnowledgeTruth(event.target.value)}
                  placeholder="Write the current operator-approved truth. Lucid stores it as a corrected version with audit evidence."
                  className="mt-2 min-h-28"
                />
              </div>
              <div className="md:col-span-2">
                <Button type="button" variant="secondary" onClick={() => { void handleCorrectKnowledge() }} disabled={busyAction === 'correct'}>
                  {busyAction === 'correct' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Correct knowledge
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Import transcript or artifact</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preview first: Lucid parses, dedupes, and redacts secrets before commit.
                </p>
              </div>
              <PackageCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_120px_1fr]">
              <div>
                <Label htmlFor="knowledge-import-source">Source</Label>
                <select
                  id="knowledge-import-source"
                  value={importSourceType}
                  onChange={(event) => setImportSourceType(event.target.value)}
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="manual_upload">Manual upload</option>
                  <option value="channel_transcript">Channel transcript</option>
                  <option value="browser_artifact">Browser artifact</option>
                  <option value="meeting_notes">Meeting notes</option>
                  <option value="repo_docs">Repo docs</option>
                  <option value="codex_session">Codex session</option>
                  <option value="claude_code_session">Claude Code session</option>
                  <option value="cursor_export">Cursor export</option>
                </select>
              </div>
              <div>
                <Label htmlFor="knowledge-import-scope">Scope</Label>
                <select
                  id="knowledge-import-scope"
                  value={importScopeType}
                  onChange={(event) => setImportScopeType(event.target.value as 'org' | 'project' | 'team')}
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="org">Org</option>
                  <option value="project">Project</option>
                  <option value="team">Team</option>
                </select>
              </div>
              <div>
                <Label htmlFor="knowledge-import-scope-id">
                  {importScopeType === 'org' ? 'Scope id not needed' : `${importScopeType === 'project' ? 'Project' : 'Team'} id`}
                </Label>
                <Input
                  id="knowledge-import-scope-id"
                  value={importScopeId}
                  onChange={(event) => setImportScopeId(event.target.value)}
                  placeholder={importScopeType === 'org' ? 'Org import' : 'UUID'}
                  disabled={importScopeType === 'org'}
                  className="mt-2"
                />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="knowledge-import-title">Title</Label>
                <Input
                  id="knowledge-import-title"
                  value={importTitle}
                  onChange={(event) => setImportTitle(event.target.value)}
                  placeholder="Q2 customer call, PR review session, launch QA artifact..."
                  className="mt-2"
                />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="knowledge-import-content">Content to import</Label>
                <Textarea
                  id="knowledge-import-content"
                  value={importContent}
                  onChange={(event) => setImportContent(event.target.value)}
                  placeholder="Paste transcript, notes, artifact text, or coding-agent session output. Secrets are redacted in preview before commit."
                  className="mt-2 min-h-32"
                />
              </div>
              {importPreview ? (
                <div className="md:col-span-3 rounded-lg border bg-muted/25 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{importPreview.summary.previewItemCount} preview</Badge>
                    <Badge variant="outline">{importPreview.summary.skippedItemCount} skipped</Badge>
                    <Badge variant={importPreview.summary.redactionCount > 0 ? 'secondary' : 'outline'}>
                      {importPreview.summary.redactionCount} redactions
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Commit writes redacted import items as evidence-backed Knowledge claims. Raw pasted content is not stored as the claim source.
                  </p>
                </div>
              ) : null}
              <div className="md:col-span-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => { void handlePreviewImport() }} disabled={busyAction === 'import-preview' || busyAction === 'import-commit'}>
                  {busyAction === 'import-preview' ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                  Preview import
                </Button>
                <Button type="button" onClick={() => { void handleCommitImport() }} disabled={!importPreview || busyAction === 'import-preview' || busyAction === 'import-commit'}>
                  {busyAction === 'import-commit' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Commit as claims
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Org memory</h3>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
            {boardMemories.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No org board memory yet. Add the first durable policy, alert, or cross-project insight above.
              </p>
            ) : (
              boardMemories.map((memory) => (
                <div key={memory.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{memory.category}</Badge>
                        <span className="text-[11px] text-muted-foreground">importance {memory.importance.toFixed(2)}</span>
                        <span className="text-[11px] text-muted-foreground">source {memory.source}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{memory.content}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Forget memory"
                      onClick={() => { void handleForget(memory.id) }}
                      disabled={isBusy(`forget:${memory.id}`)}
                    >
                      {isBusy(`forget:${memory.id}`) ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Connect a Local Agent</CardTitle>
                <CardDescription>
                  Issue a scoped token and MCP/HTTP setup config for BYO, C2A, or local coding agents. Tokens are shown once and every call is audited.
                </CardDescription>
              </div>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <Label htmlFor="external-client-name">Client name</Label>
                <Input
                  id="external-client-name"
                  value={externalClientName}
                  onChange={(event) => setExternalClientName(event.target.value)}
                  className="mt-2"
                  placeholder="Quentin laptop, OpenClaw local, Hermes worker..."
                />
              </div>
              <div>
                <Label htmlFor="external-client-project">Optional project id binding</Label>
                <Input
                  id="external-client-project"
                  value={externalClientProjectId}
                  onChange={(event) => setExternalClientProjectId(event.target.value)}
                  className="mt-2"
                  placeholder="Leave empty for org-scoped access"
                />
              </div>
              <div>
                <Label>Scopes</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[
                    'knowledge:read',
                    'knowledge:claims',
                    'knowledge:sources',
                    'knowledge:write',
                    'knowledge:governance',
                    'agent_ops:launch',
                  ].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={externalClientScopes.includes(scope)}
                        onChange={() => toggleExternalClientScope(scope)}
                      />
                      <span>{scope}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button type="button" onClick={() => { void handleCreateExternalClient() }} disabled={busyAction === 'external-client'}>
                {busyAction === 'external-client' ? <Loader2 className="animate-spin" /> : <Plug />}
                Create scoped client
              </Button>
            </div>

            {externalClientSetup ? (
              <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Token shown once</Badge>
                  <Badge variant="outline">{externalClientSetup.allowedOperations.length} operations</Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Bearer token</p>
                  <code className="mt-1 block overflow-auto rounded-md bg-background p-2 text-[11px]">
                    {externalClientSetup.token ?? externalClientSetup.tokenPreview}
                  </code>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">MCP config</p>
                  <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-background p-2 text-[11px]">
                    {JSON.stringify(externalClientSetup.mcpConfig, null, 2)}
                  </pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => { void navigator.clipboard.writeText(JSON.stringify(externalClientSetup.mcpConfig, null, 2)); toast.success('MCP config copied') }}
                  >
                    <Copy />
                    Copy config
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => { void handleVerifyExternalClient() }}
                    disabled={busyAction === 'external-client-verify'}
                  >
                    {busyAction === 'external-client-verify' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Verify connection
                  </Button>
                </div>
                {externalClientVerifyMessage ? (
                  <p className="text-xs text-muted-foreground">{externalClientVerifyMessage}</p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active clients</p>
              {externalClients.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  No active external clients yet.
                </p>
              ) : externalClients.map((client) => (
                <div key={client.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{client.name}</Badge>
                    <Badge variant="outline">{client.scopes.length} scope{client.scopes.length === 1 ? '' : 's'}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{client.scopes.join(', ')}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {client.projectId ? `project ${client.projectId}` : 'org scoped'} · {client.lastUsedAt ? `last used ${client.lastUsedAt}` : 'never used'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Source Governance</CardTitle>
                <CardDescription>
                  Decide which sources can influence retrieval and which ones need pausing, archiving, or refresh.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction === 'source-refresh'}
                onClick={() => { void handleRunSourceRefresh() }}
              >
                {busyAction === 'source-refresh' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Refresh due
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No knowledge sources have been registered yet.</p>
            ) : (
              sources.map((source) => (
                <div key={source.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{source.label ?? source.type}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{source.type}</Badge>
                        <Badge variant={source.includeInRetrieval ? 'secondary' : 'outline'}>
                          {source.includeInRetrieval ? 'retrieval on' : 'retrieval off'}
                        </Badge>
                        <Badge variant="outline">{source.status}</Badge>
                        <Badge variant="outline">{source.trustLevel.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {source.visibility} · {source.federationPolicy.replace(/_/g, ' ')} · {source.retentionPolicy.replace(/_/g, ' ')} · refresh {source.refreshStatus}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={source.includeInRetrieval ? 'Disable retrieval' : 'Enable retrieval'}
                        disabled={isBusy(`source:${source.id}`)}
                        onClick={() => {
                          void handleSourcePatch(
                            source,
                            { include_in_retrieval: !source.includeInRetrieval },
                            source.includeInRetrieval ? 'Source removed from retrieval' : 'Source added to retrieval',
                          )
                        }}
                      >
                        {isBusy(`source:${source.id}`) ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Pause source"
                        disabled={isBusy(`source:${source.id}`)}
                        onClick={() => {
                          void handleSourcePatch(source, { status: source.status === 'paused' ? 'active' : 'paused' }, source.status === 'paused' ? 'Source active' : 'Source paused')
                        }}
                      >
                        <PauseCircle />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Archive source"
                        disabled={isBusy(`source:${source.id}`)}
                        onClick={() => { void handleSourcePatch(source, { status: 'archived' }, 'Source archived') }}
                      >
                        <Archive />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Brain Ops Findings</CardTitle>
                <CardDescription>
                  Maintenance work that needs operator review before the brain is consolidated or corrected.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction === 'brain-ops'}
                onClick={() => { void handleRunBrainOps() }}
              >
                {busyAction === 'brain-ops' ? <Loader2 className="animate-spin" /> : <PlayCircle />}
                Run now
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {maintenanceEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open Brain Ops findings. The knowledge graph is quiet.</p>
            ) : (
              maintenanceEvents.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={event.severity === 'critical' ? 'destructive' : 'outline'}>{event.severity}</Badge>
                        <Badge variant="outline">{event.status}</Badge>
                        <Badge variant={event.eventType === 'claim_conflict' ? 'secondary' : 'outline'}>
                          {event.eventType.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{event.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{event.summary}</p>
                      {event.eventType === 'claim_conflict' ? (
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          anchor {event.claimId?.slice(0, 8) ?? 'n/a'} · conflicts {formatConflictIds(event.metadata)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      {(['acknowledged', 'resolved', 'dismissed'] as const).map((status) => (
                        <Button
                          key={status}
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isBusy(`event:${event.id}`)}
                          onClick={() => { void handleMaintenanceStatus(event, status) }}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Retrieval Eval Replay</CardTitle>
                <CardDescription>
                  Re-run active retrieval eval cases against the shared Knowledge recall path.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction === 'eval-replay'}
                onClick={() => { void handleReplayRetrievalEvals() }}
              >
                {busyAction === 'eval-replay' ? <Loader2 className="animate-spin" /> : <BarChart3 />}
                Replay now
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Replay records precision, recall, citation accuracy, top-result stability, latency, and failure classes through `/api/knowledge/evals/replay`. The UI only launches and reports the run; scoring stays centralized in the Knowledge service.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memory Candidates</CardTitle>
            <CardDescription>
              Review memory, profile, and local-skill summaries before they become managed knowledge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {engineHomeCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engine-home candidates are waiting for review.</p>
            ) : (
              engineHomeCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">
                          {candidate.engine === 'hermes' ? 'Engine memory' : candidate.engine === 'openclaw' ? 'Evaluation memory' : 'Memory candidate'}
                        </Badge>
                        <Badge variant="outline">{candidate.resourceType.replace(/_/g, ' ')}</Badge>
                        <Badge variant="outline">{candidate.projectionPolicy.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{candidate.path}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.summary}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {candidate.homeKind.replace(/_/g, ' ')} · {candidate.homeAuthority.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isBusy(`candidate:${candidate.id}`)}
                        onClick={() => { void handleCandidateAction(candidate, 'promote') }}
                      >
                        Promote
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isBusy(`candidate:${candidate.id}`)}
                        onClick={() => { void handleCandidateAction(candidate, 'reject') }}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={isBusy(`candidate:${candidate.id}`)}
                        onClick={() => { void handleCandidateAction(candidate, 'ignore') }}
                      >
                        Ignore
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
