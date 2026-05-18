import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../config.js'

type Severity = 'info' | 'warning' | 'critical'
type MaintenanceEventType =
  | 'consolidation_due'
  | 'compiled_truth_refreshed'
  | 'citation_audit'
  | 'stale_source'
  | 'stale_page'
  | 'claim_stale'
  | 'claim_no_evidence'
  | 'claim_expired'
  | 'claim_conflict'
  | 'contradiction_candidate'
  | 'orphan_entity'
  | 'orphan_relationship'
  | 'weekly_project_briefing'
  | 'approval_required'
  | 'source_sync_failed'
  | 'source_stale'
  | 'embedding_provider_mismatch'
  | 'embedding_dimension_mismatch'
  | 'vector_index_degraded'
  | 'l2_projection_lagging'
  | 'channel_gap_detected'

interface BrainOpsSourceRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  label: string | null
  source_type?: string | null
  source_ref?: string | null
  status: string
  refresh_status: string | null
  last_refreshed_at: string | null
  stale_after: string | null
  refresh_error?: string | null
}

interface BrainOpsPageRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  subject: string
  status: string
  confidence: number | string
  evidence: Array<Record<string, unknown>> | null
  updated_at: string
}

interface BrainOpsEntityRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  canonical_name: string
  entity_type: string
  confidence: number | string
  updated_at: string
}

interface BrainOpsRelationshipRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  confidence: number | string
  updated_at: string
}

interface BrainOpsClaimRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  assistant_id: string | null
  claim_type: string
  subject: string
  claim: string
  status: string
  confidence: number | string
  weight: number | string
  evidence: Array<Record<string, unknown>> | null
  valid_until: string | null
  embedding_status?: string | null
  embedding_model?: string | null
  embedding_provider_id?: string | null
  semantic_fingerprint?: string | null
  semantic_cluster_key?: string | null
  updated_at: string
}

interface BrainOpsEmbeddingStats {
  total_chunks: number
  missing_embedding_chunks: number
  dimension_mismatch_chunks: number
  provider_mismatch_chunks: number
  ready_documents: number
  errored_documents: number
  expected_dimensions: number
  expected_provider_id: string
}

interface BrainOpsL2ProjectionLagRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  local_resource_type: string
  local_resource_id: string
  status: string
  attempts: number | string
  next_attempt_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface BrainOpsMaintenanceEvent {
  org_id: string
  project_id?: string | null
  team_id?: string | null
  source_id?: string | null
  page_id?: string | null
  entity_id?: string | null
  relationship_id?: string | null
  claim_id?: string | null
  event_type: MaintenanceEventType
  severity: Severity
  title: string
  summary: string
  confidence: number
  evidence: Array<Record<string, unknown>>
  metadata: Record<string, unknown>
  idempotency_key: string
}

interface BrainOpsScanInput {
  now: Date
  sources: BrainOpsSourceRow[]
  pages: BrainOpsPageRow[]
  entities: BrainOpsEntityRow[]
  relationships: BrainOpsRelationshipRow[]
  claims: BrainOpsClaimRow[]
  embeddingStats: BrainOpsEmbeddingStats | null
  l2ProjectionLagRows: BrainOpsL2ProjectionLagRow[]
}

