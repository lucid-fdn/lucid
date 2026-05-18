import 'server-only'

import crypto from 'node:crypto'

import type {
  CreateKnowledgeClaimInput,
  KnowledgeClaim,
  KnowledgeClaimEmbeddingStatus,
  KnowledgeClaimEvidence,
  KnowledgeClaimEvent,
  KnowledgeClaimExplanation,
  KnowledgeClaimEvidenceRow,
  KnowledgeClaimResolvedOutcome,
  KnowledgeClaimStatus,
  KnowledgeClaimType,
} from '@contracts/knowledge-claims'
import { DEFAULT_EMBEDDING_MODEL, generateEmbedding } from '@/lib/ai/embeddings'
import { ErrorService, supabase } from './client'

const CLAIM_BASE_COLUMN_LIST = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'assistant_id',
  'source_id',
  'page_id',
  'claim_type',
  'subject',
  'claim',
  'holder_type',
  'holder_id',
  'confidence',
  'weight',
  'status',
  'valid_from',
  'valid_until',
  'resolved_outcome',
  'resolved_at',
  'superseded_by',
  'embedding_status',
  'embedding_model',
  'embedding_provider_id',
  'semantic_fingerprint',
  'semantic_cluster_key',
  'evidence',
  'metadata',
  'created_at',
  'updated_at',
]

const CLAIM_METRIC_COLUMN_LIST = [
  'claim_metric',
  'claim_value',
  'claim_unit',
  'claim_period',
  'observed_at',
]

const CLAIM_BASE_COLUMNS = CLAIM_BASE_COLUMN_LIST.join(', ')
const CLAIM_COLUMNS = [
  ...CLAIM_BASE_COLUMN_LIST.slice(0, CLAIM_BASE_COLUMN_LIST.indexOf('resolved_outcome')),
  ...CLAIM_METRIC_COLUMN_LIST,
  ...CLAIM_BASE_COLUMN_LIST.slice(CLAIM_BASE_COLUMN_LIST.indexOf('resolved_outcome')),
].join(', ')

type ClaimRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  assistant_id: string | null
  source_id: string | null
  page_id: string | null
  claim_type: KnowledgeClaimType
  subject: string
  claim: string
  holder_type: KnowledgeClaim['holderType']
  holder_id: string | null
  confidence: number | string
  weight: number | string
  status: KnowledgeClaimStatus
  valid_from: string | null
  valid_until: string | null
  claim_metric?: string | null
  claim_value?: number | string | null
  claim_unit?: string | null
  claim_period?: string | null
  observed_at?: string | null
  resolved_outcome: KnowledgeClaimResolvedOutcome | null
  resolved_at: string | null
  superseded_by: string | null
  embedding_status: KnowledgeClaimEmbeddingStatus | null
  embedding_model: string | null
  embedding_provider_id: string | null
  semantic_fingerprint: string | null
  semantic_cluster_key: string | null
  evidence: KnowledgeClaimEvidence[] | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ClaimEvidenceRow = {
  id: string
  org_id: string
  claim_id: string
  evidence_kind: KnowledgeClaimEvidence['kind']
  evidence_ref: string | null
  artifact_id: string | null
  run_id: string | null
  url: string | null
  label: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type ClaimEventRow = {
  id: string
  org_id: string
  claim_id: string
  event_type: KnowledgeClaimEvent['eventType']
  summary: string
  patch: Record<string, unknown> | null
  evidence: KnowledgeClaimEvidence[] | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function createKnowledgeClaim(input: CreateKnowledgeClaimInput): Promise<KnowledgeClaim> {
  const sourceHash = hashClaim(input)
  const semantic = await buildClaimSemanticFields(input)
  let effectiveCreatedByUserId = input.createdByUserId ?? null
  const payload = buildClaimInsertPayload({ input, sourceHash, semantic, createdByUserId: effectiveCreatedByUserId })
  let { data, error } = await supabase
    .from('knowledge_claims')
    .insert(payload)
    .select(CLAIM_COLUMNS)
    .single()

  if (isKnowledgeClaimMetricColumnMissing(error)) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        claimType: input.claimType,
        operation: 'createKnowledgeClaim',
        fallback: 'legacy_claim_metric_columns_not_migrated',
      },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    const retry = await supabase
      .from('knowledge_claims')
      .insert(stripMetricColumns(payload))
      .select(CLAIM_BASE_COLUMNS)
      .single()
    data = retry.data
    error = retry.error
  }

  if (isCreatedByUserForeignKeyError(error) && effectiveCreatedByUserId) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        claimType: input.claimType,
        operation: 'createKnowledgeClaim',
        fallback: 'drop_invalid_created_by_user_id',
      },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    effectiveCreatedByUserId = null
    const retryPayload = buildClaimInsertPayload({
      input: {
        ...input,
        metadata: {
          ...(input.metadata ?? {}),
          provenanceActorUserId: input.createdByUserId,
        },
      },
      sourceHash,
      semantic,
      createdByUserId: null,
    })
    const retry = await supabase
      .from('knowledge_claims')
      .insert(retryPayload)
      .select(CLAIM_COLUMNS)
      .single()
    data = retry.data
    error = retry.error
    if (isKnowledgeClaimMetricColumnMissing(error)) {
      const legacyRetry = await supabase
        .from('knowledge_claims')
        .insert(stripMetricColumns(retryPayload))
        .select(CLAIM_BASE_COLUMNS)
        .single()
      data = legacyRetry.data
      error = legacyRetry.error
    }
  }

  if (error) {
    if (error.code === '23505') {
      const existing = await getActiveKnowledgeClaimBySourceHash(input.orgId, sourceHash)
      if (existing) return existing
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, claimType: input.claimType, operation: 'createKnowledgeClaim' },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    throw error
  }

  const claim = mapClaim(data as unknown as ClaimRow)
  await Promise.all([
    recordKnowledgeClaimEvent({
      orgId: claim.orgId,
      claimId: claim.id,
      eventType: 'created',
      summary: 'Knowledge claim created.',
      evidence: claim.evidence,
      actorUserId: effectiveCreatedByUserId,
      actorAgentId: input.createdByAgentId ?? null,
    }),
    insertClaimEvidenceRows(claim),
  ])
  return claim
}

function buildClaimInsertPayload(input: {
  input: CreateKnowledgeClaimInput
  sourceHash: string
  semantic: Awaited<ReturnType<typeof buildClaimSemanticFields>>
  createdByUserId: string | null
}): Record<string, unknown> {
  return {
    org_id: input.input.orgId,
    project_id: input.input.projectId ?? null,
    team_id: input.input.teamId ?? null,
    assistant_id: input.input.assistantId ?? null,
    source_id: input.input.sourceId ?? null,
    page_id: input.input.pageId ?? null,
    claim_type: input.input.claimType,
    subject: input.input.subject,
    claim: input.input.claim,
    holder_type: input.input.holderType,
    holder_id: input.input.holderId ?? null,
    confidence: input.input.confidence,
    weight: input.input.weight,
    status: input.input.status ?? 'active',
    valid_from: input.input.validFrom ?? null,
    valid_until: input.input.validUntil ?? null,
    claim_metric: input.input.claimMetric ?? null,
    claim_value: input.input.claimValue ?? null,
    claim_unit: input.input.claimUnit ?? null,
    claim_period: input.input.claimPeriod ?? null,
    observed_at: input.input.observedAt ?? null,
    source_hash: input.sourceHash,
    embedding: input.semantic.embedding,
    embedding_model: input.semantic.embeddingModel,
    embedding_provider_id: input.semantic.embeddingProviderId,
    embedding_status: input.semantic.embeddingStatus,
    embedding_error: input.semantic.embeddingError,
    embedding_updated_at: input.semantic.embeddingUpdatedAt,
    semantic_fingerprint: input.semantic.semanticFingerprint,
    semantic_cluster_key: input.semantic.semanticClusterKey,
    evidence: input.input.evidence ?? [],
    metadata: {
      ...(input.input.metadata ?? {}),
      metric: input.input.claimMetric && input.input.claimValue !== null && input.input.claimValue !== undefined
        ? {
          metric: input.input.claimMetric,
          value: input.input.claimValue,
          unit: input.input.claimUnit ?? null,
          period: input.input.claimPeriod ?? null,
          observedAt: input.input.observedAt ?? null,
        }
        : undefined,
      semantic: {
        fingerprint: input.semantic.semanticFingerprint,
        clusterKey: input.semantic.semanticClusterKey,
        embeddingStatus: input.semantic.embeddingStatus,
        embeddingModel: input.semantic.embeddingModel,
        embeddingProviderId: input.semantic.embeddingProviderId,
        tokenUsage: input.semantic.tokenUsage,
      },
    },
    created_by_user_id: input.createdByUserId,
    created_by_agent_id: input.input.createdByAgentId ?? null,
  }
}

