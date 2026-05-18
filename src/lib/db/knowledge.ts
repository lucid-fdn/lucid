import 'server-only'

import crypto from 'node:crypto'
import type {
  ExplainKnowledgeInput,
  KnowledgeEvidence,
  KnowledgeFederationPolicy,
  KnowledgeRefreshPolicy,
  KnowledgeRefreshStatus,
  KnowledgeRetentionPolicy,
  KnowledgeSource,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  KnowledgeTrustLevel,
  KnowledgeVisibility,
  WriteScopedKnowledgeInput,
} from '@/lib/knowledge/types'
import { supabase, ErrorService } from './client'
import { ingestDocument } from '@/lib/rag/ingest'
import { deleteDocument } from '@/lib/rag/documents'
import { enqueueKnowledgeL2Projection } from './knowledge-l2-projections'
import { knowledgeFeatureFlags } from '@/lib/knowledge/feature-flags'
import {
  buildRedactedKnowledgeL2Payload,
  hashKnowledgeL2Content,
  mapKnowledgeScopeToL2ResourceType,
  resolveKnowledgeL2Identity,
  resolveKnowledgeL2ProjectionPolicy,
} from '@/lib/knowledge/l2-projection-policy'

export type KnowledgeScopeType = 'project' | 'team' | 'org'
export type KnowledgePageStatus = 'active' | 'superseded' | 'archived'

export interface KnowledgePage {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  sourceId: string | null
  scopeType: KnowledgeScopeType
  subject: string
  slug: string
  compiledTruth: string
  status: KnowledgePageStatus
  trustLevel: KnowledgeTrustLevel
  confidence: number
  evidence: KnowledgeEvidence[]
  metadata: Record<string, unknown>
  ragDocumentId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEvent {
  id: string
  pageId: string
  eventType: WriteScopedKnowledgeInput['event']['type'] | 'seeded'
  summary: string
  patch: string | null
  confidence: number | null
  evidence: KnowledgeEvidence[]
  metadata: Record<string, unknown>
  createdAt: string
}

export interface KnowledgeSourceRecord {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  assistantId: string | null
  type: KnowledgeSourceType
  sourceRef: string | null
  label: string | null
  visibility: KnowledgeVisibility
  trustLevel: KnowledgeTrustLevel
  federationPolicy: KnowledgeFederationPolicy
  retentionPolicy: KnowledgeRetentionPolicy
  status: KnowledgeSourceStatus
  includeInRetrieval: boolean
  refreshPolicy: KnowledgeRefreshPolicy
  refreshIntervalSeconds: number | null
  refreshStatus: KnowledgeRefreshStatus
  lastSeenAt: string | null
  lastRefreshedAt: string | null
  nextRefreshAt: string | null
  staleAfter: string | null
  refreshError: string | null
  connectorKey: string | null
  externalEtag: string | null
  sourceKey: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type KnowledgePageRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_id: string | null
  scope_type: KnowledgeScopeType
  subject: string
  slug: string
  compiled_truth: string
  status: KnowledgePageStatus
  trust_level: KnowledgeTrustLevel
  confidence: number | string
  evidence: KnowledgeEvidence[] | null
  metadata: Record<string, unknown> | null
  rag_document_id: string | null
  version: number
  created_at: string
  updated_at: string
}

type KnowledgeEventRow = {
  id: string
  page_id: string
  event_type: KnowledgeEvent['eventType']
  summary: string
  patch: string | null
  confidence: number | string | null
  evidence: KnowledgeEvidence[] | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type KnowledgeSourceRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  assistant_id: string | null
  source_type: KnowledgeSourceType
  source_ref: string | null
  label: string | null
  visibility: KnowledgeVisibility
  trust_level: KnowledgeTrustLevel
  federation_policy: KnowledgeFederationPolicy
  retention_policy: KnowledgeRetentionPolicy
  status?: KnowledgeSourceStatus
  include_in_retrieval?: boolean
  refresh_policy?: KnowledgeRefreshPolicy
  refresh_interval_seconds?: number | null
  refresh_status?: KnowledgeRefreshStatus
  last_seen_at?: string | null
  last_refreshed_at?: string | null
  next_refresh_at?: string | null
  stale_after?: string | null
  refresh_error?: string | null
  connector_key?: string | null
  external_etag?: string | null
  source_key: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const KNOWLEDGE_PAGE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'source_id',
  'scope_type',
  'subject',
  'slug',
  'compiled_truth',
  'status',
  'trust_level',
  'confidence',
  'evidence',
  'metadata',
  'rag_document_id',
  'version',
  'created_at',
  'updated_at',
].join(', ')

const KNOWLEDGE_EVENT_COLUMNS = [
  'id',
  'page_id',
  'event_type',
  'summary',
  'patch',
  'confidence',
  'evidence',
  'metadata',
  'created_at',
].join(', ')

const KNOWLEDGE_SOURCE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'assistant_id',
  'source_type',
  'source_ref',
  'label',
  'visibility',
  'trust_level',
  'federation_policy',
  'retention_policy',
  'status',
  'include_in_retrieval',
  'refresh_policy',
  'refresh_interval_seconds',
  'refresh_status',
  'last_seen_at',
  'last_refreshed_at',
  'next_refresh_at',
  'stale_after',
  'refresh_error',
  'connector_key',
  'external_etag',
  'source_key',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

export async function writeProjectKnowledge(input: WriteScopedKnowledgeInput): Promise<KnowledgePage> {
  if (!input.projectId) {
    throw new Error('projectId is required for project knowledge')
  }
  return writeScopedKnowledge({ ...input, teamId: null }, 'project')
}

export async function writeTeamKnowledge(input: WriteScopedKnowledgeInput): Promise<KnowledgePage> {
  if (!input.teamId) {
    throw new Error('teamId is required for team knowledge')
  }
  return writeScopedKnowledge(input, 'team')
}

export async function listKnowledgePages(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  sourceId?: string | null
  scopeType?: KnowledgeScopeType
  limit?: number
}): Promise<KnowledgePage[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  let query = supabase
    .from('knowledge_pages')
    .select(KNOWLEDGE_PAGE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('status', 'active')

  if (input.scopeType) query = query.eq('scope_type', input.scopeType)
  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.sourceId) query = query.eq('source_id', input.sourceId)

  query = query
    .order('updated_at', { ascending: false })
    .limit(limit)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'listKnowledgePages', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_pages' },
    })
    return []
  }

  return ((data ?? []) as unknown as KnowledgePageRow[]).map(mapKnowledgePage)
}

