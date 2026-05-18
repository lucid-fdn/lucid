import 'server-only'

import type {
  CreateSharedContextRecordInput,
  GenerateDailyIntelPreviewInput,
  ResolvedSharedContext,
  SharedContextLink,
  SharedContextRecord,
  SharedContextRecordType,
  SharedContextScopeRef,
  SharedContextScopeType,
  UpdateSharedContextRecordInput,
} from '@contracts/shared-context'
import { supabase, ErrorService } from './client'
import {
  listRecentCommerceKnowledgeEvidenceEvents,
  type CommerceKnowledgeEvidenceEvent,
} from './knowledge-operation-events'

const SHARED_CONTEXT_LINK_SELECT =
  'id, record_id, target_type, target_id, label, url, provenance, observed_at, confidence, metadata, created_at' as const

export interface ListSharedContextInput {
  workspaceId: string
  projectId?: string | null
  agentId?: string | null
  scopeType?: string
  scopeId?: string
  recordType?: string
  limit?: number
}

export async function listSharedContextRecords(input: ListSharedContextInput): Promise<SharedContextRecord[]> {
  let query = supabase
    .from('shared_context_records')
    .select('*, links:shared_context_links(*)')
    .eq('workspace_id', input.workspaceId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.agentId) query = query.eq('agent_id', input.agentId)
  if (input.scopeType) query = query.eq('scope_type', input.scopeType)
  if (input.scopeId) query = query.eq('scope_id', input.scopeId)
  if (input.recordType) query = query.eq('record_type', input.recordType)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        fn: 'listSharedContextRecords',
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? undefined,
        agentId: input.agentId ?? undefined,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        recordType: input.recordType,
      },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return []
  }

  return ((data ?? []) as SharedContextRecord[]).map(normalizeSharedContextRecord)
}

export async function createSharedContextRecord(
  workspaceId: string,
  input: CreateSharedContextRecordInput,
  userId?: string | null,
): Promise<SharedContextRecord | null> {
  const { links, ...recordInput } = input
  const { data, error } = await supabase
    .from('shared_context_records')
    .insert({
      workspace_id: workspaceId,
      project_id: recordInput.project_id ?? null,
      agent_id: recordInput.agent_id ?? null,
      scope_type: recordInput.scope_type,
      scope_id: recordInput.scope_id,
      record_type: recordInput.record_type,
      title: recordInput.title,
      body: recordInput.body,
      source_type: recordInput.source_type ?? null,
      source_id: recordInput.source_id ?? null,
      confidence: recordInput.confidence ?? null,
      status: recordInput.status,
      valid_from: recordInput.valid_from ?? null,
      valid_until: recordInput.valid_until ?? null,
      superseded_by_record_id: recordInput.superseded_by_record_id ?? null,
      metadata: recordInput.metadata ?? {},
      created_by: userId ?? null,
    })
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'createSharedContextRecord', workspaceId, recordType: recordInput.record_type },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return null
  }

  const record = normalizeSharedContextRecord(data as SharedContextRecord)
  if (links.length > 0) {
    record.links = await replaceSharedContextLinks(record.id, links)
  }
  return record
}

export async function getSharedContextRecord(recordId: string): Promise<SharedContextRecord | null> {
  const { data, error } = await supabase
    .from('shared_context_records')
    .select('*, links:shared_context_links(*)')
    .eq('id', recordId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getSharedContextRecord', recordId },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return null
  }

  return data ? normalizeSharedContextRecord(data as SharedContextRecord) : null
}

