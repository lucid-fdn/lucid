import 'server-only'
import { supabase, ErrorService } from './client'

export type EngineHomeRuntimeFlavor = 'shared' | 'c1_managed' | 'c2a_autonomous'
export type EngineHomeSource = 'shared' | 'relay' | 'native'
export type EngineHomeCandidateStatus = 'pending' | 'approved' | 'rejected' | 'promoted' | 'expired'

export interface EngineHomeSnapshotRecord {
  id: string
  org_id: string
  agent_id: string | null
  runtime_id: string | null
  engine: string
  runtime_flavor: EngineHomeRuntimeFlavor | null
  home_id: string
  root_digest: string
  manifest: Record<string, unknown>
  archive_ref: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface EngineHomeDiffCandidateRecord {
  id: string
  org_id: string
  agent_id: string | null
  runtime_id: string | null
  source: EngineHomeSource
  engine: string
  runtime_flavor: EngineHomeRuntimeFlavor
  home_id: string
  before_snapshot_id: string | null
  after_snapshot_id: string | null
  before_digest: string | null
  after_digest: string | null
  diff: Record<string, unknown>
  status: EngineHomeCandidateStatus
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface EngineHomeState {
  snapshots: EngineHomeSnapshotRecord[]
  candidates: EngineHomeDiffCandidateRecord[]
}

export interface EngineHomeExport {
  version: 'engine-home-management-export-v1'
  exportedAt: string
  assistantId: string
  orgId: string
  snapshot: EngineHomeSnapshotRecord | null
  snapshots: EngineHomeSnapshotRecord[]
  candidates: EngineHomeDiffCandidateRecord[]
}

const ENGINE_HOME_SNAPSHOT_SELECT =
  'id, org_id, agent_id, runtime_id, engine, runtime_flavor, home_id, root_digest, manifest, archive_ref, metadata, created_at' as const

const ENGINE_HOME_DIFF_CANDIDATE_SELECT =
  'id, org_id, agent_id, runtime_id, source, engine, runtime_flavor, home_id, before_snapshot_id, after_snapshot_id, before_digest, after_digest, diff, status, review_notes, reviewed_by, reviewed_at, created_at' as const

function isMissingEngineHomeTable(error: unknown): boolean {
  const maybe = error as { code?: unknown; message?: unknown } | null
  const code = typeof maybe?.code === 'string' ? maybe.code : ''
  const message = typeof maybe?.message === 'string' ? maybe.message : ''
  return (
    code === 'PGRST205' ||
    (/engine_home_(snapshots|diff_candidates)/i.test(message) && /schema cache|could not find/i.test(message))
  )
}

export interface RuntimeEngineHomeSnapshotInput {
  runtimeId: string
  orgId: string
  agentId: string
  source: Extract<EngineHomeSource, 'relay' | 'native'>
  engine: string
  runtimeFlavor: EngineHomeRuntimeFlavor
  homeId: string
  rootDigest: string
  manifest: Record<string, unknown>
  archive?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

interface RuntimeEventLike {
  agentId?: string | null
  eventType: string
  payload?: Record<string, unknown> | null
}

interface ExtractedEngineHomeCandidate {
  runtime_id: string
  org_id: string
  agent_id: string
  source: EngineHomeSource
  engine: string
  runtime_flavor: EngineHomeRuntimeFlavor
  home_id: string
  before_digest: string | null
  after_digest: string | null
  diff: Record<string, unknown>
}

const DIGEST_RE = /^[a-f0-9]{64}$/

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function digestValue(value: unknown): string | null {
  const candidate = stringValue(value)
  return candidate && DIGEST_RE.test(candidate) ? candidate : null
}

function isSource(value: unknown): value is EngineHomeSource {
  return value === 'shared' || value === 'relay' || value === 'native'
}

function isRuntimeFlavor(value: unknown): value is EngineHomeRuntimeFlavor {
  return value === 'shared' || value === 'c1_managed' || value === 'c2a_autonomous'
}

function resolveEngineHomeSourceForSnapshot(snapshot: EngineHomeSnapshotRecord): EngineHomeSource {
  const source = snapshot.metadata?.source
  if (isSource(source)) return source
  return snapshot.runtime_id ? 'relay' : 'shared'
}

function extractEngineHomeCandidatesFromRuntimeEvents(
  runtimeId: string,
  orgId: string,
  events: RuntimeEventLike[],
): ExtractedEngineHomeCandidate[] {
  return events.flatMap((event) => {
    const payload = event.payload ?? {}
    const isFirstClass = event.eventType === 'native_mutation_candidate'
    const isLegacy =
      event.eventType === 'tool_call' &&
      payload.toolEventType === 'native_mutation_candidate'

    if (!isFirstClass && !isLegacy) return []
    if (!event.agentId) return []
    if (payload.toolName !== 'engine_home') return []
    if (!isSource(payload.source)) return []
    if (!isRuntimeFlavor(payload.mutationRuntimeFlavor)) return []

    const toolArgs = payload.toolArgs && typeof payload.toolArgs === 'object'
      ? payload.toolArgs as Record<string, unknown>
      : {}
    const homeId = stringValue(toolArgs.homeId)
    const beforeDigest = digestValue(toolArgs.beforeDigest)
    const afterDigest = digestValue(toolArgs.afterDigest)
    const engine = stringValue(payload.mutationEngine)
    if (!homeId || !engine || (!beforeDigest && !afterDigest)) return []

    return [{
      runtime_id: runtimeId,
      org_id: orgId,
      agent_id: event.agentId,
      source: payload.source,
      engine,
      runtime_flavor: payload.mutationRuntimeFlavor,
      home_id: homeId,
      before_digest: beforeDigest,
      after_digest: afterDigest,
      diff: {
        sourceEventType: event.eventType,
        runId: stringValue(payload.runId),
        mutationKind: stringValue(payload.mutationKind),
        toolName: 'engine_home',
        reason: stringValue(payload.reason),
        toolArgs,
      },
    }]
  })
}

export async function persistEngineHomeArtifactsFromRuntimeEvents(
  runtimeId: string,
  orgId: string,
  events: RuntimeEventLike[],
): Promise<{ snapshots: number; candidates: number; error?: string }> {
  const candidates = extractEngineHomeCandidatesFromRuntimeEvents(runtimeId, orgId, events)
  if (candidates.length === 0) return { snapshots: 0, candidates: 0 }

  const snapshotRows = new Map<string, {
    org_id: string
    agent_id: string
    runtime_id: string
    engine: string
    runtime_flavor: EngineHomeRuntimeFlavor
    home_id: string
    root_digest: string
    manifest: Record<string, unknown>
    metadata: Record<string, unknown>
  }>()

  for (const candidate of candidates) {
    for (const [role, digest] of [['before', candidate.before_digest], ['after', candidate.after_digest]] as const) {
      if (!digest) continue
      snapshotRows.set(`${candidate.home_id}:${digest}`, {
        org_id: candidate.org_id,
        agent_id: candidate.agent_id,
        runtime_id: candidate.runtime_id,
        engine: candidate.engine,
        runtime_flavor: candidate.runtime_flavor,
        home_id: candidate.home_id,
        root_digest: digest,
        manifest: {
          version: 'engine-home-manifest-v1',
          source: 'runtime_event_digest_only',
        },
        metadata: {
          role,
          source: candidate.source,
          diffCandidate: true,
        },
      })
    }
  }

  const snapshotIdByDigest = new Map<string, string>()
  const rows = [...snapshotRows.values()]
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('engine_home_snapshots')
      .upsert(rows, { onConflict: 'home_id,root_digest' })
      .select('id, home_id, root_digest')

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { endpoint: 'persistEngineHomeArtifactsFromRuntimeEvents:snapshots', runtimeId, count: rows.length },
        tags: { layer: 'db', route: 'engine-home' },
      })
      return { snapshots: 0, candidates: 0, error: error.message }
    }