export async function listKnowledgeSources(input: {
  orgId: string
  sourceId?: string | null
  sourceKey?: string | null
  projectId?: string | null
  teamId?: string | null
  sourceType?: KnowledgeSourceType
  status?: KnowledgeSourceStatus
  includeArchived?: boolean
  dueForRefreshOnly?: boolean
  limit?: number
}): Promise<KnowledgeSourceRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('knowledge_sources')
    .select(KNOWLEDGE_SOURCE_COLUMNS)
    .eq('org_id', input.orgId)

  if (!input.includeArchived) query = query.neq('status', 'archived')
  if (input.sourceId) query = query.eq('id', input.sourceId)
  if (input.sourceKey) query = query.eq('source_key', input.sourceKey)
  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.sourceType) query = query.eq('source_type', input.sourceType)
  if (input.status) query = query.eq('status', input.status)
  if (input.dueForRefreshOnly) {
    query = query
      .eq('include_in_retrieval', true)
      .eq('refresh_policy', 'scheduled')
      .lte('next_refresh_at', new Date().toISOString())
  }

  query = query
    .order(input.dueForRefreshOnly ? 'next_refresh_at' : 'updated_at', { ascending: Boolean(input.dueForRefreshOnly) })
    .limit(limit)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'listKnowledgeSources', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_sources' },
    })
    return []
  }

  return ((data ?? []) as unknown as KnowledgeSourceRow[]).map(mapKnowledgeSource)
}

export async function getKnowledgeSource(input: {
  orgId: string
  sourceId: string
}): Promise<KnowledgeSourceRecord | null> {
  const { data, error } = await supabase
    .from('knowledge_sources')
    .select(KNOWLEDGE_SOURCE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.sourceId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'getKnowledgeSource', orgId: input.orgId, sourceId: input.sourceId },
      tags: { layer: 'database', table: 'knowledge_sources' },
    })
    return null
  }

  return data ? mapKnowledgeSource(data as unknown as KnowledgeSourceRow) : null
}

export async function createKnowledgeSource(source: KnowledgeSource): Promise<KnowledgeSourceRecord | null> {
  const sourceId = await upsertKnowledgeSource(source)
  if (!sourceId) return null
  return getKnowledgeSource({ orgId: source.orgId, sourceId })
}

export async function updateKnowledgeSourcePolicy(input: {
  orgId: string
  sourceId: string
  label?: string | null
  visibility?: KnowledgeVisibility
  trustLevel?: KnowledgeTrustLevel
  federationPolicy?: KnowledgeFederationPolicy
  retentionPolicy?: KnowledgeRetentionPolicy
  status?: KnowledgeSourceStatus
  includeInRetrieval?: boolean
  refreshPolicy?: KnowledgeRefreshPolicy
  refreshIntervalSeconds?: number | null
  staleAfter?: string | null
  connectorKey?: string | null
  externalEtag?: string | null
}): Promise<KnowledgeSourceRecord | null> {
  const patch: Record<string, unknown> = {}
  if (input.label !== undefined) patch.label = input.label
  if (input.visibility !== undefined) patch.visibility = input.visibility
  if (input.trustLevel !== undefined) patch.trust_level = input.trustLevel
  if (input.federationPolicy !== undefined) patch.federation_policy = input.federationPolicy
  if (input.retentionPolicy !== undefined) patch.retention_policy = input.retentionPolicy
  if (input.status !== undefined) patch.status = input.status
  if (input.includeInRetrieval !== undefined) patch.include_in_retrieval = input.includeInRetrieval
  if (input.refreshPolicy !== undefined) patch.refresh_policy = input.refreshPolicy
  if (input.refreshIntervalSeconds !== undefined) patch.refresh_interval_seconds = input.refreshIntervalSeconds
  if (input.staleAfter !== undefined) patch.stale_after = input.staleAfter
  if (input.connectorKey !== undefined) patch.connector_key = input.connectorKey
  if (input.externalEtag !== undefined) patch.external_etag = input.externalEtag

  if (Object.keys(patch).length === 0) {
    return getKnowledgeSource({ orgId: input.orgId, sourceId: input.sourceId })
  }

  const { data, error } = await supabase
    .from('knowledge_sources')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('id', input.sourceId)
    .select(KNOWLEDGE_SOURCE_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge source policy update returned no row'), {
      severity: 'warning',
      context: { operation: 'updateKnowledgeSourcePolicy', orgId: input.orgId, sourceId: input.sourceId },
      tags: { layer: 'database', table: 'knowledge_sources' },
    })
    return null
  }

  return mapKnowledgeSource(data as unknown as KnowledgeSourceRow)
}