export async function updateSharedContextRecord(
  recordId: string,
  input: UpdateSharedContextRecordInput,
  options?: { userId?: string | null },
): Promise<SharedContextRecord | null> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.record_type !== undefined) patch.record_type = input.record_type
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  if (input.confidence !== undefined) patch.confidence = input.confidence
  if (input.status !== undefined) patch.status = input.status
  if (input.valid_from !== undefined) patch.valid_from = input.valid_from
  if (input.valid_until !== undefined) patch.valid_until = input.valid_until
  if (input.superseded_by_record_id !== undefined) patch.superseded_by_record_id = input.superseded_by_record_id
  if (input.metadata !== undefined) patch.metadata = input.metadata
  if (input.status === 'resolved') {
    patch.resolved_at = new Date().toISOString()
    patch.resolved_by = options?.userId ?? null
  }

  const { data, error } = await supabase
    .from('shared_context_records')
    .update(patch)
    .eq('id', recordId)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'updateSharedContextRecord', recordId, status: input.status },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return null
  }

  const record = normalizeSharedContextRecord(data as SharedContextRecord)
  if (input.links) {
    record.links = await replaceSharedContextLinks(record.id, input.links)
  }
  return record
}

export interface ResolveSharedContextInput {
  workspaceId: string
  projectId?: string | null
  teamId?: string | null
  agentId?: string | null
  userId?: string | null
  limit?: number
}

const RECORD_PROMPT_ORDER: SharedContextRecordType[] = [
  'thesis',
  'policy',
  'decision',
  'risk',
  'open_question',
  'signal',
  'feedback',
  'daily_intel',
  'memory',
]

