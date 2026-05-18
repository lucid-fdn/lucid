import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { ErrorService, supabase as defaultSupabase } from './client'
import { writeProjectKnowledge, writeTeamKnowledge } from './knowledge'
import type {
  EngineHomeProjectionCandidate,
  EngineHomeProjectionPolicy,
  EngineHomeProjectionStatus,
} from '@/lib/knowledge/engine-home-projection'

export type KnowledgeEngineHomeCandidate = EngineHomeProjectionCandidate & {
  id: string
  promotionTargetType: 'assistant_memory' | 'team_brain' | 'project_brain' | null
  promotionTargetId: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

type CandidateRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  assistant_id: string | null
  runtime_id: string | null
  engine: EngineHomeProjectionCandidate['engine']
  home_kind: EngineHomeProjectionCandidate['homeKind']
  home_authority: EngineHomeProjectionCandidate['homeAuthority']
  resource_type: EngineHomeProjectionCandidate['resourceType']
  projection_policy: EngineHomeProjectionPolicy
  status: EngineHomeProjectionStatus
  path: string
  content_hash: string
  summary: string
  payload_redacted: Record<string, unknown> | null
  source_snapshot_id: string
  source_diff_id: string | null
  promotion_target_type: KnowledgeEngineHomeCandidate['promotionTargetType']
  promotion_target_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const CANDIDATE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'assistant_id',
  'runtime_id',
  'engine',
  'home_kind',
  'home_authority',
  'resource_type',
  'projection_policy',
  'status',
  'path',
  'content_hash',
  'summary',
  'payload_redacted',
  'source_snapshot_id',
  'source_diff_id',
  'promotion_target_type',
  'promotion_target_id',
  'reviewed_by',
  'reviewed_at',
  'review_note',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

export async function upsertKnowledgeEngineHomeProjectionCandidates(
  candidates: EngineHomeProjectionCandidate[],
  options?: { client?: SupabaseClient },
): Promise<KnowledgeEngineHomeCandidate[]> {
  if (candidates.length === 0) return []
  const client = options?.client ?? defaultSupabase
  const { data, error } = await client
    .from('knowledge_engine_home_projection_candidates')
    .upsert(candidates.map(candidateToRow), {
      onConflict: 'org_id,engine,source_snapshot_id,path,content_hash',
    })
    .select(CANDIDATE_COLUMNS)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'upsertKnowledgeEngineHomeProjectionCandidates', count: candidates.length },
      tags: { layer: 'database', table: 'knowledge_engine_home_projection_candidates' },
    })
    return []
  }

  return ((data ?? []) as unknown as CandidateRow[]).map(mapCandidateRow)
}

export async function listKnowledgeEngineHomeProjectionCandidates(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  status?: EngineHomeProjectionStatus
  limit?: number
  client?: SupabaseClient
}): Promise<KnowledgeEngineHomeCandidate[]> {
  const client = input.client ?? defaultSupabase
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  let query = client
    .from('knowledge_engine_home_projection_candidates')
    .select(CANDIDATE_COLUMNS)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'listKnowledgeEngineHomeProjectionCandidates', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_engine_home_projection_candidates' },
    })
    return []
  }

  return ((data ?? []) as unknown as CandidateRow[]).map(mapCandidateRow)
}

export async function reviewKnowledgeEngineHomeProjectionCandidate(input: {
  orgId: string
  candidateId: string
  reviewerUserId: string
  action: 'reject' | 'ignore' | 'promote'
  note?: string | null
  client?: SupabaseClient
}): Promise<KnowledgeEngineHomeCandidate | null> {
  const client = input.client ?? defaultSupabase
  const candidate = await getCandidateById(client, input.orgId, input.candidateId)
  if (!candidate) return null

  if (input.action === 'reject' || input.action === 'ignore') {
    return updateCandidateReview(client, candidate.id, {
      status: input.action === 'reject' ? 'rejected' : 'ignored',
      reviewedBy: input.reviewerUserId,
      reviewNote: input.note ?? null,
    })
  }

  const promoted = await promoteCandidate(candidate)
  return updateCandidateReview(client, candidate.id, {
    status: 'promoted',
    reviewedBy: input.reviewerUserId,
    reviewNote: input.note ?? null,
    promotionTargetType: promoted.targetType,
    promotionTargetId: promoted.targetId,
  })
}

