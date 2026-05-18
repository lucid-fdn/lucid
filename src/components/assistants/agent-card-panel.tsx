'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Download, FileJson, FolderKanban, History, Keyboard, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, Upload } from 'lucide-react'
import type { AgentIdentityDocument } from '@contracts/agent-identity'
import type { AgentCard, LucidCardImportPreview, LucidCardResolution, LucidCardValidationReport } from '@contracts/lucid-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useRegisterCommands } from '@/components/command-palette'
import { PanelDetailBlock, PanelEmptyState, PanelInfoRow, PanelLayout, PanelStateCard } from '@/components/panels/panel-layout'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface AgentCardPanelProps {
  assistantId: string
}

interface AgentCardState {
  card: AgentCard
  resolution: LucidCardResolution
  scope: { workspace_id: string; project_id: string | null }
  source: 'lucid'
}

interface ContextCardDraft {
  mission: string
  voice: string
  style: string
  guardrails: string
  policyJson: string
  risks: string
  openQuestions: string
}

function contextCardDraft(): ContextCardDraft {
  return { mission: '', voice: '', style: '', guardrails: '', policyJson: '{}', risks: '', openQuestions: '' }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function statusClass(status?: LucidCardValidationReport['status']) {
  if (status === 'fail') return 'bg-red-500/15 text-red-400'
  if (status === 'warning') return 'bg-amber-500/15 text-amber-400'
  return 'bg-emerald-500/15 text-emerald-400'
}

function listToText(values: string[] | undefined): string {
  return (values ?? []).join('\n')
}

function textToList(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function parseJsonRecord(value: string, label: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`)
  return parsed as Record<string, unknown>
}

function safeJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    return parseJsonRecord(value, 'Policy')
  } catch {
    return undefined
  }
}

function isAgentCardShape(value: unknown): value is AgentCard {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as { kind?: unknown }).kind === 'agent_card')
}

export function AgentCardPanel({ assistantId }: AgentCardPanelProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [state, setState] = useState<AgentCardState | null>(null)
  const [cardDraft, setCardDraft] = useState<AgentCard | null>(null)
  const [cardJson, setCardJson] = useState('')
  const [preview, setPreview] = useState<(LucidCardImportPreview & { warnings?: string[]; applied?: boolean }) | null>(null)
  const [promptPreview, setPromptPreview] = useState<string[]>([])
  const [identityDocuments, setIdentityDocuments] = useState<AgentIdentityDocument[]>([])
  const [createKnowledgeSnippets, setCreateKnowledgeSnippets] = useState(false)
  const [organizationDraft, setOrganizationDraft] = useState<ContextCardDraft>(() => contextCardDraft())
  const [projectDraft, setProjectDraft] = useState<ContextCardDraft>(() => contextCardDraft())

  const csrfHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf').catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    return csrfToken ? { 'x-csrf-token': csrfToken } : {}
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const [cardResponse, identityResponse] = await Promise.all([
        fetch(`/api/assistants/${assistantId}/agent-card`, { cache: 'no-store' }),
        fetch(`/api/assistants/${assistantId}/identity`, { cache: 'no-store' }),
      ])
      if (!cardResponse.ok || !identityResponse.ok) throw new Error('Failed to load Agent Card')
      const json = await cardResponse.json() as AgentCardState
      const identity = await identityResponse.json() as { documents?: AgentIdentityDocument[] }
      setState(json)
      setCardDraft(json.card)
      setCardJson(formatJson(json.card))
      setPreview(null)
      setPromptPreview([])
      setIdentityDocuments(identity.documents ?? [])
    } catch {
      toast.error('Could not load Agent Card')
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  useEffect(() => {
    void reload()
  }, [reload])

  const parsedCard = useMemo(() => {
    try {
      return JSON.parse(cardJson) as unknown
    } catch {
      return null
    }
  }, [cardJson])

  const formCard = useMemo(() => isAgentCardShape(parsedCard) ? parsedCard : cardDraft, [cardDraft, parsedCard])

  const updateDraft = useCallback((updater: (card: AgentCard) => AgentCard) => {
    if (!formCard) return
    const next = updater(formCard)
    setCardDraft(next)
    setCardJson(formatJson(next))
    setPreview(null)
  }, [formCard])

  const previewImport = useCallback(async (apply: boolean) => {
    if (!parsedCard) {
      toast.error('Agent Card JSON is invalid')
      return
    }
    setIsBusy(true)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(`/api/assistants/${assistantId}/agent-card/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ card: parsedCard, apply, options: { updateAssistantProfile: true, createKnowledgeSnippets } }),
      })
      if (!response.ok) throw new Error('Agent Card request failed')
      const json = await response.json() as LucidCardImportPreview & { warnings?: string[]; applied?: boolean }
      setPreview(json)
      toast.success(apply ? 'Agent Card applied' : 'Agent Card preview ready')
      if (apply && json.applied) await reload()
    } catch {
      toast.error(apply ? 'Could not apply Agent Card' : 'Could not preview Agent Card')
    } finally {
      setIsBusy(false)
    }
  }, [assistantId, createKnowledgeSnippets, csrfHeaders, parsedCard, reload])

  const previewPrompt = useCallback(async () => {
    if (!parsedCard) {
      toast.error('Agent Card JSON is invalid')
      return
    }
    setIsBusy(true)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(`/api/assistants/${assistantId}/agent-card/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ card: parsedCard }),
      })
      if (!response.ok) throw new Error('Failed to preview prompt')
      const json = await response.json() as { prompt_sections?: string[] }
      setPromptPreview(json.prompt_sections ?? [])
      toast.success('Runtime prompt preview ready')
    } catch {
      toast.error('Could not preview runtime prompt')
    } finally {
      setIsBusy(false)
    }
  }, [assistantId, csrfHeaders, parsedCard])

  const exportCard = useCallback(async () => {
    setIsBusy(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/agent-card/export`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to export')
      setCardJson(formatJson(await response.json()))
      toast.success('Export loaded into editor')
    } catch {
      toast.error('Could not export Agent Card')
    } finally {
      setIsBusy(false)
    }
  }, [assistantId])

  const createContextRecord = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    const headers = await csrfHeaders()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error('Could not save context card record')
  }, [csrfHeaders])

  const saveOrganizationCard = useCallback(async () => {
    if (!state?.scope.workspace_id) return
    setIsBusy(true)
    try {
      const policy = parseJsonRecord(organizationDraft.policyJson, 'Organization policy')
      const endpoint = `/api/workspaces/${state.scope.workspace_id}/context`
      const requests: Array<Record<string, unknown>> = []
      if (organizationDraft.mission.trim()) {
        requests.push({ scope_type: 'workspace', scope_id: state.scope.workspace_id, record_type: 'thesis', title: 'Organization Card mission', body: organizationDraft.mission.trim(), source_type: 'lucid_card_editor', confidence: 0.9, status: 'active', metadata: { lucid_card_scope: 'organization' }, links: [] })
      }
      const voice = textToList(organizationDraft.voice)
      const style = textToList(organizationDraft.style)
      const banned = textToList(organizationDraft.guardrails)
      if (voice.length || style.length || banned.length || Object.keys(policy).length) {
        requests.push({ scope_type: 'workspace', scope_id: state.scope.workspace_id, record_type: 'policy', title: 'Organization Card voice and policy', body: [...voice, ...style, ...banned].join('\n') || JSON.stringify(policy), source_type: 'lucid_card_editor', confidence: 0.9, status: 'active', metadata: { lucid_card_scope: 'organization', brand_voice: voice, default_style: style, banned_phrases: banned, policy }, links: [] })
      }
      if (requests.length === 0) {
        toast.info('Add organization card details before saving')
        return
      }
      await Promise.all(requests.map((body) => createContextRecord(endpoint, body)))
      setOrganizationDraft(contextCardDraft())
      await reload()
      toast.success('Organization Card saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save Organization Card')
    } finally {
      setIsBusy(false)
    }
  }, [createContextRecord, organizationDraft, reload, state?.scope.workspace_id])

  const saveProjectCard = useCallback(async () => {
    if (!state?.scope.workspace_id || !state.scope.project_id) {
      toast.error('This assistant is not attached to a project')
      return
    }
    setIsBusy(true)
    try {
      const policy = parseJsonRecord(projectDraft.policyJson, 'Project policy')
      const endpoint = `/api/workspaces/${state.scope.workspace_id}/projects/${state.scope.project_id}/context`
      const requests: Array<Record<string, unknown>> = []
      if (projectDraft.mission.trim()) requests.push({ scope_type: 'project', scope_id: state.scope.project_id, record_type: 'thesis', title: 'Project Card goal', body: projectDraft.mission.trim(), source_type: 'lucid_card_editor', confidence: 0.9, status: 'active', metadata: { lucid_card_scope: 'project' }, links: [] })
      const style = textToList(projectDraft.style)
      const banned = textToList(projectDraft.guardrails)
      if (style.length || banned.length || Object.keys(policy).length) requests.push({ scope_type: 'project', scope_id: state.scope.project_id, record_type: 'policy', title: 'Project Card style and policy', body: [...style, ...banned].join('\n') || JSON.stringify(policy), source_type: 'lucid_card_editor', confidence: 0.9, status: 'active', metadata: { lucid_card_scope: 'project', style, banned_phrases: banned, policy }, links: [] })
      requests.push(...textToList(projectDraft.risks).map((risk, index) => ({ scope_type: 'project', scope_id: state.scope.project_id, record_type: 'risk', title: `Project Card risk ${index + 1}`, body: risk, source_type: 'lucid_card_editor', confidence: 0.8, status: 'active', metadata: { lucid_card_scope: 'project' }, links: [] })))
      requests.push(...textToList(projectDraft.openQuestions).map((question, index) => ({ scope_type: 'project', scope_id: state.scope.project_id, record_type: 'open_question', title: `Project Card open question ${index + 1}`, body: question, source_type: 'lucid_card_editor', confidence: 0.8, status: 'active', metadata: { lucid_card_scope: 'project' }, links: [] })))
      if (requests.length === 0) {
        toast.info('Add project card details before saving')
        return
      }
      await Promise.all(requests.map((body) => createContextRecord(endpoint, body)))
      setProjectDraft(contextCardDraft())
      await reload()
      toast.success('Project Card saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save Project Card')
    } finally {
      setIsBusy(false)
    }
  }, [createContextRecord, projectDraft, reload, state?.scope.project_id, state?.scope.workspace_id])

  const agentCardDocuments = useMemo(() => identityDocuments
    .filter((document) => document.content.source === 'agent_card')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.version - a.version),
  [identityDocuments])
  const latestRevertableDocument = useMemo(() => agentCardDocuments.find((document) => document.status !== 'active') ?? null, [agentCardDocuments])

  const revertIdentityDocument = useCallback(async (document: AgentIdentityDocument) => {
    setIsBusy(true)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(`/api/assistants/${assistantId}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ document_type: document.document_type, status: 'active', content: document.content }),
      })
      if (!response.ok) throw new Error('Failed to revert identity document')
      await reload()
      toast.success(`${document.document_type} reverted`)
    } catch {
      toast.error('Could not revert identity document')
    } finally {
      setIsBusy(false)
    }
  }, [assistantId, csrfHeaders, reload])

  const revertLatestIdentityDocument = useCallback(async () => {
    if (!latestRevertableDocument) {
      toast.info('No previous Agent Card version to revert')
      return
    }
    await revertIdentityDocument(latestRevertableDocument)
  }, [latestRevertableDocument, revertIdentityDocument])

  useRegisterCommands(useMemo(() => [
    { id: `agent-card:${assistantId}:validate`, label: 'Validate Agent Card', group: 'Agent Card', icon: <ShieldCheck />, keywords: ['agent card validation identity'], onSelect: () => void previewImport(false), priority: 10 },
    { id: `agent-card:${assistantId}:preview-prompt`, label: 'Preview Agent Card Runtime Prompt', group: 'Agent Card', icon: <FileJson />, keywords: ['agent card prompt runtime'], onSelect: () => void previewPrompt(), priority: 20 },
    { id: `agent-card:${assistantId}:export`, label: 'Export Agent Card', group: 'Agent Card', icon: <Download />, keywords: ['agent card export json'], onSelect: () => void exportCard(), priority: 30 },
    { id: `agent-card:${assistantId}:revert`, label: 'Revert Latest Agent Card Version', group: 'Agent Card', icon: <RotateCcw />, keywords: ['agent card revert history version'], onSelect: () => void revertLatestIdentityDocument(), priority: 40 },
  ], [assistantId, exportCard, previewImport, previewPrompt, revertLatestIdentityDocument]))

  const validation = preview?.validation
  const resolution = preview?.resolution ?? state?.resolution

  if (isLoading) {
    return <PanelStateCard icon={<Loader2 className="h-4 w-4 animate-spin text-primary" />} title="Loading Agent Card" subtitle="Resolving identity and inherited context." />
  }

  return (
    <PanelLayout context="Native Lucid identity packaging. Organization and Project Cards are inherited from shared context; Agent Cards version identity docs.">
      <div className="space-y-3" data-testid="agent-card-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Agent Card</h3>
            <Badge className={statusClass(validation?.status)}>{validation?.status ?? 'current'}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void reload()} disabled={isBusy}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
            <Button data-testid="agent-card-export" size="sm" variant="outline" onClick={() => void exportCard()} disabled={isBusy}><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)_320px]">
          <div className="space-y-3">
            {formCard ? (
              <>
                <PanelDetailBlock>
                  <p className="text-xs font-medium">Profile</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div className="space-y-1.5"><Label className="text-[10px]">Name</Label><Input data-testid="agent-card-profile-name" value={formCard.profile.name} onChange={(event) => updateDraft((card) => ({ ...card, profile: { ...card.profile, name: event.target.value } }))} /></div>
                    <div className="space-y-1.5"><Label className="text-[10px]">Description</Label><Input value={formCard.profile.description ?? ''} onChange={(event) => updateDraft((card) => ({ ...card, profile: { ...card.profile, description: event.target.value || undefined } }))} /></div>
                    <div className="space-y-1.5"><Label className="text-[10px]">Bio</Label><Textarea className="min-h-20 text-xs" value={listToText(formCard.profile.bio)} onChange={(event) => updateDraft((card) => ({ ...card, profile: { ...card.profile, bio: textToList(event.target.value) } }))} /></div>
                    <div className="space-y-1.5"><Label className="text-[10px]">Traits</Label><Textarea className="min-h-20 text-xs" value={listToText(formCard.profile.adjectives)} onChange={(event) => updateDraft((card) => ({ ...card, profile: { ...card.profile, adjectives: textToList(event.target.value) } }))} /></div>
                  </div>
                </PanelDetailBlock>
                <PanelDetailBlock>
                  <p className="text-xs font-medium">Voice, Style, Guardrails</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Textarea className="min-h-24 text-xs" placeholder="Voice summary" value={formCard.voice.summary ?? ''} onChange={(event) => updateDraft((card) => ({ ...card, voice: { ...card.voice, summary: event.target.value || undefined } }))} />
                    <Textarea className="min-h-24 text-xs" placeholder="Style, one per line" value={listToText(formCard.style.all)} onChange={(event) => updateDraft((card) => ({ ...card, style: { ...card.style, all: textToList(event.target.value) } }))} />
                    <Textarea className="min-h-24 text-xs" placeholder="Never, one per line" value={listToText(formCard.guardrails.never)} onChange={(event) => updateDraft((card) => ({ ...card, guardrails: { ...card.guardrails, never: textToList(event.target.value) } }))} />
                  </div>
                </PanelDetailBlock>
                <PanelDetailBlock>
                  <p className="text-xs font-medium">Examples, Knowledge, Policies</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Textarea className="min-h-24 text-xs" placeholder="Post examples" value={listToText(formCard.examples.post_examples)} onChange={(event) => updateDraft((card) => ({ ...card, examples: { ...card.examples, post_examples: textToList(event.target.value) } }))} />
                    <Textarea className="min-h-24 text-xs" placeholder="Knowledge snippets" value={listToText(formCard.knowledge.snippets)} onChange={(event) => updateDraft((card) => ({ ...card, knowledge: { ...card.knowledge, snippets: textToList(event.target.value) } }))} />
                    <Textarea className="min-h-24 text-xs font-mono" placeholder="Access policy JSON" value={formatJson(formCard.policies.access_policy ?? {})} onChange={(event) => updateDraft((card) => ({ ...card, policies: { ...card.policies, access_policy: safeJsonRecord(event.target.value) } }))} />
                  </div>
                </PanelDetailBlock>
              </>
            ) : (
              <PanelEmptyState icon={<FileJson className="h-4 w-4 text-muted-foreground" />} title="Invalid Agent Card JSON" description="Fix the advanced JSON before using the form editor." />
            )}

            <ContextCardEditor
              icon={<Building2 className="h-4 w-4 text-primary" />}
              title="Organization Card"
              draft={organizationDraft}
              onDraftChange={setOrganizationDraft}
              onSave={() => void saveOrganizationCard()}
              busy={isBusy}
              resolved={Boolean(resolution?.organization_card)}
              testId="organization-card-save"
            />
            <ContextCardEditor
              icon={<FolderKanban className="h-4 w-4 text-primary" />}
              title="Project Card"
              draft={projectDraft}
              onDraftChange={setProjectDraft}
              onSave={() => void saveProjectCard()}
              busy={isBusy || !state?.scope.project_id}
              resolved={Boolean(resolution?.project_card)}
              testId="project-card-save"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="agent-card-json" className="text-[10px] uppercase tracking-wide text-muted-foreground">Advanced JSON</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={createKnowledgeSnippets} onCheckedChange={setCreateKnowledgeSnippets} />Snippets to context</div>
            </div>
            <Textarea id="agent-card-json" data-testid="agent-card-json" value={cardJson} onChange={(event) => setCardJson(event.target.value)} spellCheck={false} className={cn('min-h-[420px] font-mono text-xs', parsedCard ? '' : 'border-red-500/50')} />
            <div className="flex flex-wrap gap-2">
              <Button data-testid="agent-card-preview-apply" size="sm" variant="outline" onClick={() => void previewImport(false)} disabled={isBusy || !parsedCard}>{isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}Preview Apply</Button>
              <Button data-testid="agent-card-apply" size="sm" onClick={() => void previewImport(true)} disabled={isBusy || !parsedCard || validation?.status === 'fail'}><Save className="mr-1.5 h-3.5 w-3.5" />Apply</Button>
              <Button size="sm" variant="outline" onClick={() => void previewPrompt()} disabled={isBusy || !parsedCard}><FileJson className="mr-1.5 h-3.5 w-3.5" />Preview Prompt</Button>
            </div>
          </div>

          <div className="space-y-3">
            <PanelDetailBlock>
              <p className="text-xs font-medium">Inherited Context</p>
              <PanelInfoRow label="Organization card" value={resolution?.organization_card ? 'resolved' : 'empty'} />
              <PanelInfoRow label="Project card" value={resolution?.project_card ? 'resolved' : 'empty'} />
              <PanelInfoRow label="Prompt chars" value={`${resolution?.prompt_budget.chars ?? 0} / ${resolution?.prompt_budget.cap ?? 0}`} />
              <PanelInfoRow label="Conflicts" value={resolution?.conflicts.length ?? 0} />
            </PanelDetailBlock>

            <PanelDetailBlock>
              <p className="text-xs font-medium" data-testid="agent-card-preview-diff">Preview Diff</p>
              {preview ? (
                <div className="space-y-2 text-xs">
                  <PanelInfoRow label="Assistant fields" value={preview.diff.assistant.length} />
                  <PanelInfoRow label="Identity docs" value={preview.diff.identity_documents.length} />
                  <PanelInfoRow label="Context proposals" value={preview.diff.shared_context_records.length} />
                  <PanelInfoRow label="Can apply" value={preview.can_apply ? 'yes' : 'no'} />
                </div>
              ) : (
                <PanelEmptyState icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />} title="No preview yet" description="Preview before apply to see exact mutations." />
              )}
            </PanelDetailBlock>

            <PanelDetailBlock>
              <p className="text-xs font-medium" data-testid="agent-card-validation">Validation</p>
              <ScrollArea className="max-h-44 pr-2">
                {validation?.issues.length ? validation.issues.map((issue, index) => (
                  <div key={`${issue.code}-${index}`} className="rounded-md border border-border/60 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{issue.code}</span><Badge className={statusClass(issue.severity === 'blocking' ? 'fail' : issue.severity === 'warning' ? 'warning' : 'pass')}>{issue.severity}</Badge></div>
                    <p className="mt-1 text-muted-foreground">{issue.message}</p>
                  </div>
                )) : <PanelEmptyState icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />} title="No blocking issues" description="Validation runs during preview." />}
              </ScrollArea>
            </PanelDetailBlock>

            <PanelDetailBlock>
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium" data-testid="agent-card-version-history">Version History</p><History className="h-3.5 w-3.5 text-muted-foreground" /></div>
              <ScrollArea className="max-h-56 pr-2">
                {agentCardDocuments.length ? agentCardDocuments.map((document) => (
                  <div key={document.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                    <div className="min-w-0"><p className="truncate font-medium">{document.document_type} v{document.version}</p><p className="text-[10px] text-muted-foreground">{document.status}</p></div>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={isBusy || document.status === 'active'} onClick={() => void revertIdentityDocument(document)}><RotateCcw className="mr-1 h-3 w-3" />Revert</Button>
                  </div>
                )) : <PanelEmptyState icon={<History className="h-4 w-4 text-muted-foreground" />} title="No Agent Card versions" description="Apply an Agent Card to create identity document history." />}
              </ScrollArea>
            </PanelDetailBlock>

            <PanelDetailBlock>
              <div className="flex items-center gap-2"><Keyboard className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs font-medium">Command Palette</p></div>
              <p className="text-[11px] text-muted-foreground">Validate, preview prompt, export, and revert are registered as page-scoped commands.</p>
            </PanelDetailBlock>

            {promptPreview.length ? (
              <PanelDetailBlock>
                <p className="text-xs font-medium">Runtime Prompt</p>
                <ScrollArea className="max-h-56 pr-2"><pre className="whitespace-pre-wrap text-[10px] text-muted-foreground">{promptPreview.join('\n\n')}</pre></ScrollArea>
              </PanelDetailBlock>
            ) : null}
          </div>
        </div>
      </div>
    </PanelLayout>
  )
}

function ContextCardEditor({
  icon,
  title,
  draft,
  onDraftChange,
  onSave,
  busy,
  resolved,
  testId,
}: {
  icon: React.ReactNode
  title: string
  draft: ContextCardDraft
  onDraftChange: (draft: ContextCardDraft) => void
  onSave: () => void
  busy: boolean
  resolved: boolean
  testId: string
}) {
  return (
    <PanelDetailBlock>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{icon}<p className="text-xs font-medium">{title}</p><Badge variant="outline" className="h-5 text-[9px]">{resolved ? 'resolved' : 'empty'}</Badge></div>
        <Button data-testid={testId} size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onSave}><Save className="mr-1 h-3 w-3" />Save</Button>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <Textarea className="min-h-20 text-xs" placeholder="Mission or goal" value={draft.mission} onChange={(event) => onDraftChange({ ...draft, mission: event.target.value })} />
        <Textarea className="min-h-20 text-xs" placeholder="Voice, one per line" value={draft.voice} onChange={(event) => onDraftChange({ ...draft, voice: event.target.value })} />
        <Textarea className="min-h-20 text-xs" placeholder="Style, one per line" value={draft.style} onChange={(event) => onDraftChange({ ...draft, style: event.target.value })} />
        <Textarea className="min-h-20 text-xs" placeholder="Banned phrases or guardrails, one per line" value={draft.guardrails} onChange={(event) => onDraftChange({ ...draft, guardrails: event.target.value })} />
        <Textarea className="min-h-20 text-xs" placeholder="Risks, one per line" value={draft.risks} onChange={(event) => onDraftChange({ ...draft, risks: event.target.value })} />
        <Textarea className="min-h-20 font-mono text-xs" placeholder="Policy JSON" value={draft.policyJson} onChange={(event) => onDraftChange({ ...draft, policyJson: event.target.value })} />
      </div>
    </PanelDetailBlock>
  )
}