const RECORD_PROMPT_LABELS: Record<SharedContextRecordType, string> = {
  thesis: 'What We Believe',
  policy: 'Operating Policy',
  decision: 'Decisions',
  risk: 'Risks',
  open_question: 'Open Questions',
  signal: 'Signals',
  feedback: 'Feedback',
  daily_intel: 'Daily Intel',
  memory: 'Shared Memory',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function isRecordCurrentlyValid(record: SharedContextRecord, now = Date.now()): boolean {
  if (record.status !== 'active') return false
  if (record.valid_from && Date.parse(record.valid_from) > now) return false
  if (record.valid_until && Date.parse(record.valid_until) <= now) return false
  return true
}

function buildScopeRefs(input: ResolveSharedContextInput): SharedContextScopeRef[] {
  const scopes: SharedContextScopeRef[] = [
    { scope_type: 'workspace', scope_id: input.workspaceId, precedence: 10 },
  ]

  if (input.projectId) scopes.push({ scope_type: 'project', scope_id: input.projectId, precedence: 20 })
  if (input.teamId) scopes.push({ scope_type: 'team', scope_id: input.teamId, precedence: 30 })
  if (input.agentId) scopes.push({ scope_type: 'agent', scope_id: input.agentId, precedence: 40 })
  if (input.userId) scopes.push({ scope_type: 'user', scope_id: input.userId, precedence: 50 })

  return scopes
}

function recordScopeKey(record: Pick<SharedContextRecord, 'scope_type' | 'scope_id'>): string {
  return `${record.scope_type}:${record.scope_id}`
}

function scopeKey(scope: Pick<SharedContextScopeRef, 'scope_type' | 'scope_id'>): string {
  return `${scope.scope_type}:${scope.scope_id}`
}

function isDailyIntelInputInScope(
  record: Pick<SharedContextRecord, 'scope_type' | 'scope_id' | 'project_id'>,
  input: GenerateDailyIntelInput,
  scopeKeys: Set<string>,
): boolean {
  if (scopeKeys.has(recordScopeKey(record))) return true

  // Project-level Daily Intel should include team/agent signals that were
  // explicitly created inside the same project, including attached commerce
  // context. Exact scope matching alone would hide those useful downstream
  // inputs from the project operator view.
  if (input.scopeType === 'project' && input.projectId && record.project_id === input.projectId) {
    return true
  }

  return false
}

function getPolicyPayload(record: SharedContextRecord): Record<string, unknown> {
  const metadataPolicy = isObject(record.metadata.policy) ? record.metadata.policy : null
  if (metadataPolicy) return metadataPolicy

  if (isObject(record.metadata) && Object.keys(record.metadata).length > 0) return record.metadata

  try {
    const parsed = JSON.parse(record.body) as unknown
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeSharedContextRecord(record: SharedContextRecord): SharedContextRecord {
  return {
    ...record,
    links: Array.isArray(record.links) ? record.links : [],
    metadata: isObject(record.metadata) ? record.metadata : {},
  }
}

async function replaceSharedContextLinks(recordId: string, links: SharedContextLink[]): Promise<SharedContextLink[]> {
  await supabase.from('shared_context_links').delete().eq('record_id', recordId)

  if (links.length === 0) return []

  const rows = links.map((link) => ({
    record_id: recordId,
    target_type: link.target_type,
    target_id: link.target_id,
    label: link.label ?? null,
    url: link.url ?? null,
    provenance: link.provenance ?? null,
    observed_at: link.observed_at ?? null,
    confidence: link.confidence ?? null,
    metadata: link.metadata ?? {},
  }))

  const { data, error } = await supabase
    .from('shared_context_links')
    .insert(rows)
    .select(SHARED_CONTEXT_LINK_SELECT)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { fn: 'replaceSharedContextLinks', recordId, linkCount: links.length },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return []
  }

  return (data ?? []) as SharedContextLink[]
}

interface PolicyMergeResult {
  inheritedPolicy: Record<string, unknown>
  policySources: ResolvedSharedContext['policy_sources']
  policyConflicts: ResolvedSharedContext['policy_conflicts']
}

function mergeInheritedPolicy(records: SharedContextRecord[], scopes: SharedContextScopeRef[]): PolicyMergeResult {
  const precedence = new Map(scopes.map((scope) => [scopeKey(scope), scope.precedence]))
  const policyRecords = records
    .filter((record) => record.record_type === 'policy')
    .sort((a, b) => {
      const byPrecedence = (precedence.get(recordScopeKey(a)) ?? 0) - (precedence.get(recordScopeKey(b)) ?? 0)
      if (byPrecedence !== 0) return byPrecedence
      return Date.parse(a.created_at) - Date.parse(b.created_at)
    })

  const inheritedPolicy: Record<string, unknown> = {}
  const winners = new Map<string, SharedContextRecord>()
  const overridden = new Map<string, SharedContextRecord[]>()
  const policySources: PolicyMergeResult['policySources'] = []

  for (const record of policyRecords) {
    const payload = getPolicyPayload(record)
    const keys = Object.keys(payload)
    const overrides = keys.filter((key) => Object.hasOwn(inheritedPolicy, key))
    for (const key of overrides) {
      const previous = winners.get(key)
      if (previous) {
        const rows = overridden.get(key) ?? []
        rows.push(previous)
        overridden.set(key, rows)
      }
    }
    Object.assign(inheritedPolicy, payload)
    for (const key of keys) winners.set(key, record)
    policySources.push({
      record_id: record.id,
      scope_type: record.scope_type,
      scope_id: record.scope_id,
      title: record.title,
      keys,
      overrides,
    })
  }

  const policyConflicts = [...overridden.entries()].flatMap(([key, rows]) => {
    const winner = winners.get(key)
    if (!winner || rows.length === 0) return []
    return [{
      key,
      winning_record_id: winner.id,
      overridden_record_ids: [...new Set(rows.map((record) => record.id))],
      scopes: [...new Set([winner.scope_type, ...rows.map((record) => record.scope_type)])],
    }]
  })

  return { inheritedPolicy, policySources, policyConflicts }
}

function buildPromptSections(records: SharedContextRecord[]): string[] {
  const sections: string[] = []

  for (const recordType of RECORD_PROMPT_ORDER) {
    const rows = records
      .filter((record) => record.record_type === recordType)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, recordType === 'signal' || recordType === 'feedback' ? 8 : 5)

    if (rows.length === 0) continue

    const lines = rows.map((record) => {
      const confidence = typeof record.confidence === 'number' ? ` confidence=${record.confidence.toFixed(2)}` : ''
      return `- [${record.scope_type}] ${record.title}${confidence}: ${record.body}`
    })
    sections.push(`## ${RECORD_PROMPT_LABELS[recordType]}\n${lines.join('\n')}`)
  }

  return sections
}

export async function resolveSharedContext(input: ResolveSharedContextInput): Promise<ResolvedSharedContext> {
  const scopes = buildScopeRefs(input)
  const scopeKeys = new Set(scopes.map(scopeKey))

  const { data, error } = await supabase
    .from('shared_context_records')
    .select('*, links:shared_context_links(*)')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 500)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        fn: 'resolveSharedContext',
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? undefined,
        teamId: input.teamId ?? undefined,
        agentId: input.agentId ?? undefined,
      },
      tags: { layer: 'db', route: 'shared-context' },
    })
  }

  const records = ((data ?? []) as SharedContextRecord[])
    .map(normalizeSharedContextRecord)
    .filter((record) => scopeKeys.has(recordScopeKey(record)))
    .filter((record) => isRecordCurrentlyValid(record))
  const policy = mergeInheritedPolicy(records, scopes)

  return {
    workspace_id: input.workspaceId,
    project_id: input.projectId ?? null,
    team_id: input.teamId ?? null,
    agent_id: input.agentId ?? null,
    user_id: input.userId ?? null,
    generated_at: new Date().toISOString(),
    scopes,
    records,
    inherited_policy: policy.inheritedPolicy,
    policy_sources: policy.policySources,
    policy_conflicts: policy.policyConflicts,
    prompt_sections: buildPromptSections(records),
  }
}