function isCreatedByUserForeignKeyError(error: { code?: string | null; message?: string | null } | null): boolean {
  return Boolean(
    error
    && error.code === '23503'
    && (error.message ?? '').includes('created_by_user_id'),
  )
}

function isKnowledgeClaimMetricColumnMissing(error: { code?: string | null; message?: string | null } | null): boolean {
  return Boolean(
    error
    && error.code === '42703'
    && /claim_metric|claim_value|claim_unit|claim_period|observed_at/i.test(error.message ?? ''),
  )
}

function stripMetricColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload }
  for (const column of CLAIM_METRIC_COLUMN_LIST) delete next[column]
  return next
}

export async function listKnowledgeClaims(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  query?: string | null
  status?: KnowledgeClaimStatus
  claimType?: KnowledgeClaimType
  limit?: number
}): Promise<KnowledgeClaim[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('knowledge_claims')
    .select(CLAIM_COLUMNS)
    .eq('org_id', input.orgId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.status) query = query.eq('status', input.status)
  if (input.claimType) query = query.eq('claim_type', input.claimType)
  if (input.query?.trim()) {
    const term = escapeIlike(input.query.trim())
    query = query.or(`subject.ilike.%${term}%,claim.ilike.%${term}%`)
  }

  let { data, error } = await query
  if (isKnowledgeClaimMetricColumnMissing(error)) {
    const retry = await buildKnowledgeClaimsListQuery(input, CLAIM_BASE_COLUMNS, limit)
    data = retry.data
    error = retry.error
  }
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, operation: 'listKnowledgeClaims' },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    return []
  }

  return ((data ?? []) as unknown as ClaimRow[]).map(mapClaim)
}

function buildKnowledgeClaimsListQuery(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  query?: string | null
  status?: KnowledgeClaimStatus
  claimType?: KnowledgeClaimType
}, columns: string, limit: number) {
  let query = supabase
    .from('knowledge_claims')
    .select(columns)
    .eq('org_id', input.orgId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.status) query = query.eq('status', input.status)
  if (input.claimType) query = query.eq('claim_type', input.claimType)
  if (input.query?.trim()) {
    const term = escapeIlike(input.query.trim())
    query = query.or(`subject.ilike.%${term}%,claim.ilike.%${term}%`)
  }
  return query
}