    for (const row of data ?? []) {
      const id = (row as { id?: unknown }).id
      const homeId = (row as { home_id?: unknown }).home_id
      const digest = (row as { root_digest?: unknown }).root_digest
      if (typeof id === 'string' && typeof homeId === 'string' && typeof digest === 'string') {
        snapshotIdByDigest.set(`${homeId}:${digest}`, id)
      }
    }
  }

  const candidateRows = candidates.map((candidate) => ({
    org_id: candidate.org_id,
    agent_id: candidate.agent_id,
    runtime_id: candidate.runtime_id,
    source: candidate.source,
    engine: candidate.engine,
    runtime_flavor: candidate.runtime_flavor,
    home_id: candidate.home_id,
    before_snapshot_id: candidate.before_digest
      ? snapshotIdByDigest.get(`${candidate.home_id}:${candidate.before_digest}`) ?? null
      : null,
    after_snapshot_id: candidate.after_digest
      ? snapshotIdByDigest.get(`${candidate.home_id}:${candidate.after_digest}`) ?? null
      : null,
    before_digest: candidate.before_digest,
    after_digest: candidate.after_digest,
    diff: candidate.diff,
    status: 'pending' as const,
  }))

  const { error: candidateError } = await supabase
    .from('engine_home_diff_candidates')
    .insert(candidateRows)

  if (candidateError) {
    ErrorService.captureException(candidateError, {
      severity: 'error',
      context: { endpoint: 'persistEngineHomeArtifactsFromRuntimeEvents:candidates', runtimeId, count: candidateRows.length },
      tags: { layer: 'db', route: 'engine-home' },
    })
    return { snapshots: rows.length, candidates: 0, error: candidateError.message }
  }

  return { snapshots: rows.length, candidates: candidateRows.length }
}