export async function markKnowledgeSourceRefresh(input: {
  orgId: string
  sourceId: string
  status: KnowledgeRefreshStatus
  error?: string | null
  externalEtag?: string | null
  nextRefreshAt?: string | null
  staleAfter?: string | null
}): Promise<KnowledgeSourceRecord | null> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    refresh_status: input.status,
    last_seen_at: now,
    refresh_error: input.error ?? null,
  }

  if (input.status === 'pending') {
    patch.next_refresh_at = input.nextRefreshAt ?? now
  } else {
    patch.last_refreshed_at = now
    patch.next_refresh_at = input.nextRefreshAt ?? null
  }
  if (input.status === 'failed') patch.status = 'errored'
  if (input.status === 'ok') patch.status = 'active'
  if (input.externalEtag !== undefined) patch.external_etag = input.externalEtag
  if (input.staleAfter !== undefined) patch.stale_after = input.staleAfter

  const { data, error } = await supabase
    .from('knowledge_sources')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('id', input.sourceId)
    .select(KNOWLEDGE_SOURCE_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge source refresh update returned no row'), {
      severity: 'warning',
      context: { operation: 'markKnowledgeSourceRefresh', orgId: input.orgId, sourceId: input.sourceId },
      tags: { layer: 'database', table: 'knowledge_sources' },
    })
    return null
  }

  return mapKnowledgeSource(data as unknown as KnowledgeSourceRow)
}

export async function updateKnowledgePageManual(input: {
  orgId: string
  pageId: string
  subject?: string
  compiledTruth?: string
  trustLevel?: KnowledgeTrustLevel
  confidence?: number
  evidence?: KnowledgeEvidence[]
  eventSummary?: string
}): Promise<KnowledgePage | null> {
  const { data: currentRow, error: loadError } = await supabase
    .from('knowledge_pages')
    .select(KNOWLEDGE_PAGE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.pageId)
    .maybeSingle()

  if (loadError || !currentRow) {
    if (loadError) {
      ErrorService.captureException(loadError, {
        severity: 'warning',
        context: { operation: 'updateKnowledgePageManual.load', orgId: input.orgId, pageId: input.pageId },
        tags: { layer: 'database', table: 'knowledge_pages' },
      })
    }
    return null
  }

  const current = mapKnowledgePage(currentRow as unknown as KnowledgePageRow)
  const nextSubject = input.subject?.trim() || current.subject
  const nextTruth = input.compiledTruth?.trim() || current.compiledTruth
  const contentHash = hashContent(`${nextSubject}\n${nextTruth}`)
  const patch = {
    subject: nextSubject,
    slug: slugify(nextSubject),
    compiled_truth: nextTruth,
    trust_level: input.trustLevel ?? current.trustLevel,
    confidence: input.confidence ?? current.confidence,
    content_hash: contentHash,
    evidence: input.evidence ?? current.evidence,
    metadata: {
      ...current.metadata,
      manualUpdate: {
        at: new Date().toISOString(),
        summary: input.eventSummary ?? 'Operator updated knowledge.',
      },
    },
    version: current.version + 1,
    status: 'active' as const,
  }

  const { data, error } = await supabase
    .from('knowledge_pages')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('id', input.pageId)
    .select(KNOWLEDGE_PAGE_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge page manual update returned no row'), {
      severity: 'warning',
      context: { operation: 'updateKnowledgePageManual.update', orgId: input.orgId, pageId: input.pageId },
      tags: { layer: 'database', table: 'knowledge_pages' },
    })
    return null
  }

  const page = mapKnowledgePage(data as unknown as KnowledgePageRow)
  const sourceId = page.sourceId
  const source: KnowledgeSource = {
    type: 'manual',
    orgId: page.orgId,
    projectId: page.projectId,
    teamId: page.teamId,
    label: 'Manual knowledge update',
    visibility: page.teamId ? 'team' : page.projectId ? 'project' : 'org',
    trustLevel: page.trustLevel,
    federationPolicy: 'source_scoped',
    retentionPolicy: 'standard',
  }
  const eventInput: WriteScopedKnowledgeInput = {
    orgId: page.orgId,
    projectId: page.projectId,
    teamId: page.teamId,
    source,
    subject: page.subject,
    compiledTruthPatch: page.compiledTruth,
    event: {
      type: 'corrected',
      summary: input.eventSummary ?? 'Operator updated knowledge.',
      confidence: page.confidence,
    },
    evidence: page.evidence,
  }
  const event = await insertKnowledgeEvent(page, sourceId, eventInput)
  await insertKnowledgeVersion(page, event.id, contentHash)
  const ragDocumentId = await syncKnowledgePageToRag(page)
  const updatedPage = ragDocumentId && ragDocumentId !== page.ragDocumentId
    ? { ...page, ragDocumentId }
    : page

  if (ragDocumentId && ragDocumentId !== page.ragDocumentId) {
    await supabase.from('knowledge_pages').update({ rag_document_id: ragDocumentId }).eq('id', page.id)
  }

  enqueueKnowledgePageL2Projection({
    page: updatedPage,
    input: eventInput,
    sourceId,
    eventId: event.id,
    contentHash,
    scopeType: page.scopeType,
  })

  return updatedPage
}