export async function listKnowledgeMetricClaims(input: {
  orgId: string
  subject?: string | null
  metric?: string | null
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  since?: string | null
  until?: string | null
  status?: KnowledgeClaimStatus
  limit?: number
}): Promise<KnowledgeClaim[]> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000)
  let query = supabase
    .from('knowledge_claims')
    .select(CLAIM_COLUMNS)
    .eq('org_id', input.orgId)
    .not('claim_metric', 'is', null)
    .not('claim_value', 'is', null)
    .order('observed_at', { ascending: true, nullsFirst: false })
    .order('valid_from', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (input.subject) query = query.eq('subject', input.subject)
  if (input.metric) query = query.eq('claim_metric', input.metric)
  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.status) query = query.eq('status', input.status)
  if (input.since) query = query.gte('observed_at', input.since)
  if (input.until) query = query.lte('observed_at', input.until)

  const { data, error } = await query
  if (error) {
    if (isKnowledgeClaimMetricColumnMissing(error)) return []
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, subject: input.subject, metric: input.metric, operation: 'listKnowledgeMetricClaims' },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    return []
  }

  return ((data ?? []) as unknown as ClaimRow[]).map(mapClaim)
}

export async function getKnowledgeClaim(orgId: string, claimId: string): Promise<KnowledgeClaim | null> {
  let { data, error } = await supabase
    .from('knowledge_claims')
    .select(CLAIM_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', claimId)
    .maybeSingle()

  if (isKnowledgeClaimMetricColumnMissing(error)) {
    const retry = await supabase
      .from('knowledge_claims')
      .select(CLAIM_BASE_COLUMNS)
      .eq('org_id', orgId)
      .eq('id', claimId)
      .maybeSingle()
    data = retry.data
    error = retry.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, claimId, operation: 'getKnowledgeClaim' },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    return null
  }

  return data ? mapClaim(data as unknown as ClaimRow) : null
}

export async function listKnowledgeClaimEvidence(input: {
  orgId: string
  claimId: string
  limit?: number
}): Promise<KnowledgeClaimEvidenceRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const { data, error } = await supabase
    .from('knowledge_claim_evidence')
    .select('id, org_id, claim_id, evidence_kind, evidence_ref, artifact_id, run_id, url, label, metadata, created_at')
    .eq('org_id', input.orgId)
    .eq('claim_id', input.claimId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, claimId: input.claimId, operation: 'listKnowledgeClaimEvidence' },
      tags: { layer: 'database', table: 'knowledge_claim_evidence' },
    })
    return []
  }

  return ((data ?? []) as unknown as ClaimEvidenceRow[]).map(mapClaimEvidenceRow)
}

export async function explainKnowledgeClaim(input: {
  orgId: string
  claimId: string
}): Promise<KnowledgeClaimExplanation | null> {
  const claim = await getKnowledgeClaim(input.orgId, input.claimId)
  if (!claim) return null

  const [{ data: events, error: eventsError }, evidenceRows] = await Promise.all([
    supabase
      .from('knowledge_claim_events')
      .select('id, org_id, claim_id, event_type, summary, patch, evidence, metadata, created_at')
      .eq('org_id', input.orgId)
      .eq('claim_id', input.claimId)
      .order('created_at', { ascending: false })
      .limit(100),
    listKnowledgeClaimEvidence({
      orgId: input.orgId,
      claimId: input.claimId,
      limit: 100,
    }),
  ])

  if (eventsError) {
    ErrorService.captureException(eventsError, {
      severity: 'warning',
      context: { orgId: input.orgId, claimId: input.claimId, operation: 'explainKnowledgeClaim.events' },
      tags: { layer: 'database', table: 'knowledge_claim_events' },
    })
  }

  const mappedEvents = ((events ?? []) as unknown as ClaimEventRow[]).map(mapClaimEvent)
  const evidenceCount = evidenceRows.length || claim.evidence.length
  return {
    claim,
    evidenceRows,
    events: mappedEvents,
    summary: buildClaimExplanationSummary({ claim, evidenceCount, eventCount: mappedEvents.length }),
    provenance: {
      evidenceCount,
      eventCount: mappedEvents.length,
      hasReplacement: Boolean(claim.supersededBy),
      hasExpiry: Boolean(claim.validUntil),
      status: claim.status,
    },
  }
}