export async function getAgentPrimaryTeamId(agentId: string, workspaceId: string, projectId?: string | null): Promise<string | null> {
  const { data: memberships, error: membershipError } = await supabase
    .from('crew_members')
    .select('crew_id')
    .eq('assistant_id', agentId)
    .order('created_at', { ascending: true })
    .limit(25)

  if (membershipError) {
    ErrorService.captureException(membershipError, {
      severity: 'warning',
      context: { fn: 'getAgentPrimaryTeamId.memberships', agentId, workspaceId, projectId: projectId ?? undefined },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return null
  }

  const crewIds = Array.from(
    new Set(
      ((memberships ?? []) as Array<{ crew_id?: string | null }>)
        .map((membership) => membership.crew_id)
        .filter((crewId): crewId is string => Boolean(crewId)),
    ),
  )

  if (crewIds.length === 0) return null

  let crewsQuery = supabase
    .from('crews')
    .select('id')
    .in('id', crewIds)
    .eq('org_id', workspaceId)
    .is('deleted_at', null)
    .limit(25)

  if (projectId) crewsQuery = crewsQuery.eq('project_id', projectId)

  const { data: crews, error: crewsError } = await crewsQuery

  if (crewsError) {
    ErrorService.captureException(crewsError, {
      severity: 'warning',
      context: { fn: 'getAgentPrimaryTeamId.crews', agentId, workspaceId, projectId: projectId ?? undefined },
      tags: { layer: 'db', route: 'shared-context' },
    })
    return null
  }

  const activeCrewIds = new Set(((crews ?? []) as Array<{ id?: string | null }>).map((crew) => crew.id).filter(Boolean))
  return crewIds.find((crewId) => activeCrewIds.has(crewId)) ?? null
}

export async function resolveAgentSharedContext(
  agentId: string,
  workspaceId: string,
  projectId?: string | null,
  userId?: string | null,
): Promise<ResolvedSharedContext> {
  const teamId = await getAgentPrimaryTeamId(agentId, workspaceId, projectId)
  return resolveSharedContext({
    workspaceId,
    projectId: projectId ?? null,
    teamId,
    agentId,
    userId: userId ?? null,
  })
}

export interface GenerateDailyIntelInput extends GenerateDailyIntelPreviewInput {
  workspaceId: string
  projectId?: string | null
  teamId?: string | null
  scopeType: 'workspace' | 'project' | 'team'
  scopeId: string
  userId?: string | null
}

export interface DailyIntelPreview {
  inputs: SharedContextRecord[]
  title: string
  body: string
  links: SharedContextLink[]
  contextRecord: SharedContextRecord | null
}

export async function generateSharedContextDailyIntel(input: GenerateDailyIntelInput): Promise<DailyIntelPreview> {
  const since = new Date(Date.now() - input.lookback_hours * 60 * 60 * 1000).toISOString()
  const scopes = buildScopeRefs({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    teamId: input.teamId ?? null,
    userId: input.userId ?? null,
  })
  const scopeKeys = new Set(scopes.map(scopeKey))

  const { data, error } = await supabase
    .from('shared_context_records')
    .select('*, links:shared_context_links(*)')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'active')
    .in('record_type', ['signal', 'feedback', 'decision', 'risk', 'open_question', 'memory'])
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(80)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { fn: 'generateSharedContextDailyIntel', workspaceId: input.workspaceId, scopeType: input.scopeType },
      tags: { layer: 'db', route: 'shared-context' },
    })
  }

  const contextInputs = ((data ?? []) as SharedContextRecord[])
    .map(normalizeSharedContextRecord)
    .filter((record) => isDailyIntelInputInScope(record, input, scopeKeys))
  const commerceInputs = await listRecentCommerceKnowledgeEvidenceEvents({
    orgId: input.workspaceId,
    since,
    projectId: input.scopeType === 'project' || input.scopeType === 'team' ? input.projectId ?? null : null,
    teamId: input.scopeType === 'team' ? input.teamId ?? input.scopeId : null,
    limit: 24,
  })
  const inputs = [...commerceInputs.map((event) => commerceEvidenceToContextRecord(event, input)), ...contextInputs]
    .filter((record) => isDailyIntelInputInScope(record, input, scopeKeys))
    .slice(0, 24)
  const generatedBody = input.body?.trim() || buildDailyIntelBody(inputs, input.lookback_hours)
  const title = input.title?.trim() || `${formatScopeType(input.scopeType)} Daily Intel`
  const links: SharedContextLink[] = inputs.slice(0, 12).map((record) => ({
    target_type: record.source_type === 'commerce_event' && record.source_id ? 'commerce_event' : 'memory',
    target_id: record.source_type === 'commerce_event' && record.source_id ? record.source_id : record.id,
    label: record.title,
    provenance: `${record.record_type} from ${record.scope_type}`,
    observed_at: record.updated_at,
    confidence: record.confidence,
    metadata: { source_record_type: record.record_type, source_scope_type: record.scope_type },
  }))

  if (!input.publish) {
    return { inputs, title, body: generatedBody, links, contextRecord: null }
  }

  const contextRecord = await createSharedContextRecord(input.workspaceId, {
    project_id: input.projectId ?? null,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    record_type: 'daily_intel',
    title,
    body: generatedBody,
    source_type: 'daily_intel',
    source_id: 'manual-generate',
    confidence: 1,
    status: 'active',
    metadata: {
      generated_by: 'manual_daily_intel',
      lookback_hours: input.lookback_hours,
      seed_record_ids: inputs.map((record) => record.id),
    },
    links,
  }, input.userId)

  await supabase
    .from('daily_intel_runs')
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId ?? null,
      status: contextRecord ? 'completed' : 'failed',
      summary: generatedBody.slice(0, 1000),
      context_record_id: contextRecord?.id ?? null,
      error_message: contextRecord ? null : 'Failed to create shared context record',
      completed_at: new Date().toISOString(),
    })

  return { inputs, title, body: generatedBody, links, contextRecord }
}