export async function archiveKnowledgePage(input: {
  orgId: string
  pageId: string
  reason?: string
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('knowledge_pages')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('org_id', input.orgId)
    .eq('id', input.pageId)
    .select(KNOWLEDGE_PAGE_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge page archive returned no row'), {
      severity: 'warning',
      context: { operation: 'archiveKnowledgePage', orgId: input.orgId, pageId: input.pageId },
      tags: { layer: 'database', table: 'knowledge_pages' },
    })
    return false
  }

  const page = mapKnowledgePage(data as unknown as KnowledgePageRow)
  await insertKnowledgeEvent(page, page.sourceId, {
    orgId: page.orgId,
    projectId: page.projectId,
    teamId: page.teamId,
    source: {
      type: 'manual',
      orgId: page.orgId,
      projectId: page.projectId,
      teamId: page.teamId,
      label: 'Manual archive',
      visibility: page.teamId ? 'team' : page.projectId ? 'project' : 'org',
      trustLevel: page.trustLevel,
      federationPolicy: 'source_scoped',
      retentionPolicy: 'standard',
    },
    subject: page.subject,
    compiledTruthPatch: page.compiledTruth,
    event: {
      type: 'archived',
      summary: input.reason ?? 'Operator archived knowledge.',
      confidence: page.confidence,
    },
    evidence: page.evidence,
  })

  return true
}