export async function updateKnowledgeClaimStatus(input: {
  orgId: string
  claimId: string
  status: KnowledgeClaimStatus
  outcome?: 'true' | 'false' | 'partial' | 'obsolete' | 'unknown' | null
  summary?: string
  actorUserId?: string | null
}): Promise<KnowledgeClaim> {
  const patch: Record<string, unknown> = {
    status: input.status,
    resolved_outcome: input.outcome ?? null,
    resolved_at: input.status === 'resolved' ? new Date().toISOString() : null,
  }

  let { data, error } = await supabase
    .from('knowledge_claims')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('id', input.claimId)
    .select(CLAIM_COLUMNS)
    .single()

  if (isKnowledgeClaimMetricColumnMissing(error)) {
    const retry = await supabase
      .from('knowledge_claims')
      .update(patch)
      .eq('org_id', input.orgId)
      .eq('id', input.claimId)
      .select(CLAIM_BASE_COLUMNS)
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, claimId: input.claimId, status: input.status, operation: 'updateKnowledgeClaimStatus' },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    throw error
  }

  const claim = mapClaim(data as unknown as ClaimRow)
  await recordKnowledgeClaimEvent({
    orgId: input.orgId,
    claimId: input.claimId,
    eventType: input.status === 'resolved' ? 'resolved' : input.status === 'archived' ? 'archived' : 'dismissed',
    summary: input.summary ?? `Knowledge claim marked ${input.status}.`,
    actorUserId: input.actorUserId ?? null,
  })
  return claim
}

export async function supersedeKnowledgeClaim(input: {
  orgId: string
  claimId: string
  replacement: CreateKnowledgeClaimInput
  actorUserId?: string | null
}): Promise<{ previous: KnowledgeClaim; replacement: KnowledgeClaim }> {
  const replacement = await createKnowledgeClaim(input.replacement)
  let { data, error } = await supabase
    .from('knowledge_claims')
    .update({ status: 'superseded', superseded_by: replacement.id })
    .eq('org_id', input.orgId)
    .eq('id', input.claimId)
    .select(CLAIM_COLUMNS)
    .single()

  if (isKnowledgeClaimMetricColumnMissing(error)) {
    const retry = await supabase
      .from('knowledge_claims')
      .update({ status: 'superseded', superseded_by: replacement.id })
      .eq('org_id', input.orgId)
      .eq('id', input.claimId)
      .select(CLAIM_BASE_COLUMNS)
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, claimId: input.claimId, replacementId: replacement.id, operation: 'supersedeKnowledgeClaim' },
      tags: { layer: 'database', table: 'knowledge_claims' },
    })
    throw error
  }

  const previous = mapClaim(data as unknown as ClaimRow)
  await recordKnowledgeClaimEvent({
    orgId: input.orgId,
    claimId: input.claimId,
    eventType: 'superseded',
    summary: `Knowledge claim superseded by ${replacement.id}.`,
    actorUserId: input.actorUserId ?? null,
    metadata: { replacement_id: replacement.id },
  })
  return { previous, replacement }
}

async function getActiveKnowledgeClaimBySourceHash(orgId: string, sourceHash: string): Promise<KnowledgeClaim | null> {
  let { data, error } = await supabase
    .from('knowledge_claims')
    .select(CLAIM_COLUMNS)
    .eq('org_id', orgId)
    .eq('source_hash', sourceHash)
    .eq('status', 'active')
    .maybeSingle()

  if (isKnowledgeClaimMetricColumnMissing(error)) {
    const retry = await supabase
      .from('knowledge_claims')
      .select(CLAIM_BASE_COLUMNS)
      .eq('org_id', orgId)
      .eq('source_hash', sourceHash)
      .eq('status', 'active')
      .maybeSingle()
    data = retry.data
    error = retry.error
  }

  if (error) return null
  return data ? mapClaim(data as unknown as ClaimRow) : null
}

