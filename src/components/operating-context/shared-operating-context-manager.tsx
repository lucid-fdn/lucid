'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, Brain, CheckCircle2, Eye, GitBranch, Link2, Loader2, Plus, RefreshCw, Shield, Sparkles, Target } from 'lucide-react'
import type {
  ResolvedSharedContext,
  SharedContextLink,
  SharedContextLinkTargetType,
  SharedContextRecord,
  SharedContextRecordType,
  SharedContextScopeType,
} from '@contracts/shared-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const RECORD_TYPES: SharedContextRecordType[] = [
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

const CONTEXT_CATEGORIES: Array<{
  id: string
  label: string
  description: string
  defaultType: SharedContextRecordType
  types: SharedContextRecordType[]
}> = [
  {
    id: 'guidance',
    label: 'Guidance',
    description: 'Strategy, rules, and decisions agents should follow.',
    defaultType: 'thesis',
    types: ['thesis', 'policy', 'decision'],
  },
  {
    id: 'memory',
    label: 'Memory',
    description: 'Durable facts, preferences, and operator feedback.',
    defaultType: 'memory',
    types: ['memory', 'feedback'],
  },
  {
    id: 'update',
    label: 'Update',
    description: 'Fresh signals and Daily Intel for the current operating window.',
    defaultType: 'signal',
    types: ['signal', 'daily_intel'],
  },
  {
    id: 'attention',
    label: 'Attention',
    description: 'Risks and unresolved questions agents must treat carefully.',
    defaultType: 'risk',
    types: ['risk', 'open_question'],
  },
]

const ADVANCED_RECORD_TYPES = RECORD_TYPES

const LINK_TARGET_TYPES: SharedContextLinkTargetType[] = [
  'knowledge_page',
  'knowledge_claim',
  'knowledge_source',
  'commerce_event',
  'agent_ops_run',
  'memory',
  'heartbeat',
  'candidate',
  'doc',
  'external_signal',
]

const QUICK_DRAFTS: Record<SharedContextRecordType, { title: string; body: string; confidence: string }> = {
  thesis: {
    title: 'Operating thesis',
    body: 'We believe...',
    confidence: '0.7',
  },
  signal: {
    title: 'Reference signal',
    body: 'Observed signal, source, and implication...',
    confidence: '0.6',
  },
  feedback: {
    title: 'Operator feedback',
    body: 'Feedback, expected behavior, and where it applies...',
    confidence: '0.8',
  },
  daily_intel: {
    title: 'Daily Intel',
    body: 'What changed, what matters, and what needs attention...',
    confidence: '0.8',
  },
  memory: {
    title: 'Shared memory',
    body: 'Durable fact or preference for this operating scope...',
    confidence: '0.8',
  },
  decision: {
    title: 'Decision',
    body: 'Decision, rationale, owner, and expected impact...',
    confidence: '0.9',
  },
  policy: {
    title: 'Operating policy',
    body: 'Policy rule, allowed behavior, escalation path, and exceptions...',
    confidence: '1',
  },
  risk: {
    title: 'Risk',
    body: 'Risk, trigger, impact, mitigation, and owner...',
    confidence: '0.7',
  },
  open_question: {
    title: 'Open question',
    body: 'Question, why it matters, and what evidence would resolve it...',
    confidence: '0.5',
  },
}

interface SharedOperatingContextManagerProps {
  title: string
  description: string
  workspaceId: string
  scopeType: Extract<SharedContextScopeType, 'workspace' | 'project' | 'team'>
  scopeId: string
  projectId?: string | null
  endpoint: string
  resolveEndpoint?: string
  className?: string
  compact?: boolean
  showComposer?: boolean
  composerTitle?: string
  composerDescription?: string
}