async function promoteCandidate(candidate: KnowledgeEngineHomeCandidate): Promise<{
  targetType: NonNullable<KnowledgeEngineHomeCandidate['promotionTargetType']>
  targetId: string
}> {
  if (candidate.projectionPolicy === 'promote_to_team_brain') {
    if (!candidate.teamId) throw new Error('teamId is required to promote engine-home candidate to Team Brain')
    const page = await writeTeamKnowledge({
      orgId: candidate.orgId,
      projectId: candidate.projectId,
      teamId: candidate.teamId,
      subject: `Engine home candidate: ${candidate.path}`,
      compiledTruthPatch: candidate.summary,
      event: { type: 'created', summary: 'Promoted reviewed engine-home candidate into Team Brain.', confidence: 0.75 },
      source: candidateSource(candidate, 'team'),
      evidence: [{ kind: 'file', label: `${candidate.homeKind}:${candidate.path}` }],
    })
    return { targetType: 'team_brain', targetId: page.id }
  }

  if (candidate.projectionPolicy === 'promote_to_assistant_memory') {
    throw new Error('Assistant memory promotion requires scoped user identity and embedding extraction; keep this candidate reviewed until the assistant-memory writer is explicitly invoked.')
  }

  if (!candidate.projectId) throw new Error('projectId is required to promote engine-home candidate to Project Brain')
  const page = await writeProjectKnowledge({
    orgId: candidate.orgId,
    projectId: candidate.projectId,
    teamId: null,
    subject: `Engine home candidate: ${candidate.path}`,
    compiledTruthPatch: candidate.summary,
    event: { type: 'created', summary: 'Promoted reviewed engine-home candidate into Project Brain.', confidence: 0.75 },
    source: candidateSource(candidate, 'project'),
    evidence: [{ kind: 'file', label: `${candidate.homeKind}:${candidate.path}` }],
  })
  return { targetType: 'project_brain', targetId: page.id }
}

function candidateSource(candidate: KnowledgeEngineHomeCandidate, visibility: 'project' | 'team') {
  return {
    orgId: candidate.orgId,
    projectId: candidate.projectId,
    teamId: candidate.teamId,
    assistantId: candidate.assistantId,
    type: 'engine_home' as const,
    id: `${candidate.sourceSnapshotId}:${candidate.path}`,
    label: `${candidate.homeKind} ${candidate.resourceType}`,
    visibility,
    trustLevel: 'observed' as const,
    federationPolicy: 'source_scoped' as const,
    retentionPolicy: 'audit' as const,
  }
}

async function getCandidateById(
  client: SupabaseClient,
  orgId: string,
  candidateId: string,
): Promise<KnowledgeEngineHomeCandidate | null> {
  const { data, error } = await client
    .from('knowledge_engine_home_projection_candidates')
    .select(CANDIDATE_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', candidateId)
    .maybeSingle()

  if (error || !data) return null
  return mapCandidateRow(data as unknown as CandidateRow)
}

async function updateCandidateReview(
  client: SupabaseClient,
  candidateId: string,
  input: {
    status: EngineHomeProjectionStatus
    reviewedBy: string
    reviewNote?: string | null
    promotionTargetType?: KnowledgeEngineHomeCandidate['promotionTargetType']
    promotionTargetId?: string | null
  },
): Promise<KnowledgeEngineHomeCandidate | null> {
  const patch = {
      status: input.status,
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote ?? null,
      promotion_target_type: input.promotionTargetType ?? null,
      promotion_target_id: input.promotionTargetId ?? null,
    }

  const updateCandidate = async (candidatePatch: typeof patch | Omit<typeof patch, 'reviewed_by'>) => client
    .from('knowledge_engine_home_projection_candidates')
    .update(candidatePatch)
    .eq('id', candidateId)
    .select(CANDIDATE_COLUMNS)
    .single()

  let { data, error } = await updateCandidate(patch)

  if (error?.code === '23503' && /reviewed_by/i.test(error.message ?? '')) {
    const { reviewed_by: _reviewedBy, ...patchWithoutReviewer } = patch
    ;({ data, error } = await updateCandidate(patchWithoutReviewer))
  }

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Engine-home candidate review returned no row'), {
      severity: 'warning',
      context: { operation: 'updateCandidateReview', candidateId },
      tags: { layer: 'database', table: 'knowledge_engine_home_projection_candidates' },
    })
    return null
  }
  return mapCandidateRow(data as unknown as CandidateRow)
}

function candidateToRow(candidate: EngineHomeProjectionCandidate) {
  return {
    org_id: candidate.orgId,
    project_id: candidate.projectId,
    team_id: candidate.teamId,
    assistant_id: candidate.assistantId,
    runtime_id: candidate.runtimeId,
    engine: candidate.engine,
    home_kind: candidate.homeKind,
    home_authority: candidate.homeAuthority,
    resource_type: candidate.resourceType,
    projection_policy: candidate.projectionPolicy,
    status: candidate.status,
    path: candidate.path,
    content_hash: candidate.contentHash,
    summary: candidate.summary,
    payload_redacted: candidate.payloadRedacted,
    source_snapshot_id: candidate.sourceSnapshotId,
    source_diff_id: candidate.sourceDiffId,
    metadata: candidate.metadata,
  }
}

function mapCandidateRow(row: CandidateRow): KnowledgeEngineHomeCandidate {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    assistantId: row.assistant_id,
    runtimeId: row.runtime_id,
    engine: row.engine,
    homeKind: row.home_kind,
    homeAuthority: row.home_authority,
    resourceType: row.resource_type,
    projectionPolicy: row.projection_policy,
    status: row.status,
    path: row.path,
    contentHash: row.content_hash,
    summary: row.summary,
    payloadRedacted: row.payload_redacted ?? {},
    sourceSnapshotId: row.source_snapshot_id,
    sourceDiffId: row.source_diff_id,
    promotionTargetType: row.promotion_target_type,
    promotionTargetId: row.promotion_target_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