export async function persistRuntimeEngineHomeSnapshot(
  input: RuntimeEngineHomeSnapshotInput,
): Promise<{ snapshot: EngineHomeSnapshotRecord | null; error?: string; status?: number }> {
  if (!DIGEST_RE.test(input.rootDigest)) {
    return { snapshot: null, error: 'Invalid root digest', status: 400 }
  }

  const { data: assistant, error: assistantError } = await supabase
    .from('ai_assistants')
    .select('id, org_id')
    .eq('id', input.agentId)
    .eq('org_id', input.orgId)
    .maybeSingle()

  if (assistantError) {
    ErrorService.captureException(assistantError, {
      severity: 'error',
      context: { endpoint: 'persistRuntimeEngineHomeSnapshot:assistant', agentId: input.agentId, orgId: input.orgId },
      tags: { layer: 'db', route: 'engine-home' },
    })
    return { snapshot: null, error: assistantError.message, status: 500 }
  }
  if (!assistant) {
    return { snapshot: null, error: 'Assistant not found for runtime organization', status: 404 }
  }

  const metadata = {
    ...(input.metadata ?? {}),
    source: input.source,
    runtimeAuthority: 'runtime_local',
    pushedByRuntime: true,
    pushedAt: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('engine_home_snapshots')
    .upsert({
      org_id: input.orgId,
      agent_id: input.agentId,
      runtime_id: input.runtimeId,
      engine: input.engine,
      runtime_flavor: input.runtimeFlavor,
      home_id: input.homeId,
      root_digest: input.rootDigest,
      manifest: input.manifest,
      archive_ref: input.archive
        ? {
            type: 'inline_runtime_archive',
            archive: input.archive,
            authority: 'runtime_local',
          }
        : null,
      metadata,
    }, { onConflict: 'home_id,root_digest' })
    .select(ENGINE_HOME_SNAPSHOT_SELECT)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: 'persistRuntimeEngineHomeSnapshot:upsert',
        runtimeId: input.runtimeId,
        agentId: input.agentId,
        homeId: input.homeId,
      },
      tags: { layer: 'db', route: 'engine-home' },
    })
    return { snapshot: null, error: error.message, status: 500 }
  }

  return { snapshot: (data as EngineHomeSnapshotRecord | null) ?? null }
}