export async function explainKnowledge(input: ExplainKnowledgeInput): Promise<{
  page: KnowledgePage | null
  source: KnowledgeSourceRecord | null
  events: KnowledgeEvent[]
  versions: Array<{ id: string; versionNumber: number; createdAt: string }>
}> {
  const { data: pageData, error: pageError } = await supabase
    .from('knowledge_pages')
    .select(KNOWLEDGE_PAGE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.knowledgeId)
    .maybeSingle()

  if (pageError) {
    ErrorService.captureException(pageError, {
      severity: 'warning',
      context: { operation: 'explainKnowledge', orgId: input.orgId, knowledgeId: input.knowledgeId },
      tags: { layer: 'database', table: 'knowledge_pages' },
    })
    return { page: null, source: null, events: [], versions: [] }
  }

  const page = pageData ? mapKnowledgePage(pageData as unknown as KnowledgePageRow) : null
  if (!page) return { page: null, source: null, events: [], versions: [] }

  const [eventsResult, versionsResult, sourceResult] = await Promise.all([
    input.includeTimeline === false
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('knowledge_events')
          .select(KNOWLEDGE_EVENT_COLUMNS)
          .eq('page_id', page.id)
          .order('created_at', { ascending: false })
          .limit(50),
    supabase
      .from('knowledge_versions')
      .select('id, version_number, created_at')
      .eq('page_id', page.id)
      .order('version_number', { ascending: false })
      .limit(20),
    page.sourceId
      ? supabase
          .from('knowledge_sources')
          .select(KNOWLEDGE_SOURCE_COLUMNS)
          .eq('org_id', input.orgId)
          .eq('id', page.sourceId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  return {
    page,
    source: sourceResult.data ? mapKnowledgeSource(sourceResult.data as unknown as KnowledgeSourceRow) : null,
    events: ((eventsResult.data ?? []) as unknown as KnowledgeEventRow[]).map(mapKnowledgeEvent),
    versions: ((versionsResult.data ?? []) as Array<{ id: string; version_number: number; created_at: string }>).map((row) => ({
      id: row.id,
      versionNumber: row.version_number,
      createdAt: row.created_at,
    })),
  }
}

export async function seedTeamKnowledgeFromCrew(input: {
  orgId: string
  teamId: string
  actorUserId?: string | null
}): Promise<KnowledgePage[]> {
  const { data: crew, error: crewError } = await supabase
    .from('crews')
    .select('id, org_id, project_id, name, description, objective, status, topology_enforced, cost_limit_per_run_usd')
    .eq('org_id', input.orgId)
    .eq('id', input.teamId)
    .is('deleted_at', null)
    .maybeSingle()
  if (crewError || !crew) return []

  const [{ data: members }, { data: edges }, { data: runs }] = await Promise.all([
    supabase
      .from('crew_members')
      .select('id, role, role_description, is_coordinator, assistant_id')
      .eq('crew_id', input.teamId)
      .order('join_order', { ascending: true }),
    supabase
      .from('crew_edges')
      .select('id, source_member_id, target_member_id, direction, label')
      .eq('crew_id', input.teamId),
    supabase
      .from('crew_runs')
      .select('id, status, outcome_summary, error_message, completed_at, created_at')
      .eq('crew_id', input.teamId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const memberLines = (members ?? []).map((member: Record<string, unknown>) => {
    const coordinator = member.is_coordinator ? ' (coordinator)' : ''
    return `- ${String(member.role)}${coordinator}${member.role_description ? `: ${String(member.role_description)}` : ''}`
  })
  const edgeLines = (edges ?? []).map((edge: Record<string, unknown>) =>
    `- ${String(edge.source_member_id).slice(0, 8)} -> ${String(edge.target_member_id).slice(0, 8)} (${String(edge.direction)}${edge.label ? `, ${String(edge.label)}` : ''})`,
  )
  const runLines = (runs ?? [])
    .filter((run: Record<string, unknown>) => run.outcome_summary || run.error_message)
    .map((run: Record<string, unknown>) => `- ${String(run.status)}: ${String(run.outcome_summary ?? run.error_message)}`)

  const baseSource = buildSource({
    orgId: input.orgId,
    projectId: crew.project_id ?? null,
    teamId: input.teamId,
    type: 'team',
    label: `Team: ${crew.name}`,
    trustLevel: 'observed',
  })

  const pages: KnowledgePage[] = []
  pages.push(await writeTeamKnowledge({
    orgId: input.orgId,
    projectId: crew.project_id ?? null,
    teamId: input.teamId,
    source: baseSource,
    subject: 'How this team works',
    compiledTruthPatch: [
      `Team: ${crew.name}`,
      crew.description ? `Description: ${crew.description}` : null,
      `Objective: ${crew.objective}`,
      `Status: ${crew.status}`,
      `Topology: ${crew.topology_enforced ? 'enforced' : 'open'}`,
      crew.cost_limit_per_run_usd ? `Cost limit per run: $${crew.cost_limit_per_run_usd}` : null,
      '',
      'Members:',
      memberLines.length ? memberLines.join('\n') : '- No members recorded yet.',
    ].filter(Boolean).join('\n'),
    event: { type: 'created', summary: 'Seeded team operating knowledge from crew configuration.', confidence: 0.85 },
    evidence: [{ kind: 'run', label: 'Crew configuration', runId: null }],
  }))

  pages.push(await writeTeamKnowledge({
    orgId: input.orgId,
    projectId: crew.project_id ?? null,
    teamId: input.teamId,
    source: baseSource,
    subject: 'Handoffs',
    compiledTruthPatch: edgeLines.length ? edgeLines.join('\n') : 'No explicit team handoffs are recorded yet.',
    event: { type: 'created', summary: 'Seeded team handoff knowledge from crew topology.', confidence: 0.8 },
    evidence: [{ kind: 'run', label: 'Crew topology', runId: null }],
  }))

  if (runLines.length > 0) {
    pages.push(await writeTeamKnowledge({
      orgId: input.orgId,
      projectId: crew.project_id ?? null,
      teamId: input.teamId,
      source: baseSource,
      subject: 'Recent decisions and outcomes',
      compiledTruthPatch: runLines.join('\n'),
      event: { type: 'created', summary: 'Seeded team knowledge from recent crew run outcomes.', confidence: 0.7 },
      evidence: (runs ?? []).slice(0, 5).map((run: Record<string, unknown>) => ({
        kind: 'run',
        runId: String(run.id),
        label: `Crew run ${String(run.status)}`,
      })),
    }))
  }

  return pages
}

export async function seedProjectKnowledgeFromAgentOps(input: {
  orgId: string
  projectId: string
  actorUserId?: string | null
}): Promise<KnowledgePage[]> {
  const [{ data: learnings }, { data: timeline }, { data: runs }, { data: boardMemory }] = await Promise.all([
    supabase
      .from('project_learnings')
      .select('id, title, body, learning_type, trust_level, confidence, source_kind, source_ref, updated_at')
      .eq('org_id', input.orgId)
      .eq('project_id', input.projectId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(12),
    supabase
      .from('project_timeline_events')
      .select('id, event_type, title, body, evidence, created_at')
      .eq('org_id', input.orgId)
      .eq('project_id', input.projectId)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('agent_ops_runs')
      .select('id, workflow_id, status, output, error_message, completed_at, created_at')
      .eq('org_id', input.orgId)
      .eq('project_id', input.projectId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('org_board_memory')
      .select('id, content, category, importance, source, created_at')
      .eq('org_id', input.orgId)
      .eq('is_archived', false)
      .in('category', ['policy', 'context'])
      .not('content', 'is', null)
      .order('importance', { ascending: false })
      .limit(8),
  ])

  const source = buildSource({
    orgId: input.orgId,
    projectId: input.projectId,
    type: 'agent_ops',
    label: 'Agent Ops project history',
    trustLevel: 'observed',
  })

  const pages: KnowledgePage[] = []
  if ((learnings ?? []).length > 0) {
    pages.push(await writeProjectKnowledge({
      orgId: input.orgId,
      projectId: input.projectId,
      source,
      subject: 'What we know',
      compiledTruthPatch: (learnings ?? []).map((learning: Record<string, unknown>) =>
        `- ${String(learning.title)}: ${String(learning.body)}`,
      ).join('\n'),
      event: { type: 'created', summary: 'Seeded project knowledge from approved project learnings.', confidence: 0.82 },
      evidence: (learnings ?? []).slice(0, 8).map((learning: Record<string, unknown>) => ({
        kind: 'run',
        label: String(learning.title),
        artifactId: String(learning.id),
      })),
    }))
  }

  if ((timeline ?? []).length > 0) {
    pages.push(await writeProjectKnowledge({
      orgId: input.orgId,
      projectId: input.projectId,
      source,
      subject: 'Recent decisions',
      compiledTruthPatch: (timeline ?? []).map((event: Record<string, unknown>) =>
        `- ${String(event.event_type)}: ${String(event.title)}${event.body ? ` — ${String(event.body)}` : ''}`,
      ).join('\n'),
      event: { type: 'created', summary: 'Seeded project decisions from the project timeline.', confidence: 0.78 },
      evidence: (timeline ?? []).slice(0, 8).map((event: Record<string, unknown>) => ({
        kind: 'run',
        label: String(event.title),
        artifactId: String(event.id),
      })),
    }))
  }

  if ((runs ?? []).length > 0) {
    pages.push(await writeProjectKnowledge({
      orgId: input.orgId,
      projectId: input.projectId,
      source,
      subject: 'Evidence',
      compiledTruthPatch: (runs ?? []).map((run: Record<string, unknown>) =>
        `- ${String(run.workflow_id)} ${String(run.status)}: ${summarizeRunOutput(run.output) || String(run.error_message ?? 'No summary recorded.')}`,
      ).join('\n'),
      event: { type: 'created', summary: 'Seeded project evidence from recent Agent Ops runs.', confidence: 0.72 },
      evidence: (runs ?? []).slice(0, 8).map((run: Record<string, unknown>) => ({
        kind: 'run',
        runId: String(run.id),
        label: `${String(run.workflow_id)} ${String(run.status)}`,
      })),
    }))
  }

  if ((boardMemory ?? []).length > 0) {
    pages.push(await writeProjectKnowledge({
      orgId: input.orgId,
      projectId: input.projectId,
      source: buildSource({
        orgId: input.orgId,
        projectId: input.projectId,
        type: 'board_memory',
        label: 'Org board memory',
        trustLevel: 'observed',
      }),
      subject: 'Org policy context',
      compiledTruthPatch: (boardMemory ?? []).map((memory: Record<string, unknown>) =>
        `- ${String(memory.category)}: ${String(memory.content)}`,
      ).join('\n'),
      event: { type: 'created', summary: 'Seeded project knowledge from safe org board memory policy/context rows.', confidence: 0.7 },
      evidence: (boardMemory ?? []).map((memory: Record<string, unknown>) => ({
        kind: 'message',
        messageId: String(memory.id),
        label: `Board memory ${String(memory.category)}`,
      })),
    }))
  }

  return pages
}

async function writeScopedKnowledge(
  input: WriteScopedKnowledgeInput,
  scopeType: KnowledgeScopeType,
): Promise<KnowledgePage> {
  const slug = slugify(input.subject)
  const compiledTruth = input.compiledTruthPatch.trim()
  if (!compiledTruth) throw new Error('compiledTruthPatch cannot be empty')

  const contentHash = hashContent(`${input.subject}\n${compiledTruth}`)
  const sourceId = await upsertKnowledgeSource(input.source)
  const existing = await findExistingPage({
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    teamId: input.teamId ?? null,
    scopeType,
    slug,
  })
  const nextVersion = (existing?.version ?? 0) + 1

  const row = {
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    team_id: input.teamId ?? null,
    source_id: sourceId,
    scope_type: scopeType,
    subject: input.subject.trim(),
    slug,
    compiled_truth: compiledTruth,
    status: 'active',
    trust_level: input.source.trustLevel,
    confidence: input.event.confidence ?? 0.7,
    content_hash: contentHash,
    evidence: input.evidence,
    metadata: { source: input.source, event: input.event },
    version: nextVersion,
  }

  const { data, error } = existing
    ? await supabase
        .from('knowledge_pages')
        .update(row)
        .eq('id', existing.id)
        .select(KNOWLEDGE_PAGE_COLUMNS)
        .single()
    : await supabase
        .from('knowledge_pages')
        .insert(row)
        .select(KNOWLEDGE_PAGE_COLUMNS)
        .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge page write returned no row'), {
      severity: 'error',
      context: { operation: 'writeScopedKnowledge', orgId: input.orgId, scopeType },
      tags: { layer: 'database', table: 'knowledge_pages' },
    })
    throw error ?? new Error('Knowledge page write returned no row')
  }

  const page = mapKnowledgePage(data as unknown as KnowledgePageRow)
  const event = await insertKnowledgeEvent(page, sourceId, input)
  await insertKnowledgeVersion(page, event.id, contentHash)
  const ragDocumentId = await syncKnowledgePageToRag(page)

  if (ragDocumentId && ragDocumentId !== page.ragDocumentId) {
    const { data: updated } = await supabase
      .from('knowledge_pages')
      .update({ rag_document_id: ragDocumentId })
      .eq('id', page.id)
      .select(KNOWLEDGE_PAGE_COLUMNS)
      .single()
    const updatedPage = updated ? mapKnowledgePage(updated as unknown as KnowledgePageRow) : { ...page, ragDocumentId }
    enqueueKnowledgePageL2Projection({ page: updatedPage, input, sourceId, eventId: event.id, contentHash, scopeType })
    return updatedPage
  }

  enqueueKnowledgePageL2Projection({ page, input, sourceId, eventId: event.id, contentHash, scopeType })
  return page
}

function enqueueKnowledgePageL2Projection(input: {
  page: KnowledgePage
  input: WriteScopedKnowledgeInput
  sourceId: string | null
  eventId: string
  contentHash: string
  scopeType: KnowledgeScopeType
}): void {
  const resourceType = mapKnowledgeScopeToL2ResourceType({ scopeType: input.scopeType })
  const projectionPolicy = resolveKnowledgeL2ProjectionPolicy({
    enabled: knowledgeFeatureFlags.l2Projection,
    resourceType,
    visibility: input.input.source.visibility,
    trustLevel: input.input.source.trustLevel,
    federationPolicy: input.input.source.federationPolicy,
    retentionPolicy: input.input.source.retentionPolicy,
  })
  if (projectionPolicy === 'disabled') return

  const identity = resolveKnowledgeL2Identity({
    orgId: input.page.orgId,
    projectId: input.page.projectId,
    teamId: input.page.teamId,
    assistantId: input.input.source.assistantId ?? null,
    scopedUserId: input.input.source.scopedUserId ?? null,
    agentPassportId: input.input.source.agentPassportId ?? null,
    resourceType,
    channelType: input.input.source.channelType ?? null,
    channelId: input.input.source.channelId ?? null,
    conversationId: input.input.source.conversationId ?? null,
  })
  const projectionContentHash = hashKnowledgeL2Content({
    pageId: input.page.id,
    subject: input.page.subject,
    compiledTruthHash: input.contentHash,
    version: input.page.version,
    evidence: input.page.evidence,
  })

  void enqueueKnowledgeL2Projection({
    orgId: input.page.orgId,
    projectId: input.page.projectId,
    teamId: input.page.teamId,
    assistantId: input.input.source.assistantId ?? null,
    sourceId: input.sourceId,
    pageId: input.page.id,
    eventId: input.eventId,
    localResourceType: resourceType,
    localResourceId: input.page.id,
    projectionPolicy,
    namespace: identity.namespace,
    scopedUserId: identity.scopedUserId,
    agentPassportId: identity.agentPassportId,
    channelType: identity.channelType,
    channelId: identity.channelId,
    conversationId: identity.conversationId,
    contentHash: projectionContentHash,
    payloadRedacted: buildRedactedKnowledgeL2Payload({
      resourceType,
      subject: input.page.subject,
      scopeType: input.scopeType,
      source: input.input.source,
      eventSummary: input.input.event.summary,
      evidenceCount: input.page.evidence.length,
      contentHash: projectionContentHash,
    }),
    metadata: {
      localContentHash: input.contentHash,
      localVersion: input.page.version,
      l2BridgeVersion: '2026-05-06.knowledge-l2-projection.v1',
    },
  }).catch((error) => {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'enqueueKnowledgePageL2Projection', orgId: input.page.orgId, pageId: input.page.id },
      tags: { layer: 'database', table: 'knowledge_l2_projection_outbox' },
    })
  })
}

async function upsertKnowledgeSource(source: KnowledgeSource): Promise<string | null> {
  const sourceKey = buildSourceKey(source)
  const { data, error } = await supabase
    .from('knowledge_sources')
    .upsert({
      org_id: source.orgId,
      project_id: source.projectId ?? null,
      team_id: source.teamId ?? null,
      assistant_id: source.assistantId ?? null,
      source_type: source.type,
      source_ref: source.id ?? source.url ?? source.externalMessageId ?? null,
      label: source.label ?? null,
      visibility: source.visibility,
      trust_level: source.trustLevel,
      federation_policy: source.federationPolicy ?? 'source_scoped',
      retention_policy: source.retentionPolicy ?? 'standard',
      status: 'active',
      include_in_retrieval: source.includeInRetrieval ?? true,
      refresh_policy: source.refreshPolicy ?? (source.type === 'url' || source.type === 'repo' || source.type === 'file' ? 'on_change' : 'manual'),
      refresh_interval_seconds: source.refreshIntervalSeconds ?? null,
      refresh_status: 'never',
      last_seen_at: new Date().toISOString(),
      source_key: sourceKey,
      metadata: source,
    }, { onConflict: 'org_id,source_key' })
    .select('id')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'upsertKnowledgeSource', orgId: source.orgId, sourceKey },
      tags: { layer: 'database', table: 'knowledge_sources' },
    })
    return null
  }

  return data?.id ?? null
}