export async function runKnowledgeBrainOps(
  supabase: SupabaseClient,
  config: ReturnType<typeof getConfig>,
  options: { orgId?: string | null } = {},
): Promise<{ scannedOrgs: number; eventsWritten: number; staleSourcesUpdated: number }> {
  const limit = config.KNOWLEDGE_BRAIN_OPS_ORG_BATCH_SIZE
  let query = supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: false })

  if (options.orgId) {
    query = query.eq('id', options.orgId)
  }

  const { data: orgs, error } = await query.limit(options.orgId ? 1 : limit)

  if (error) {
    console.warn('[brain-ops] Failed to load organizations:', error.message)
    return { scannedOrgs: 0, eventsWritten: 0, staleSourcesUpdated: 0 }
  }

  let eventsWritten = 0
  let staleSourcesUpdated = 0
  for (const org of (orgs ?? []) as Array<{ id: string }>) {
    const snapshot = await loadBrainOpsSnapshot(supabase, org.id, config)
    const events = buildBrainOpsMaintenanceEvents({
      now: new Date(),
      ...snapshot,
    })
    if (events.length > 0) eventsWritten += await writeBrainOpsEvents(supabase, events)

    const staleSourceIds = events
      .filter((event) => (event.event_type === 'stale_source' || event.event_type === 'source_stale') && event.source_id)
      .map((event) => event.source_id as string)
    if (staleSourceIds.length > 0) {
      const { error: updateError } = await supabase
        .from('knowledge_sources')
        .update({ status: 'stale', refresh_status: 'failed' })
        .eq('org_id', org.id)
        .in('id', Array.from(new Set(staleSourceIds)))
      if (!updateError) staleSourcesUpdated += staleSourceIds.length
    }
  }

  if (eventsWritten || staleSourcesUpdated) {
    console.log('[brain-ops] maintenance complete', { eventsWritten, staleSourcesUpdated })
  }
  return { scannedOrgs: orgs?.length ?? 0, eventsWritten, staleSourcesUpdated }
}

export function buildBrainOpsMaintenanceEvents(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  return [
    ...detectSourceDoctorNeeds(input),
    ...detectStalePages(input),
    ...detectCitationAuditNeeds(input),
    ...detectClaimMaintenanceNeeds(input),
    ...detectClaimConflictCandidates(input),
    ...detectEmbeddingDoctorNeeds(input),
    ...detectL2ProjectionLag(input),
    ...detectOrphanEntities(input),
    ...detectOrphanRelationships(input),
    ...detectContradictionCandidates(input),
    ...buildWeeklyProjectBriefings(input),
  ]
}