export function SharedOperatingContextManager({
  title,
  description,
  workspaceId,
  scopeType,
  scopeId,
  projectId,
  endpoint,
  resolveEndpoint,
  className,
  compact = false,
  showComposer = true,
  composerTitle = 'Add context',
  composerDescription = 'Paste a rule, decision, preference, risk, or note. Lucid stores the structure for agents.',
}: SharedOperatingContextManagerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [records, setRecords] = useState<SharedContextRecord[]>([])
  const [resolvedContext, setResolvedContext] = useState<ResolvedSharedContext | null>(null)
  const [recordType, setRecordType] = useState<SharedContextRecordType>('memory')
  const [titleValue, setTitleValue] = useState('')
  const [body, setBody] = useState('')
  const [confidence, setConfidence] = useState('0.8')
  const [filterType, setFilterType] = useState<'all' | SharedContextRecordType>('all')
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<SharedContextRecord | null>(null)
  const [sourceLinks, setSourceLinks] = useState<SharedContextLink[]>([])
  const [linkTargetType, setLinkTargetType] = useState<SharedContextLinkTargetType>('knowledge_page')
  const [linkTargetId, setLinkTargetId] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkProvenance, setLinkProvenance] = useState('')
  const [dailyIntelInputs, setDailyIntelInputs] = useState(0)
  const [isGeneratingIntel, setIsGeneratingIntel] = useState(false)
  const [replacementRecordId, setReplacementRecordId] = useState('')
  const selectedCategory = useMemo(
    () => CONTEXT_CATEGORIES.find((category) => category.types.includes(recordType)) ?? CONTEXT_CATEGORIES[0],
    [recordType],
  )

  const resolvedUrl = resolveEndpoint ?? `${endpoint}${endpoint.includes('?') ? '&' : '?'}resolve=true`
  const dailyIntelEndpoint = useMemo(() => {
    const [path, query] = endpoint.split('?')
    return `${path}/daily-intel${query ? `?${query}` : ''}`
  }, [endpoint])
  const activeRecords = records.filter((record) => record.status === 'active')
  const inheritedRecords = useMemo(
    () => resolvedContext?.records ?? [],
    [resolvedContext?.records],
  )
  const visibleRecords = useMemo(() => {
    const source = filterType === 'all'
      ? inheritedRecords
      : inheritedRecords.filter((record) => record.record_type === filterType)
    return source.slice(0, compact ? 5 : 12)
  }, [compact, filterType, inheritedRecords])
  const policyKeys = Object.keys(resolvedContext?.inherited_policy ?? {})
  const policyEntries = Object.entries(resolvedContext?.inherited_policy ?? {})
  const scopeLabel = resolvedContext?.scopes.map((scope) => scope.scope_type).join(' -> ') || scopeType

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const [recordsResponse, resolvedResponse] = await Promise.all([
        fetch(endpoint, { cache: 'no-store' }),
        fetch(resolvedUrl, { cache: 'no-store' }),
      ])

      if (!recordsResponse.ok || !resolvedResponse.ok) {
        throw new Error('Failed to load shared context')
      }

      const recordsJson = await recordsResponse.json() as { records?: SharedContextRecord[] }
      const resolvedJson = await resolvedResponse.json() as { context?: ResolvedSharedContext }
      setRecords(recordsJson.records ?? [])
      setResolvedContext(resolvedJson.context ?? null)
    } catch {
      toast.error('Could not load operating context')
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, resolvedUrl])

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

  const applyDraft = useCallback((type: SharedContextRecordType) => {
    const draft = QUICK_DRAFTS[type]
    setEditingRecordId(null)
    setRecordType(type)
    setTitleValue('')
    setBody('')
    setConfidence(draft.confidence)
    setSourceLinks([])
    setDailyIntelInputs(0)
  }, [])

  const applyCategory = useCallback((categoryId: string) => {
    const category = CONTEXT_CATEGORIES.find((item) => item.id === categoryId)
    if (!category) return
    applyDraft(category.defaultType)
  }, [applyDraft])

  const clearEditor = useCallback(() => {
    setEditingRecordId(null)
    setBody('')
    setTitleValue('')
    setConfidence(QUICK_DRAFTS[recordType].confidence)
    setSourceLinks([])
    setDailyIntelInputs(0)
  }, [recordType])

  const editRecord = useCallback((record: SharedContextRecord) => {
    setEditingRecordId(record.id)
    setRecordType(record.record_type)
    setTitleValue(record.title)
    setBody(record.body)
    setConfidence(record.confidence == null ? '' : String(record.confidence))
    setSourceLinks(record.links ?? [])
    setDailyIntelInputs(0)
  }, [])

  const recordEndpoint = useCallback((recordId: string) => {
    const [path, query] = endpoint.split('?')
    return `${path}/${recordId}${query ? `?${query}` : ''}`
  }, [endpoint])

  const addSourceLink = useCallback(() => {
    const targetId = linkTargetId.trim()
    if (!targetId) {
      toast.error('Source target id is required')
      return
    }
    const url = linkUrl.trim()
    setSourceLinks((current) => [
      ...current,
      {
        target_type: linkTargetType,
        target_id: targetId,
        label: linkLabel.trim() || null,
        url: url || null,
        provenance: linkProvenance.trim() || null,
        confidence: null,
        metadata: { added_from: 'shared_operating_context_manager' },
      },
    ])
    setLinkTargetId('')
    setLinkLabel('')
    setLinkUrl('')
    setLinkProvenance('')
  }, [linkLabel, linkProvenance, linkTargetId, linkTargetType, linkUrl])

  const removeSourceLink = useCallback((index: number) => {
    setSourceLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }, [])

  const saveRecord = useCallback(async () => {
    const trimmedBody = body.trim()
    if (!trimmedBody) {
      toast.error('Context is required')
      return
    }
    const trimmedTitle = titleValue.trim() || deriveContextTitle(trimmedBody)

    const parsedConfidence = confidence.trim() ? Number(confidence) : null
    if (parsedConfidence !== null && (!Number.isFinite(parsedConfidence) || parsedConfidence < 0 || parsedConfidence > 1)) {
      toast.error('Confidence must be between 0 and 1')
      return
    }

    setIsSaving(true)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(editingRecordId ? recordEndpoint(editingRecordId) : endpoint, {
        method: editingRecordId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(editingRecordId ? {
          record_type: recordType,
          title: trimmedTitle,
          body: trimmedBody,
          confidence: parsedConfidence,
          links: sourceLinks,
        } : {
          project_id: projectId ?? null,
          scope_type: scopeType,
          scope_id: scopeId,
          record_type: recordType,
          title: trimmedTitle,
          body: trimmedBody,
          confidence: parsedConfidence,
          metadata: { created_from: 'shared_operating_context_manager', workspace_id: workspaceId },
          links: sourceLinks,
        }),
      })

      if (!response.ok) throw new Error('Failed to save shared context')
      toast.success(editingRecordId ? 'Operating context updated' : 'Operating context saved')
      setEditingRecordId(null)
      setBody('')
      setSourceLinks([])
      setDailyIntelInputs(0)
      await reload()
    } catch {
      toast.error('Could not save operating context')
    } finally {
      setIsSaving(false)
    }
  }, [body, confidence, csrfHeaders, editingRecordId, endpoint, projectId, recordEndpoint, recordType, reload, scopeId, scopeType, sourceLinks, titleValue, workspaceId])

  const updateRecordLifecycle = useCallback(async (
    record: SharedContextRecord,
    status: 'resolved' | 'superseded' | 'archived',
    replacementId?: string | null,
  ) => {
    setBusyRecordId(record.id)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(recordEndpoint(record.id), {
        method: status === 'archived' ? 'DELETE' : 'PATCH',
        headers: status === 'archived' ? headers : { 'Content-Type': 'application/json', ...headers },
        body: status === 'archived'
          ? undefined
          : JSON.stringify({
              status,
              superseded_by_record_id: status === 'superseded' ? replacementId ?? null : undefined,
              metadata: {
                ...record.metadata,
                lifecycle_updated_from: 'shared_operating_context_manager',
              },
            }),
      })
      if (!response.ok) throw new Error('Failed to update shared context')
      if (editingRecordId === record.id) clearEditor()
      toast.success(status === 'archived' ? 'Operating context archived' : `Operating context ${status}`)
      await reload()
    } catch {
      toast.error('Could not update operating context')
    } finally {
      setBusyRecordId(null)
    }
  }, [clearEditor, csrfHeaders, editingRecordId, recordEndpoint, reload])

  const generateDailyIntel = useCallback(async (publish: boolean) => {
    setIsGeneratingIntel(true)
    try {
      const headers = await csrfHeaders()
      const response = await fetch(dailyIntelEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          lookback_hours: 24,
          publish,
          title: titleValue.trim() || undefined,
          body: publish ? body.trim() || undefined : undefined,
        }),
      })
      if (!response.ok) throw new Error('Failed to generate Daily Intel')
      const json = await response.json() as {
        intel?: { title: string; body: string; inputs?: SharedContextRecord[]; links?: SharedContextLink[] }
      }
      if (!publish && json.intel) {
        setEditingRecordId(null)
        setRecordType('daily_intel')
        setTitleValue(json.intel.title)
        setBody(json.intel.body)
        setConfidence('1')
        setSourceLinks(json.intel.links ?? [])
        setDailyIntelInputs(json.intel.inputs?.length ?? 0)
      }
      toast.success(publish ? 'Daily Intel published' : 'Daily Intel draft generated')
      if (publish) {
        clearEditor()
        await reload()
      }
    } catch {
      toast.error('Could not generate Daily Intel')
    } finally {
      setIsGeneratingIntel(false)
    }
  }, [body, clearEditor, csrfHeaders, dailyIntelEndpoint, reload, titleValue])

  return (
    <Card className={cn('overflow-hidden rounded-[32px] border-border/70 bg-card/55 shadow-sm', className)}>
      <CardHeader className="space-y-5 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
              {description}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full bg-background/70"
              onClick={() => void reload()}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full bg-background/70"
              onClick={() => void generateDailyIntel(false)}
              disabled={isGeneratingIntel}
            >
              {isGeneratingIntel ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              Generate Daily Intel
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ContextStat label="Scope" value={scopeType} />
          <ContextStat label="Local" value={String(activeRecords.length)} />
          <ContextStat label="Inherited" value={String(inheritedRecords.length)} />
          <ContextStat label="Policies" value={String(policyKeys.length)} />
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-0">
        <div className={cn('grid gap-5', showComposer ? 'xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]' : 'xl:grid-cols-1')}>
          {showComposer ? (
          <section className="space-y-4 rounded-[28px] border border-border/70 bg-background/45 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{composerTitle}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {composerDescription}
                </p>
              </div>
              <Badge variant="outline" className="h-6 rounded-full border-primary/25 bg-primary/10 text-[10px] text-primary">
                {selectedCategory.label}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label className="sr-only">What should agents know?</Label>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={compact ? 5 : 8}
                className="min-h-[180px] rounded-3xl border-border/70 bg-card/70 p-4 text-base leading-7 shadow-sm"
                placeholder="Example: Always escalate enterprise pricing questions to a human before quoting custom discounts."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <Input
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                className="h-10 rounded-2xl bg-card/70 text-sm"
                placeholder="Optional title"
              />
              <Button type="button" size="sm" className="h-10 rounded-full px-5 text-sm" onClick={() => void saveRecord()} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                {editingRecordId ? 'Update' : 'Save to Brain'}
              </Button>
            </div>

            <details className="group rounded-[22px] border border-border/60 bg-card/35">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-muted-foreground">
                <span>Advanced metadata</span>
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground group-open:hidden">
                  {formatRecordType(recordType)}
                </span>
              </summary>
              <div className="space-y-3 border-t border-border/60 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_170px_96px]">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Use as</Label>
                    <Select value={selectedCategory.id} onValueChange={applyCategory}>
                      <SelectTrigger className="h-9 rounded-xl bg-background/70 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTEXT_CATEGORIES.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</Label>
                    <Select value={recordType} onValueChange={(value) => applyDraft(value as SharedContextRecordType)}>
                      <SelectTrigger className="h-9 rounded-xl bg-background/70 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ADVANCED_RECORD_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{formatRecordType(type)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Confidence</Label>
                    <Input
                      value={confidence}
                      onChange={(event) => setConfidence(event.target.value)}
                      className="h-9 rounded-xl bg-background/70 text-xs"
                      inputMode="decimal"
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-muted-foreground">{selectedCategory.description}</p>
              </div>
            </details>

            <details className="group rounded-[22px] border border-border/60 bg-card/45">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Link2 className="h-3 w-3" />
                  Evidence
                </span>
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {sourceLinks.length ? `${sourceLinks.length} linked` : 'optional'}
                </span>
              </summary>
              <div className="border-t border-border/60 p-3">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Link2 className="h-3 w-3" />
                Evidence links
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr]">
                <Select value={linkTargetType} onValueChange={(value) => setLinkTargetType(value as SharedContextLinkTargetType)}>
                  <SelectTrigger className="h-9 rounded-xl bg-background/70 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_TARGET_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{formatLinkTargetType(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={linkTargetId} onChange={(event) => setLinkTargetId(event.target.value)} className="h-9 rounded-xl bg-background/70 text-xs" placeholder="Source id, run id, URL id, or external reference" />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} className="h-9 rounded-xl bg-background/70 text-xs" placeholder="Source label" />
                <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} className="h-9 rounded-xl bg-background/70 text-xs" placeholder="Optional source URL" />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={linkProvenance} onChange={(event) => setLinkProvenance(event.target.value)} className="h-9 rounded-xl bg-background/70 text-xs" placeholder="Provenance note" />
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl bg-background/70 text-xs" onClick={addSourceLink}>
                  Add source
                </Button>
              </div>
              {sourceLinks.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sourceLinks.map((link, index) => (
                    <button
                      key={`${link.target_type}-${link.target_id}-${index}`}
                      type="button"
                      className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                      onClick={() => removeSourceLink(index)}
                    >
                      {formatLinkTargetType(link.target_type)} · {link.label || link.target_id}
                    </button>
                  ))}
                </div>
              ) : null}
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{dailyIntelInputs > 0 ? `${dailyIntelInputs} Daily Intel inputs` : scopeLabel}</span>
              <div className="flex items-center gap-2">
                {editingRecordId ? (
                  <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full text-xs" onClick={clearEditor} disabled={isSaving}>
                    Cancel
                  </Button>
                ) : null}
                {recordType === 'daily_intel' && body.trim() ? (
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-full bg-background/70 text-xs" onClick={() => void generateDailyIntel(true)} disabled={isGeneratingIntel}>
                    {isGeneratingIntel ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                    Publish Intel
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
          ) : null}

          <section className="space-y-4 rounded-[28px] border border-border/70 bg-background/30 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Target className="h-4 w-4 text-primary" />
                  Context library
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Resolved local and inherited context available to agents at runtime.
                </p>
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as 'all' | SharedContextRecordType)}>
                <SelectTrigger className="h-9 w-[160px] rounded-full bg-card/70 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All records</SelectItem>
                  {RECORD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{formatRecordType(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                <Shield className="h-3.5 w-3.5" />
                Inherited policy preview
              </div>
              {policyKeys.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {policyEntries.slice(0, 6).map(([key, value]) => (
                    <div key={key} className="grid gap-2 rounded-xl border border-emerald-500/10 bg-background/40 px-2.5 py-2 text-[10px] sm:grid-cols-[120px_1fr]">
                      <span className="font-medium text-emerald-300">{key}</span>
                      <span className="truncate text-muted-foreground">{formatPolicyValue(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                  <div className="mt-2 rounded-xl border border-dashed border-emerald-500/20 bg-background/30 px-3 py-2 text-[10px] text-muted-foreground">
                  No inherited policy records yet.
                </div>
              )}
              {(resolvedContext?.policy_conflicts.length ?? 0) > 0 ? (
                <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-2 text-[10px] text-amber-200">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {resolvedContext?.policy_conflicts.length} override warning{resolvedContext?.policy_conflicts.length === 1 ? '' : 's'}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {resolvedContext?.policy_conflicts.slice(0, 6).map((conflict) => (
                      <Badge key={conflict.key} variant="outline" className="h-5 border-amber-500/25 text-[9px] text-amber-200">
                        {conflict.key}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {visibleRecords.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-card/35 p-6 text-center">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">No resolved context yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Add a thesis, signal, decision, policy, risk, or Daily Intel record to make this scope available to agents.
                </p>
              </div>
            ) : (
              <ScrollArea className={compact ? 'max-h-[360px]' : 'max-h-[520px]'}>
                <div className="space-y-2.5 pr-2">
                  {visibleRecords.map((record) => (
                    <RecordRow
                      key={record.id}
                      record={record}
                      local={record.scope_type === scopeType && record.scope_id === scopeId}
                      busy={busyRecordId === record.id}
                      onEdit={editRecord}
                      onOpen={setSelectedRecord}
                      onResolve={(item) => void updateRecordLifecycle(item, 'resolved')}
                      onSupersede={(item) => {
                        setReplacementRecordId('')
                        setSelectedRecord(item)
                      }}
                      onArchive={(item) => void updateRecordLifecycle(item, 'archived')}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </section>
        </div>
      </CardContent>
      <RecordDetailSheet
        record={selectedRecord}
        replacementRecordId={replacementRecordId}
        replacementOptions={visibleRecords.filter((record) => record.id !== selectedRecord?.id)}
        busy={selectedRecord ? busyRecordId === selectedRecord.id : false}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null)
        }}
        onReplacementChange={setReplacementRecordId}
        onResolve={(record) => void updateRecordLifecycle(record, 'resolved')}
        onSupersede={(record) => void updateRecordLifecycle(record, 'superseded', replacementRecordId || null)}
        onArchive={(record) => void updateRecordLifecycle(record, 'archived')}
      />
    </Card>
  )
}

function ContextStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/45 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 px-3.5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function RecordRow({
  record,
  local,
  busy,
  onEdit,
  onOpen,
  onResolve,
  onSupersede,
  onArchive,
}: {
  record: SharedContextRecord
  local: boolean
  busy: boolean
  onEdit: (record: SharedContextRecord) => void
  onOpen: (record: SharedContextRecord) => void
  onResolve: (record: SharedContextRecord) => void
  onSupersede: (record: SharedContextRecord) => void
  onArchive: (record: SharedContextRecord) => void
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-card/55 p-3.5 transition-colors hover:bg-card/75">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 rounded-full border-border text-[9px] text-muted-foreground">
              {formatRecordType(record.record_type)}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-full border-border text-[9px] text-muted-foreground">
              {local ? 'local' : record.scope_type}
            </Badge>
            {record.links?.length ? (
              <Badge variant="outline" className="h-5 rounded-full border-cyan-500/25 text-[9px] text-cyan-300">
                {record.links.length} sources
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{record.title}</p>
        </div>
        {record.confidence !== null ? (
          <Badge className="h-5 rounded-full bg-blue-500/10 text-[9px] text-blue-300">{Math.round(record.confidence * 100)}%</Badge>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">{record.body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">{formatDate(record.updated_at)}</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="xs" className="h-7 rounded-full px-2 text-[10px]" onClick={() => onOpen(record)}>
            <Eye className="mr-1 h-3 w-3" />
            Details
          </Button>
          {local ? (
            <>
            <Button type="button" variant="ghost" size="xs" className="h-7 rounded-full px-2 text-[10px]" onClick={() => onEdit(record)}>
              Edit
            </Button>
            {(record.record_type === 'risk' || record.record_type === 'open_question') ? (
              <Button type="button" variant="ghost" size="xs" className="h-7 rounded-full px-2 text-[10px]" onClick={() => onResolve(record)} disabled={busy}>
                Resolve
              </Button>
            ) : null}
            {(record.record_type === 'thesis' || record.record_type === 'policy') ? (
              <Button type="button" variant="ghost" size="xs" className="h-7 rounded-full px-2 text-[10px]" onClick={() => onSupersede(record)} disabled={busy}>
                Supersede
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 rounded-full px-2 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={() => onArchive(record)}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Archive'}
            </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RecordDetailSheet({
  record,
  replacementRecordId,
  replacementOptions,
  busy,
  onOpenChange,
  onReplacementChange,
  onResolve,
  onSupersede,
  onArchive,
}: {
  record: SharedContextRecord | null
  replacementRecordId: string
  replacementOptions: SharedContextRecord[]
  busy: boolean
  onOpenChange: (open: boolean) => void
  onReplacementChange: (value: string) => void
  onResolve: (record: SharedContextRecord) => void
  onSupersede: (record: SharedContextRecord) => void
  onArchive: (record: SharedContextRecord) => void
}) {
  return (
    <Sheet open={Boolean(record)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {record ? (
          <>
            <SheetHeader>
              <SheetTitle>{record.title}</SheetTitle>
              <SheetDescription>
                {formatRecordType(record.record_type)} · {record.scope_type} · {record.status}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-4">
              <div className="rounded-lg border bg-muted/10 p-3 text-xs leading-relaxed text-muted-foreground">
                {record.body}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Metric label="Confidence" value={record.confidence == null ? 'none' : `${Math.round(record.confidence * 100)}%`} />
                <Metric label="Updated" value={formatDate(record.updated_at)} />
                <Metric label="Source" value={record.source_type ? `${record.source_type}:${record.source_id ?? 'none'}` : 'manual'} />
                <Metric label="Replacement" value={record.superseded_by_record_id ?? 'none'} />
              </div>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  Sources and provenance
                </div>
                {record.links?.length ? (
                  <div className="space-y-2">
                    {record.links.map((link, index) => (
                      <div key={`${link.target_type}-${link.target_id}-${index}`} className="rounded-md border bg-background/50 p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="h-5 border-border text-[9px] text-muted-foreground">
                            {formatLinkTargetType(link.target_type)}
                          </Badge>
                          <span className="text-xs font-medium text-foreground">{link.label || link.target_id}</span>
                        </div>
                        <p className="mt-1 break-all text-[10px] text-muted-foreground">{link.target_id}</p>
                        {link.provenance ? <p className="mt-1 text-[10px] text-muted-foreground">{link.provenance}</p> : null}
                        {link.url ? <p className="mt-1 break-all text-[10px] text-cyan-300">{link.url}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No sources linked yet.</div>
                )}
              </section>

              {(record.record_type === 'thesis' || record.record_type === 'policy') ? (
                <section className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <GitBranch className="h-3.5 w-3.5 text-primary" />
                    Supersede with replacement
                  </div>
                  <Select value={replacementRecordId} onValueChange={onReplacementChange}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Optional replacement record" />
                    </SelectTrigger>
                    <SelectContent>
                      {replacementOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>{option.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {(record.record_type === 'risk' || record.record_type === 'open_question') ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => onResolve(record)}>
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Resolve
                  </Button>
                ) : null}
                {(record.record_type === 'thesis' || record.record_type === 'policy') ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => onSupersede(record)}>
                    <GitBranch className="mr-1 h-3 w-3" />
                    Supersede
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => onArchive(record)}>
                  <Archive className="mr-1 h-3 w-3" />
                  Archive
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function formatRecordType(type: SharedContextRecordType) {
  return type
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1))
    .join(' ')
}

function formatLinkTargetType(type: SharedContextLinkTargetType) {
  return type
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1))
    .join(' ')
}

function formatPolicyValue(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return 'policy value'
  }
}

function deriveContextTitle(body: string) {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? 'Brain note'
  const sentence = firstLine.split(/[.!?]/)[0]?.trim() || firstLine
  return sentence.length > 72 ? `${sentence.slice(0, 69).trim()}...` : sentence
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