async function findExistingPage(input: {
  orgId: string
  projectId: string | null
  teamId: string | null
  scopeType: KnowledgeScopeType
  slug: string
}): Promise<KnowledgePage | null> {
  let query = supabase
    .from('knowledge_pages')
    .select(KNOWLEDGE_PAGE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('scope_type', input.scopeType)
    .eq('slug', input.slug)
    .eq('status', 'active')

  if (input.scopeType === 'project') query = query.eq('project_id', input.projectId)
  if (input.scopeType === 'team') query = query.eq('team_id', input.teamId)

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return mapKnowledgePage(data as unknown as KnowledgePageRow)
}

async function insertKnowledgeEvent(
  page: KnowledgePage,
  sourceId: string | null,
  input: WriteScopedKnowledgeInput,
): Promise<KnowledgeEvent> {
  const { data, error } = await supabase
    .from('knowledge_events')
    .insert({
      org_id: page.orgId,
      project_id: page.projectId,
      team_id: page.teamId,
      page_id: page.id,
      source_id: sourceId,
      event_type: input.event.type,
      summary: input.event.summary,
      patch: input.compiledTruthPatch,
      confidence: input.event.confidence ?? null,
      evidence: input.evidence,
      metadata: { source: input.source },
    })
    .select(KNOWLEDGE_EVENT_COLUMNS)
    .single()

  if (error || !data) throw error ?? new Error('Knowledge event write returned no row')
  return mapKnowledgeEvent(data as unknown as KnowledgeEventRow)
}

async function insertKnowledgeVersion(
  page: KnowledgePage,
  eventId: string,
  contentHash: string,
): Promise<void> {
  const { error } = await supabase
    .from('knowledge_versions')
    .insert({
      org_id: page.orgId,
      page_id: page.id,
      event_id: eventId,
      version_number: page.version,
      compiled_truth: page.compiledTruth,
      content_hash: contentHash,
    })

  if (error && error.code !== '23505') {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'insertKnowledgeVersion', pageId: page.id },
      tags: { layer: 'database', table: 'knowledge_versions' },
    })
  }
}