async function loadBrainOpsSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  config: ReturnType<typeof getConfig>,
): Promise<Omit<BrainOpsScanInput, 'now'>> {
  const limit = config.KNOWLEDGE_BRAIN_OPS_SCAN_LIMIT
  const [sources, pages, entities, relationships, claims, embeddingStats, l2ProjectionLagRows] = await Promise.all([
    supabase
      .from('knowledge_sources')
      .select('id, org_id, project_id, team_id, label, source_type, source_ref, status, refresh_status, last_refreshed_at, stale_after, refresh_error')
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .limit(limit),
    supabase
      .from('knowledge_pages')
      .select('id, org_id, project_id, team_id, subject, status, confidence, evidence, updated_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .limit(limit),
    supabase
      .from('knowledge_entities')
      .select('id, org_id, project_id, team_id, canonical_name, entity_type, confidence, updated_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .limit(limit),
    supabase
      .from('knowledge_relationships')
      .select('id, org_id, project_id, team_id, source_entity_id, target_entity_id, relation_type, confidence, updated_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .limit(limit),
    supabase
      .from('knowledge_claims')
      .select('id, org_id, project_id, team_id, assistant_id, claim_type, subject, claim, status, confidence, weight, evidence, valid_until, embedding_status, embedding_model, embedding_provider_id, semantic_fingerprint, semantic_cluster_key, updated_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .limit(limit),
    loadEmbeddingDoctorStats(supabase, orgId, config),
    loadL2ProjectionLagRows(supabase, orgId, limit),
  ])

  return {
    sources: (sources.data ?? []) as BrainOpsSourceRow[],
    pages: (pages.data ?? []) as BrainOpsPageRow[],
    entities: (entities.data ?? []) as BrainOpsEntityRow[],
    relationships: (relationships.data ?? []) as BrainOpsRelationshipRow[],
    claims: (claims.data ?? []) as BrainOpsClaimRow[],
    embeddingStats,
    l2ProjectionLagRows,
  }
}

async function loadEmbeddingDoctorStats(
  supabase: SupabaseClient,
  orgId: string,
  config: ReturnType<typeof getConfig>,
): Promise<BrainOpsEmbeddingStats | null> {
  const rpc = (supabase as SupabaseClient & {
    rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
  }).rpc
  if (typeof rpc !== 'function') return null

  const expectedDimensions = config.KNOWLEDGE_EMBEDDING_EXPECTED_DIMENSIONS ?? 1536
  const expectedProviderId = config.KNOWLEDGE_EMBEDDING_PROVIDER_ID ?? 'lucid:text-embedding-3-small'
  const { data, error } = await rpc.call(supabase, 'knowledge_embedding_doctor_stats', {
    p_org_id: orgId,
    p_expected_dimensions: expectedDimensions,
    p_expected_provider_id: expectedProviderId,
  })
  if (error) {
    console.warn('[brain-ops] embedding doctor stats unavailable:', error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const stats = row as Partial<Record<keyof BrainOpsEmbeddingStats, unknown>>
  return {
    total_chunks: Number(stats.total_chunks ?? 0),
    missing_embedding_chunks: Number(stats.missing_embedding_chunks ?? 0),
    dimension_mismatch_chunks: Number(stats.dimension_mismatch_chunks ?? 0),
    provider_mismatch_chunks: Number(stats.provider_mismatch_chunks ?? 0),
    ready_documents: Number(stats.ready_documents ?? 0),
    errored_documents: Number(stats.errored_documents ?? 0),
    expected_dimensions: Number(stats.expected_dimensions ?? expectedDimensions),
    expected_provider_id: String(stats.expected_provider_id ?? expectedProviderId),
  }
}

async function loadL2ProjectionLagRows(
  supabase: SupabaseClient,
  orgId: string,
  limit: number,
): Promise<BrainOpsL2ProjectionLagRow[]> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('knowledge_l2_projection_outbox')
    .select('id, org_id, project_id, team_id, local_resource_type, local_resource_id, status, attempts, next_attempt_at, last_error, created_at, updated_at')
    .eq('org_id', orgId)
    .in('status', ['pending', 'failed', 'projecting'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(Math.min(limit, 100))

  if (error) {
    console.warn('[brain-ops] L2 projection lag scan unavailable:', error.message)
    return []
  }
  return (data ?? []) as BrainOpsL2ProjectionLagRow[]
}

async function writeBrainOpsEvents(
  supabase: SupabaseClient,
  events: BrainOpsMaintenanceEvent[],
): Promise<number> {
  const { error } = await supabase
    .from('knowledge_maintenance_events')
    .upsert(events.map((event) => ({ ...event, status: 'open' })), { onConflict: 'org_id,idempotency_key' })

  if (error) {
    console.warn('[brain-ops] Failed to write maintenance events:', error.message)
    return 0
  }
  return events.length
}

function detectSourceDoctorNeeds(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  return input.sources.flatMap((source) => {
    const events: BrainOpsMaintenanceEvent[] = []
    const staleAt = source.stale_after ? Date.parse(source.stale_after) : Number.NaN
    const refreshedAt = source.last_refreshed_at ? Date.parse(source.last_refreshed_at) : Number.NaN
    const olderThan45d = Number.isFinite(refreshedAt)
      && input.now.getTime() - refreshedAt > 45 * 24 * 60 * 60 * 1000
    const explicitlyStale = Number.isFinite(staleAt) && staleAt <= input.now.getTime()

    if (source.status === 'errored' || source.refresh_status === 'failed') {
      events.push(event({
        orgId: source.org_id,
        projectId: source.project_id,
        teamId: source.team_id,
        sourceId: source.id,
        eventType: 'source_sync_failed',
        severity: source.status === 'errored' ? 'critical' : 'warning',
        title: `Knowledge source sync failed: ${source.label ?? source.id.slice(0, 8)}`,
        summary: 'This source could not refresh cleanly. Keep it out of high-confidence retrieval until the connector, URL, or credentials are repaired.',
        confidence: 0.9,
        keyParts: ['source-sync-failed', source.id],
        metadata: {
          sourceType: source.source_type ?? null,
          sourceRef: source.source_ref ?? null,
          refreshStatus: source.refresh_status,
          refreshError: source.refresh_error ?? null,
          lastRefreshedAt: source.last_refreshed_at,
        },
      }))
    }

    if (source.status === 'stale' || explicitlyStale || olderThan45d) {
      events.push(event({
        orgId: source.org_id,
        projectId: source.project_id,
        teamId: source.team_id,
        sourceId: source.id,
        eventType: 'source_stale',
        severity: 'warning',
        title: `Knowledge source may be stale: ${source.label ?? source.id.slice(0, 8)}`,
        summary: 'This source is stale or has not refreshed recently. Review before relying on it for high-confidence answers.',
        confidence: 0.85,
        keyParts: ['source-stale', source.id],
        metadata: {
          sourceType: source.source_type ?? null,
          refreshStatus: source.refresh_status,
          lastRefreshedAt: source.last_refreshed_at,
          staleAfter: source.stale_after,
        },
      }))
    }
    return events
  })
}

function detectEmbeddingDoctorNeeds(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  const stats = input.embeddingStats
  if (!stats || stats.total_chunks <= 0) return []

  const events: BrainOpsMaintenanceEvent[] = []
  const missingRatio = stats.missing_embedding_chunks / Math.max(stats.total_chunks, 1)
  const erroredRatio = stats.errored_documents / Math.max(stats.ready_documents + stats.errored_documents, 1)
  const metadata = embeddingStatsMetadata(stats)

  if (stats.dimension_mismatch_chunks > 0) {
    events.push(event({
      orgId: inferOrgId(input),
      eventType: 'embedding_dimension_mismatch',
      severity: stats.dimension_mismatch_chunks > 10 ? 'critical' : 'warning',
      title: 'Embedding dimensions do not match the configured vector index',
      summary: 'Some RAG chunks were embedded with a vector dimension that differs from the expected Knowledge embedding dimension. Re-embed affected documents before relying on semantic recall.',
      confidence: 0.95,
      keyParts: ['embedding-dimension-mismatch', String(stats.expected_dimensions)],
      metadata,
    }))
  }

  if (stats.provider_mismatch_chunks > 0) {
    events.push(event({
      orgId: inferOrgId(input),
      eventType: 'embedding_provider_mismatch',
      severity: stats.provider_mismatch_chunks > 10 ? 'warning' : 'info',
      title: 'Embedding provider metadata drift detected',
      summary: 'Some chunks carry embedding-provider metadata that differs from the configured Knowledge embedding provider. Review before mixing them into high-confidence recall.',
      confidence: 0.8,
      keyParts: ['embedding-provider-mismatch', stats.expected_provider_id],
      metadata,
    }))
  }

  if (stats.missing_embedding_chunks > 0 || stats.errored_documents > 0) {
    events.push(event({
      orgId: inferOrgId(input),
      eventType: 'vector_index_degraded',
      severity: missingRatio >= 0.2 || erroredRatio >= 0.2 ? 'critical' : 'warning',
      title: 'Knowledge vector index is degraded',
      summary: 'Some documents or chunks are missing embeddings or failed ingestion. Semantic recall will fall back to bounded non-vector context until the index is repaired.',
      confidence: 0.9,
      keyParts: ['vector-index-degraded', String(stats.total_chunks)],
      metadata: { ...metadata, missingRatio, erroredRatio },
    }))
  }

  return events
}

function embeddingStatsMetadata(stats: BrainOpsEmbeddingStats): Record<string, unknown> {
  return {
    totalChunks: stats.total_chunks,
    missingEmbeddingChunks: stats.missing_embedding_chunks,
    dimensionMismatchChunks: stats.dimension_mismatch_chunks,
    providerMismatchChunks: stats.provider_mismatch_chunks,
    readyDocuments: stats.ready_documents,
    erroredDocuments: stats.errored_documents,
    expectedDimensions: stats.expected_dimensions,
    expectedProviderId: stats.expected_provider_id,
  }
}

function detectL2ProjectionLag(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  return input.l2ProjectionLagRows.flatMap((row) => {
    const createdAt = Date.parse(row.created_at)
    const ageMs = Number.isFinite(createdAt) ? input.now.getTime() - createdAt : null
    return [event({
      orgId: row.org_id,
      projectId: row.project_id,
      teamId: row.team_id,
      eventType: 'l2_projection_lagging',
      severity: row.status === 'failed' || Number(row.attempts) >= 3 ? 'warning' : 'info',
      title: `Lucid-L2 projection is lagging: ${row.local_resource_type}`,
      summary: 'A Knowledge projection has been pending or retrying for more than 30 minutes. Local Knowledge remains usable, but L2 proof freshness is degraded.',
      confidence: 0.85,
      keyParts: ['l2-projection-lagging', row.id],
      metadata: {
        outboxId: row.id,
        localResourceType: row.local_resource_type,
        localResourceId: row.local_resource_id,
        status: row.status,
        attempts: Number(row.attempts),
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
        ageMs,
      },
    })]
  })
}

function detectStalePages(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  return input.pages.flatMap((page) => {
    const updatedAt = Date.parse(page.updated_at)
    if (!Number.isFinite(updatedAt) || input.now.getTime() - updatedAt < 60 * 24 * 60 * 60 * 1000) return []
    return [event({
      orgId: page.org_id,
      projectId: page.project_id,
      teamId: page.team_id,
      pageId: page.id,
      eventType: 'consolidation_due',
      severity: 'info',
      title: `Knowledge page is due for consolidation: ${page.subject}`,
      summary: 'This compiled truth page has not changed for 60+ days. Brain Ops should review new evidence and refresh it if needed.',
      confidence: 0.7,
      keyParts: ['consolidation-due', page.id, weekKey(input.now)],
      metadata: { updatedAt: page.updated_at },
    })]
  })
}

function detectCitationAuditNeeds(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  return input.pages.flatMap((page) => {
    if ((page.evidence ?? []).length > 0) return []
    return [event({
      orgId: page.org_id,
      projectId: page.project_id,
      teamId: page.team_id,
      pageId: page.id,
      eventType: 'citation_audit',
      severity: 'warning',
      title: `Knowledge page has no evidence: ${page.subject}`,
      summary: 'This compiled truth page has no citation/evidence handles. Add provenance or lower trust before using it in evidence-heavy workflows.',
      confidence: 0.9,
      keyParts: ['citation-audit', page.id],
      metadata: { subject: page.subject },
    })]
  })
}

function detectClaimMaintenanceNeeds(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  return input.claims.flatMap((claim) => {
    const events: BrainOpsMaintenanceEvent[] = []
    const evidenceCount = claim.evidence?.length ?? 0
    const validUntil = claim.valid_until ? Date.parse(claim.valid_until) : Number.NaN
    const updatedAt = Date.parse(claim.updated_at)
    const expired = Number.isFinite(validUntil) && validUntil <= input.now.getTime()
    const stale = Number.isFinite(updatedAt) && input.now.getTime() - updatedAt > 90 * 24 * 60 * 60 * 1000

    if (evidenceCount === 0 && Number(claim.confidence) >= 0.65) {
      events.push(event({
        orgId: claim.org_id,
        projectId: claim.project_id,
        teamId: claim.team_id,
        claimId: claim.id,
        eventType: 'claim_no_evidence',
        severity: Number(claim.confidence) >= 0.85 ? 'critical' : 'warning',
        title: `Knowledge claim has no evidence: ${claim.subject}`,
        summary: 'This active claim has confidence but no evidence handles. Add provenance, lower confidence, or archive it before high-confidence recall depends on it.',
        confidence: 0.9,
        keyParts: ['claim-no-evidence', claim.id],
        metadata: {
          claimType: claim.claim_type,
          claimConfidence: Number(claim.confidence),
          claimWeight: Number(claim.weight),
        },
      }))
    }

    if (expired) {
      events.push(event({
        orgId: claim.org_id,
        projectId: claim.project_id,
        teamId: claim.team_id,
        claimId: claim.id,
        eventType: 'claim_expired',
        severity: 'warning',
        title: `Knowledge claim validity expired: ${claim.subject}`,
        summary: 'This active claim is past its validity window. Resolve, supersede, archive, or refresh it before continued use.',
        confidence: 0.95,
        keyParts: ['claim-expired', claim.id],
        metadata: {
          claimType: claim.claim_type,
          validUntil: claim.valid_until,
        },
      }))
    }

    if (stale && !expired) {
      events.push(event({
        orgId: claim.org_id,
        projectId: claim.project_id,
        teamId: claim.team_id,
        claimId: claim.id,
        eventType: 'claim_stale',
        severity: 'info',
        title: `Knowledge claim is due for review: ${claim.subject}`,
        summary: 'This claim has not been updated for 90+ days. Brain Ops should review fresh evidence or keep it explicitly active.',
        confidence: 0.75,
        keyParts: ['claim-stale', claim.id, weekKey(input.now)],
        metadata: {
          claimType: claim.claim_type,
          updatedAt: claim.updated_at,
        },
      }))
    }

    if (claim.embedding_status === 'pending' || claim.embedding_status === 'error') {
      events.push(event({
        orgId: claim.org_id,
        projectId: claim.project_id,
        teamId: claim.team_id,
        claimId: claim.id,
        eventType: 'vector_index_degraded',
        severity: claim.embedding_status === 'error' ? 'warning' : 'info',
        title: `Knowledge claim semantic index is not ready: ${claim.subject}`,
        summary: 'This active claim has missing or failed semantic embedding metadata. It remains visible through exact governance views, but semantic claim recall and drift checks are degraded.',
        confidence: 0.85,
        keyParts: ['claim-vector-index-degraded', claim.id],
        metadata: {
          claimType: claim.claim_type,
          embeddingStatus: claim.embedding_status,
          embeddingModel: claim.embedding_model ?? null,
          embeddingProviderId: claim.embedding_provider_id ?? null,
          semanticFingerprint: claim.semantic_fingerprint ?? null,
          semanticClusterKey: claim.semantic_cluster_key ?? null,
        },
      }))
    }

    return events
  })
}

function detectClaimConflictCandidates(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  const grouped = new Map<string, { semanticClusterKey: string; claims: BrainOpsClaimRow[] }>()
  for (const claim of input.claims) {
    if (!['active', 'resolved'].includes(claim.status)) continue
    const semanticClusterKey = claim.semantic_cluster_key || normalizeClaimSubjectCluster(claim.subject)
    if (!semanticClusterKey) continue
    const scopedKey = scopedClaimClusterKey(claim, semanticClusterKey)
    const group = grouped.get(scopedKey) ?? { semanticClusterKey, claims: [] }
    group.claims.push(claim)
    grouped.set(scopedKey, group)
  }

  const events: BrainOpsMaintenanceEvent[] = []
  for (const { semanticClusterKey, claims } of grouped.values()) {
    if (claims.length < 2) continue
    const sorted = [...claims].sort((a, b) => Number(b.confidence) - Number(a.confidence))
    const anchor = sorted[0]
    const anchorNegated = claimHasNegation(anchor.claim)
    const conflicting = sorted
      .slice(1)
      .filter((claim) => claimHasNegation(claim.claim) !== anchorNegated || normalizeClaimText(claim.claim) !== normalizeClaimText(anchor.claim))
      .filter((claim) => Number(claim.confidence) >= 0.6 || Number(claim.weight) >= 0.6)

    if (conflicting.length === 0) continue
    events.push(event({
      orgId: anchor.org_id,
      projectId: anchor.project_id,
      teamId: anchor.team_id,
      claimId: anchor.id,
      eventType: 'claim_conflict',
      severity: conflicting.some((claim) => Number(claim.confidence) >= 0.85) ? 'warning' : 'info',
      title: `Possible Knowledge claim conflict: ${anchor.subject}`,
      summary: 'Multiple active claims sit in the same semantic cluster but disagree in wording or polarity. Review evidence and resolve, supersede, or split the claims before using them as stable operating truth.',
      confidence: 0.78,
      keyParts: ['claim-conflict', semanticClusterKey],
      metadata: {
        semanticClusterKey,
        anchorClaimId: anchor.id,
        anchorFingerprint: anchor.semantic_fingerprint ?? null,
        conflictingClaimIds: conflicting.map((claim) => claim.id),
        conflictingFingerprints: conflicting.map((claim) => claim.semantic_fingerprint ?? null),
        claimCount: claims.length,
      },
    }))
  }
  return events
}

function normalizeClaimSubjectCluster(value: string): string {
  return normalizeClaimText(value)
    .replace(/\b(policy|requirement|decision|rule|signal|thesis|risk)\b/g, '')
    .trim()
}

function scopedClaimClusterKey(claim: BrainOpsClaimRow, semanticClusterKey: string): string {
  return [
    claim.org_id,
    claim.project_id ?? 'org',
    claim.team_id ?? 'workspace',
    claim.assistant_id ?? 'all-agents',
    semanticClusterKey,
  ].join(':')
}

function normalizeClaimText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
}

function claimHasNegation(value: string): boolean {
  return /\b(no|not|never|cannot|can't|must not|should not|blocked|forbidden|prohibited|without)\b/i.test(value)
}

function detectOrphanEntities(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  const linked = new Set<string>()
  for (const relationship of input.relationships) {
    linked.add(relationship.source_entity_id)
    linked.add(relationship.target_entity_id)
  }
  return input.entities.flatMap((entity) => linked.has(entity.id)
    ? []
    : [event({
        orgId: entity.org_id,
        projectId: entity.project_id,
        teamId: entity.team_id,
        entityId: entity.id,
        eventType: 'orphan_entity',
        severity: 'info',
        title: `Entity has no relationships: ${entity.canonical_name}`,
        summary: 'This entity exists but is not connected to other Knowledge graph nodes. Review whether it should be linked, merged, or archived.',
        confidence: 0.75,
        keyParts: ['orphan-entity', entity.id, weekKey(input.now)],
        metadata: { entityType: entity.entity_type },
      })])
}

function detectOrphanRelationships(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  const entities = new Set(input.entities.map((entity) => entity.id))
  return input.relationships.flatMap((relationship) => {
    if (entities.has(relationship.source_entity_id) && entities.has(relationship.target_entity_id)) return []
    return [event({
      orgId: relationship.org_id,
      projectId: relationship.project_id,
      teamId: relationship.team_id,
      relationshipId: relationship.id,
      eventType: 'orphan_relationship',
      severity: 'warning',
      title: `Relationship points to a missing entity: ${relationship.relation_type}`,
      summary: 'This relationship references an entity outside the current active graph snapshot. Review for archive, repair, or merge.',
      confidence: 0.8,
      keyParts: ['orphan-relationship', relationship.id],
      metadata: {
        sourceEntityId: relationship.source_entity_id,
        targetEntityId: relationship.target_entity_id,
      },
    })]
  })
}

function detectContradictionCandidates(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  const byPair = new Map<string, BrainOpsRelationshipRow[]>()
  for (const relationship of input.relationships) {
    const pair = [relationship.source_entity_id, relationship.target_entity_id].sort().join(':')
    byPair.set(pair, [...(byPair.get(pair) ?? []), relationship])
  }

  const events: BrainOpsMaintenanceEvent[] = []
  for (const [pair, relationships] of byPair.entries()) {
    const types = new Set(relationships.map((relationship) => relationship.relation_type))
    if (types.has('blocks') && (types.has('depends_on') || types.has('uses') || types.has('works_on'))) {
      const relationship = relationships[0]
      events.push(event({
        orgId: relationship.org_id,
        projectId: relationship.project_id,
        teamId: relationship.team_id,
        relationshipId: relationship.id,
        eventType: 'contradiction_candidate',
        severity: 'warning',
        title: 'Possible contradictory graph relationships',
        summary: 'The same entity pair has blocking and dependency/usage relationships. This may be valid, but needs operator review before graph-expanded recall treats it as stable context.',
        confidence: 0.65,
        keyParts: ['contradiction', pair],
        metadata: { relationTypes: Array.from(types), pair },
      }))
    }
  }
  return events
}

function buildWeeklyProjectBriefings(input: BrainOpsScanInput): BrainOpsMaintenanceEvent[] {
  const byProject = new Map<string, { pages: BrainOpsPageRow[]; entities: BrainOpsEntityRow[]; relationships: BrainOpsRelationshipRow[] }>()
  for (const page of input.pages) {
    if (!page.project_id) continue
    const current = byProject.get(page.project_id) ?? { pages: [], entities: [], relationships: [] }
    current.pages.push(page)
    byProject.set(page.project_id, current)
  }
  for (const entity of input.entities) {
    if (!entity.project_id) continue
    const current = byProject.get(entity.project_id) ?? { pages: [], entities: [], relationships: [] }
    current.entities.push(entity)
    byProject.set(entity.project_id, current)
  }
  for (const relationship of input.relationships) {
    if (!relationship.project_id) continue
    const current = byProject.get(relationship.project_id) ?? { pages: [], entities: [], relationships: [] }
    current.relationships.push(relationship)
    byProject.set(relationship.project_id, current)
  }

  return Array.from(byProject.entries()).flatMap(([projectId, summary]) => summary.pages.length === 0 && summary.entities.length === 0
    ? []
    : [event({
        orgId: summary.pages[0]?.org_id ?? summary.entities[0]?.org_id ?? summary.relationships[0]?.org_id ?? '',
        projectId,
        eventType: 'weekly_project_briefing',
        severity: 'info',
        title: 'Weekly Knowledge briefing is ready',
        summary: `Project Knowledge snapshot: ${summary.pages.length} active pages, ${summary.entities.length} active entities, ${summary.relationships.length} active relationships.`,
        confidence: 0.8,
        keyParts: ['weekly-project-briefing', projectId, weekKey(input.now)],
        metadata: {
          pageCount: summary.pages.length,
          entityCount: summary.entities.length,
          relationshipCount: summary.relationships.length,
          topPages: summary.pages.slice(0, 5).map((page) => page.subject),
        },
      })])
}

function inferOrgId(input: BrainOpsScanInput): string {
  return input.sources[0]?.org_id
    ?? input.pages[0]?.org_id
    ?? input.entities[0]?.org_id
    ?? input.relationships[0]?.org_id
    ?? input.claims[0]?.org_id
    ?? input.l2ProjectionLagRows[0]?.org_id
    ?? '00000000-0000-4000-8000-000000000000'
}

function event(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  sourceId?: string | null
  pageId?: string | null
  entityId?: string | null
  relationshipId?: string | null
  claimId?: string | null
  eventType: MaintenanceEventType
  severity: Severity
  title: string
  summary: string
  confidence: number
  keyParts: string[]
  metadata?: Record<string, unknown>
}): BrainOpsMaintenanceEvent {
  return {
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    team_id: input.teamId ?? null,
    source_id: input.sourceId ?? null,
    page_id: input.pageId ?? null,
    entity_id: input.entityId ?? null,
    relationship_id: input.relationshipId ?? null,
    claim_id: input.claimId ?? null,
    event_type: input.eventType,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    confidence: input.confidence,
    evidence: [],
    metadata: input.metadata ?? {},
    idempotency_key: input.keyParts.join(':'),
  }
}

function weekKey(date: Date): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return `${date.getUTCFullYear()}-w${Math.ceil((day + start.getUTCDay() + 1) / 7)}`
}