function commerceEvidenceToContextRecord(
  event: CommerceKnowledgeEvidenceEvent,
  input: GenerateDailyIntelInput,
): SharedContextRecord {
  const metadata = event.metadata
  const projectId = metadataString(metadata, 'project_id') ?? input.projectId ?? null
  const teamId = metadataString(metadata, 'team_id')
  const eventType = metadataString(metadata, 'event_type') ?? 'commerce_event'
  const provider = metadataString(metadata, 'provider') ?? 'commerce'
  const status = metadataString(metadata, 'status')
  const outcome = metadataString(metadata, 'outcome')
  const amount = metadata.amount
  const currency = metadataString(metadata, 'currency')
  const amountLabel = typeof amount === 'number' && currency
    ? `${amount} ${currency.toUpperCase()}`
    : null
  const scopeType: SharedContextScopeType = input.scopeType === 'team' && teamId
    ? 'team'
    : projectId
      ? 'project'
      : 'workspace'
  const scopeId = scopeType === 'team'
    ? teamId!
    : scopeType === 'project'
      ? projectId!
      : input.workspaceId
  const bodyParts = [
    event.output_summary,
    `Provider: ${provider}`,
    status ? `Status: ${status}` : null,
    outcome ? `Outcome: ${outcome}` : null,
    amountLabel ? `Amount: ${amountLabel}` : null,
    metadataString(metadata, 'request_id') ? `Request: ${metadataString(metadata, 'request_id')}` : null,
    metadataString(metadata, 'run_id') ? `Run: ${metadataString(metadata, 'run_id')}` : null,
  ].filter(Boolean)

  return {
    id: event.id,
    workspace_id: input.workspaceId,
    project_id: projectId,
    agent_id: metadataString(metadata, 'assistant_id'),
    scope_type: scopeType,
    scope_id: scopeId,
    record_type: outcome === 'failed' || status === 'failed' ? 'risk' : 'signal',
    title: `Commerce: ${eventType.replace(/[._]/g, ' ')}`,
    body: bodyParts.join('\n'),
    source_type: 'commerce_event',
    source_id: event.commerce_event_id,
    confidence: event.success ? 0.9 : 0.55,
    status: 'active',
    valid_from: null,
    valid_until: null,
    metadata: {
      ...metadata,
      synthetic_daily_intel_input: true,
      knowledge_operation_event_id: event.id,
    },
    links: [{
      target_type: 'commerce_event',
      target_id: event.commerce_event_id,
      label: eventType,
      provenance: 'Agent Commerce lifecycle evidence mirrored into Knowledge',
      observed_at: event.created_at,
      confidence: event.success ? 0.9 : 0.55,
      metadata,
    }],
    created_by: null,
    created_at: event.created_at,
    updated_at: event.created_at,
  }
}

function buildDailyIntelBody(inputs: SharedContextRecord[], lookbackHours: number): string {
  if (inputs.length === 0) {
    return `No new signals, decisions, risks, questions, feedback, or memories were recorded in the last ${lookbackHours} hours.`
  }

  const grouped = new Map<SharedContextRecordType, SharedContextRecord[]>()
  for (const record of inputs) {
    const rows = grouped.get(record.record_type) ?? []
    rows.push(record)
    grouped.set(record.record_type, rows)
  }

  return (['decision', 'risk', 'open_question', 'signal', 'feedback', 'memory'] as SharedContextRecordType[])
    .flatMap((type) => {
      const rows = grouped.get(type)?.slice(0, 6) ?? []
      return rows.map((record) => {
        const confidence = typeof record.confidence === 'number' ? ` confidence=${record.confidence.toFixed(2)}` : ''
        return `- [${type}/${record.scope_type}] ${record.title}${confidence}: ${record.body}`
      })
    })
    .join('\n')
}

function formatScopeType(scopeType: string): string {
  return scopeType.charAt(0).toUpperCase() + scopeType.slice(1)
}