async function recordKnowledgeClaimEvent(input: {
  orgId: string
  claimId: string
  eventType: 'created' | 'corrected' | 'superseded' | 'resolved' | 'drift_flagged' | 'dismissed' | 'archived'
  summary: string
  evidence?: KnowledgeClaimEvidence[]
  metadata?: Record<string, unknown>
  actorUserId?: string | null
  actorAgentId?: string | null
}): Promise<void> {
  const { error } = await supabase.from('knowledge_claim_events').insert({
    org_id: input.orgId,
    claim_id: input.claimId,
    event_type: input.eventType,
    summary: input.summary,
    evidence: input.evidence ?? [],
    metadata: input.metadata ?? {},
    created_by_user_id: input.actorUserId ?? null,
    created_by_agent_id: input.actorAgentId ?? null,
  })
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, claimId: input.claimId, eventType: input.eventType, operation: 'recordKnowledgeClaimEvent' },
      tags: { layer: 'database', table: 'knowledge_claim_events' },
    })
  }
}

async function insertClaimEvidenceRows(claim: KnowledgeClaim): Promise<void> {
  if (claim.evidence.length === 0) return
  const { error } = await supabase.from('knowledge_claim_evidence').insert(
    claim.evidence.map((evidence) => ({
      org_id: claim.orgId,
      claim_id: claim.id,
      evidence_kind: evidence.kind,
      evidence_ref: evidence.messageId ?? evidence.url ?? evidence.runId ?? null,
      artifact_id: evidence.artifactId ?? null,
      run_id: evidence.runId ?? null,
      url: evidence.url ?? null,
      label: evidence.label ?? null,
      metadata: evidence,
    })),
  )
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: claim.orgId, claimId: claim.id, operation: 'insertClaimEvidenceRows' },
      tags: { layer: 'database', table: 'knowledge_claim_evidence' },
    })
  }
}

function hashClaim(input: Pick<CreateKnowledgeClaimInput, 'orgId' | 'projectId' | 'teamId' | 'assistantId' | 'subject' | 'claim' | 'holderType' | 'holderId' | 'claimMetric' | 'claimValue' | 'claimUnit' | 'claimPeriod' | 'observedAt'>): string {
  return crypto
    .createHash('sha256')
    .update([
      input.orgId,
      input.projectId ?? '',
      input.teamId ?? '',
      input.assistantId ?? '',
      input.subject.trim().toLowerCase(),
      input.claim.trim().toLowerCase(),
      input.holderType,
      input.holderId ?? '',
      input.claimMetric ?? '',
      input.claimValue === null || input.claimValue === undefined ? '' : String(input.claimValue),
      input.claimUnit ?? '',
      input.claimPeriod ?? '',
      input.observedAt ?? '',
    ].join('|'))
    .digest('hex')
}

async function buildClaimSemanticFields(input: Pick<CreateKnowledgeClaimInput, 'subject' | 'claim' | 'claimType' | 'holderType'>): Promise<{
  embedding: string | null
  embeddingStatus: KnowledgeClaimEmbeddingStatus
  embeddingModel: string
  embeddingProviderId: string
  embeddingError: string | null
  embeddingUpdatedAt: string | null
  semanticFingerprint: string
  semanticClusterKey: string
  tokenUsage: number | null
}> {
  const text = semanticText(input)
  const embeddingModel = DEFAULT_EMBEDDING_MODEL
  const embeddingProviderId = `lucid:${embeddingModel}`
  const semanticFingerprintValue = semanticFingerprint(text)
  const semanticClusterKeyValue = semanticClusterKey(input.subject)
  try {
    const result = await generateEmbedding(text, embeddingModel)
    return {
      embedding: JSON.stringify(result.embedding),
      embeddingStatus: 'ready',
      embeddingModel,
      embeddingProviderId: result.providerId ?? embeddingProviderId,
      embeddingError: null,
      embeddingUpdatedAt: new Date().toISOString(),
      semanticFingerprint: semanticFingerprintValue,
      semanticClusterKey: semanticClusterKeyValue,
      tokenUsage: result.usage.tokens,
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { operation: 'buildClaimSemanticFields', claimType: input.claimType },
      tags: { layer: 'database', feature: 'knowledge_claims' },
    })
    return {
      embedding: null,
      embeddingStatus: 'error',
      embeddingModel,
      embeddingProviderId,
      embeddingError: error instanceof Error ? error.message : 'Embedding generation failed.',
      embeddingUpdatedAt: new Date().toISOString(),
      semanticFingerprint: semanticFingerprintValue,
      semanticClusterKey: semanticClusterKeyValue,
      tokenUsage: null,
    }
  }
}