export async function getAssistantEngineHomeState(
  assistantId: string,
  orgId: string,
  limit = 50,
): Promise<EngineHomeState> {
  const [snapshotsResult, candidatesResult] = await Promise.all([
    supabase
      .from('engine_home_snapshots')
      .select(ENGINE_HOME_SNAPSHOT_SELECT)
      .eq('agent_id', assistantId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('engine_home_diff_candidates')
      .select(ENGINE_HOME_DIFF_CANDIDATE_SELECT)
      .eq('agent_id', assistantId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (snapshotsResult.error) {
    if (!isMissingEngineHomeTable(snapshotsResult.error)) {
      ErrorService.captureException(snapshotsResult.error, {
        severity: 'error',
        context: { endpoint: 'getAssistantEngineHomeState:snapshots', assistantId, orgId },
        tags: { layer: 'db', route: 'engine-home' },
      })
    }
  }
  if (candidatesResult.error) {
    if (!isMissingEngineHomeTable(candidatesResult.error)) {
      ErrorService.captureException(candidatesResult.error, {
        severity: 'error',
        context: { endpoint: 'getAssistantEngineHomeState:candidates', assistantId, orgId },
        tags: { layer: 'db', route: 'engine-home' },
      })
    }
  }

  return {
    snapshots: (snapshotsResult.data ?? []) as EngineHomeSnapshotRecord[],
    candidates: (candidatesResult.data ?? []) as EngineHomeDiffCandidateRecord[],
  }
}

export async function getAssistantEngineHomeExport(
  assistantId: string,
  orgId: string,
  snapshotId?: string | null,
): Promise<EngineHomeExport> {
  const state = await getAssistantEngineHomeState(assistantId, orgId, 200)
  const snapshot = snapshotId
    ? state.snapshots.find((entry) => entry.id === snapshotId) ?? null
    : state.snapshots[0] ?? null

  return {
    version: 'engine-home-management-export-v1',
    exportedAt: new Date().toISOString(),
    assistantId,
    orgId,
    snapshot,
    snapshots: snapshot ? [snapshot] : state.snapshots,
    candidates: state.candidates.filter((candidate) => !snapshot || candidate.home_id === snapshot.home_id),
  }
}

export async function createEngineHomeRollbackProposal(params: {
  assistantId: string
  orgId: string
  snapshotId: string
  reviewerId: string
  reviewNotes?: string | null
}): Promise<EngineHomeDiffCandidateRecord | null> {
  const { data: snapshot, error: snapshotError } = await supabase
    .from('engine_home_snapshots')
    .select(ENGINE_HOME_SNAPSHOT_SELECT)
    .eq('id', params.snapshotId)
    .eq('agent_id', params.assistantId)
    .eq('org_id', params.orgId)
    .maybeSingle()

  if (snapshotError || !snapshot) {
    if (snapshotError) {
      ErrorService.captureException(snapshotError, {
        severity: 'error',
        context: { endpoint: 'createEngineHomeRollbackProposal:snapshot', ...params },
        tags: { layer: 'db', route: 'engine-home' },
      })
    }
    return null
  }

  const target = snapshot as EngineHomeSnapshotRecord
  const { data, error } = await supabase
    .from('engine_home_diff_candidates')
    .insert({
      org_id: params.orgId,
      agent_id: params.assistantId,
      runtime_id: target.runtime_id,
      source: resolveEngineHomeSourceForSnapshot(target),
      engine: target.engine,
      runtime_flavor: target.runtime_flavor ?? 'shared',
      home_id: target.home_id,
      before_snapshot_id: null,
      after_snapshot_id: target.id,
      before_digest: null,
      after_digest: target.root_digest,
      diff: {
        operation: 'rollback',
        targetSnapshotId: target.id,
        targetDigest: target.root_digest,
        requestedBy: params.reviewerId,
      },
      status: 'pending',
      review_notes: params.reviewNotes ?? null,
    })
    .select(ENGINE_HOME_DIFF_CANDIDATE_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'createEngineHomeRollbackProposal:insert', ...params },
      tags: { layer: 'db', route: 'engine-home' },
    })
    return null
  }

  return data as EngineHomeDiffCandidateRecord
}

export async function reviewEngineHomeDiffCandidate(params: {
  assistantId: string
  orgId: string
  candidateId: string
  reviewerId: string
  action: 'approve' | 'reject' | 'promote'
  reviewNotes?: string | null
}): Promise<EngineHomeDiffCandidateRecord | null> {
  const nextStatus: EngineHomeCandidateStatus =
    params.action === 'approve'
      ? 'approved'
      : params.action === 'reject'
        ? 'rejected'
        : 'promoted'

  const updatePayload = {
    status: nextStatus,
    review_notes: params.reviewNotes ?? null,
    reviewed_by: params.reviewerId,
    reviewed_at: new Date().toISOString(),
  }

  const runUpdate = (payload: typeof updatePayload | Omit<typeof updatePayload, 'reviewed_by'> & { reviewed_by: null }) =>
    supabase
      .from('engine_home_diff_candidates')
      .update(payload)
      .eq('id', params.candidateId)
      .eq('agent_id', params.assistantId)
      .eq('org_id', params.orgId)
      .eq('status', 'pending')
      .select(ENGINE_HOME_DIFF_CANDIDATE_SELECT)
      .maybeSingle()

  const { data, error } = await runUpdate(updatePayload)

  if (
    error?.code === '23503' &&
    /engine_home_diff_candidates_reviewed_by_fkey|reviewed_by/i.test(error.message ?? '')
  ) {
    const { data: retried, error: retryError } = await runUpdate({
      ...updatePayload,
      reviewed_by: null,
    })

    if (!retryError) {
      return (retried as EngineHomeDiffCandidateRecord | null) ?? null
    }

    ErrorService.captureException(retryError, {
      severity: 'error',
      context: { endpoint: 'reviewEngineHomeDiffCandidate:reviewed_by_retry', ...params },
      tags: { layer: 'db', route: 'engine-home' },
    })
    return null
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'reviewEngineHomeDiffCandidate', ...params },
      tags: { layer: 'db', route: 'engine-home' },
    })
    return null
  }

  return (data as EngineHomeDiffCandidateRecord | null) ?? null
}