async function syncKnowledgePageToRag(page: KnowledgePage): Promise<string | null> {
  if (page.ragDocumentId) {
    await deleteDocument(page.ragDocumentId, page.orgId).catch(() => undefined)
  }

  const result = await ingestDocument({
    orgId: page.orgId,
    projectId: page.projectId ?? undefined,
    userId: '00000000-0000-0000-0000-000000000000',
    title: `Knowledge: ${page.subject}`,
    content: page.compiledTruth,
    scope: 'org',
    sourceType: 'api',
    metadata: {
      source: 'knowledge_page',
      knowledgePageId: page.id,
      scopeType: page.scopeType,
      teamId: page.teamId,
      trustLevel: page.trustLevel,
      version: page.version,
    },
  }).catch((error) => {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'syncKnowledgePageToRag', pageId: page.id },
      tags: { layer: 'database', table: 'rag_documents' },
    })
    return null
  })

  return result?.status === 'ready' ? result.documentId : null
}

function mapKnowledgePage(row: KnowledgePageRow): KnowledgePage {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    sourceId: row.source_id,
    scopeType: row.scope_type,
    subject: row.subject,
    slug: row.slug,
    compiledTruth: row.compiled_truth,
    status: row.status,
    trustLevel: row.trust_level,
    confidence: Number(row.confidence),
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    metadata: row.metadata ?? {},
    ragDocumentId: row.rag_document_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapKnowledgeEvent(row: KnowledgeEventRow): KnowledgeEvent {
  return {
    id: row.id,
    pageId: row.page_id,
    eventType: row.event_type,
    summary: row.summary,
    patch: row.patch,
    confidence: row.confidence == null ? null : Number(row.confidence),
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSourceRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    assistantId: row.assistant_id,
    type: row.source_type,
    sourceRef: row.source_ref,
    label: row.label,
    visibility: row.visibility,
    trustLevel: row.trust_level,
    federationPolicy: row.federation_policy,
    retentionPolicy: row.retention_policy,
    status: row.status ?? 'active',
    includeInRetrieval: row.include_in_retrieval ?? true,
    refreshPolicy: row.refresh_policy ?? 'manual',
    refreshIntervalSeconds: row.refresh_interval_seconds ?? null,
    refreshStatus: row.refresh_status ?? 'never',
    lastSeenAt: row.last_seen_at ?? null,
    lastRefreshedAt: row.last_refreshed_at ?? null,
    nextRefreshAt: row.next_refresh_at ?? null,
    staleAfter: row.stale_after ?? null,
    refreshError: row.refresh_error ?? null,
    connectorKey: row.connector_key ?? null,
    externalEtag: row.external_etag ?? null,
    sourceKey: row.source_key,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildSource(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  type: KnowledgeSource['type']
  label: string
  trustLevel: KnowledgeTrustLevel
}): KnowledgeSource {
  return {
    type: input.type,
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    teamId: input.teamId ?? null,
    label: input.label,
    visibility: input.teamId ? 'team' : input.projectId ? 'project' : 'org',
    trustLevel: input.trustLevel,
    federationPolicy: 'source_scoped',
    retentionPolicy: 'standard',
  }
}

function buildSourceKey(source: KnowledgeSource): string {
  return hashContent([
    source.type,
    source.id ?? '',
    source.projectId ?? '',
    source.teamId ?? '',
    source.assistantId ?? '',
    source.channelType ?? '',
    source.channelId ?? '',
    source.conversationId ?? '',
    source.externalMessageId ?? '',
    source.url ?? '',
    source.label ?? '',
  ].join('|'))
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex')
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'knowledge'
}

function summarizeRunOutput(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null
  const record = output as Record<string, unknown>
  const summary = record.summary ?? record.final_summary ?? record.result
  return typeof summary === 'string' ? summary : null
}