function semanticText(input: Pick<CreateKnowledgeClaimInput, 'subject' | 'claim' | 'claimType' | 'holderType'>): string {
  return [
    `type: ${input.claimType}`,
    `holder: ${input.holderType}`,
    `subject: ${input.subject.trim()}`,
    `claim: ${input.claim.trim()}`,
  ].join('\n')
}

function semanticFingerprint(text: string): string {
  return crypto.createHash('sha256').update(normalizeSemanticText(text)).digest('hex')
}

function semanticClusterKey(subject: string): string {
  return crypto.createHash('sha256').update(normalizeSemanticText(subject)).digest('hex')
}

function normalizeSemanticText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
}

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, (char) => `\\${char}`)
}

function mapClaim(row: ClaimRow): KnowledgeClaim {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    assistantId: row.assistant_id,
    sourceId: row.source_id,
    pageId: row.page_id,
    claimType: row.claim_type,
    subject: row.subject,
    claim: row.claim,
    holderType: row.holder_type,
    holderId: row.holder_id,
    confidence: Number(row.confidence ?? 0),
    weight: Number(row.weight ?? 0),
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    claimMetric: row.claim_metric ?? null,
    claimValue: row.claim_value === null || row.claim_value === undefined ? null : Number(row.claim_value),
    claimUnit: row.claim_unit ?? null,
    claimPeriod: row.claim_period ?? null,
    observedAt: row.observed_at ?? null,
    resolvedOutcome: row.resolved_outcome,
    resolvedAt: row.resolved_at,
    supersededBy: row.superseded_by,
    embeddingStatus: row.embedding_status ?? 'pending',
    embeddingModel: row.embedding_model,
    embeddingProviderId: row.embedding_provider_id,
    semanticFingerprint: row.semantic_fingerprint,
    semanticClusterKey: row.semantic_cluster_key,
    evidence: row.evidence ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapClaimEvidenceRow(row: ClaimEvidenceRow): KnowledgeClaimEvidenceRow {
  return {
    id: row.id,
    orgId: row.org_id,
    claimId: row.claim_id,
    evidenceKind: row.evidence_kind,
    evidenceRef: row.evidence_ref,
    artifactId: row.artifact_id,
    runId: row.run_id,
    url: row.url,
    label: row.label,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapClaimEvent(row: ClaimEventRow): KnowledgeClaimEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    claimId: row.claim_id,
    eventType: row.event_type,
    summary: row.summary,
    patch: row.patch ?? {},
    evidence: row.evidence ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function buildClaimExplanationSummary(input: {
  claim: KnowledgeClaim
  evidenceCount: number
  eventCount: number
}): string {
  const replacement = input.claim.supersededBy ? ` It has been superseded by ${input.claim.supersededBy}.` : ''
  const expiry = input.claim.validUntil ? ` It is valid until ${input.claim.validUntil}.` : ''
  return [
    `Claim "${input.claim.subject}" is ${input.claim.status} with ${Math.round(input.claim.confidence * 100)}% confidence.`,
    `It has ${input.evidenceCount} evidence link${input.evidenceCount === 1 ? '' : 's'} and ${input.eventCount} governance event${input.eventCount === 1 ? '' : 's'}.`,
    replacement,
    expiry,
  ].join(' ').replace(/\s+/g, ' ').trim()
}
