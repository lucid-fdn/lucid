import 'server-only'

import { ErrorService, supabase } from './client'
import {
  evaluateKnowledgeRetrieval,
  scrubKnowledgeEvalQuery,
  summarizeKnowledgeRetrievalEvalResults,
  type KnowledgeRetrievalEvalCategory,
  type KnowledgeRetrievalEvalMetrics,
} from '@/lib/knowledge/retrieval-evals'
import type { KnowledgeLayer, KnowledgePromptPacket } from '@/lib/knowledge/types'

export interface KnowledgeRetrievalEvalCase {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  slug: string
  category: KnowledgeRetrievalEvalCategory
  query: string
  expectedItemIds: string[]
  expectedCitationKeys: string[]
  requiredLayers: KnowledgeLayer[]
  baselineTopItemId: string | null
  status: 'active' | 'archived'
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type EvalCaseRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  slug: string
  category: KnowledgeRetrievalEvalCategory
  query: string
  expected_item_ids: string[] | null
  expected_citation_keys: string[] | null
  required_layers: KnowledgeLayer[] | null
  baseline_top_item_id: string | null
  status: 'active' | 'archived'
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const EVAL_CASE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'slug',
  'category',
  'query',
  'expected_item_ids',
  'expected_citation_keys',
  'required_layers',
  'baseline_top_item_id',
  'status',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

export async function listKnowledgeRetrievalEvalCases(input: {
  orgId: string
  projectId?: string | null
  category?: KnowledgeRetrievalEvalCategory
  status?: 'active' | 'archived'
  limit?: number
}): Promise<KnowledgeRetrievalEvalCase[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('knowledge_retrieval_eval_cases')
    .select(EVAL_CASE_COLUMNS)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.category) query = query.eq('category', input.category)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'listKnowledgeRetrievalEvalCases', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_retrieval_eval_cases' },
    })
    return []
  }

  return ((data ?? []) as unknown as EvalCaseRow[]).map(mapEvalCase)
}

export async function upsertKnowledgeRetrievalEvalCase(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  slug: string
  category: KnowledgeRetrievalEvalCategory
  query: string
  expectedItemIds?: string[]
  expectedCitationKeys?: string[]
  requiredLayers?: KnowledgeLayer[]
  baselineTopItemId?: string | null
  metadata?: Record<string, unknown>
  createdBy?: string | null
}): Promise<KnowledgeRetrievalEvalCase | null> {
  const row = {
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    team_id: input.teamId ?? null,
    slug: input.slug,
    category: input.category,
    query: input.query,
    expected_item_ids: input.expectedItemIds ?? [],
    expected_citation_keys: input.expectedCitationKeys ?? [],
    required_layers: input.requiredLayers ?? [],
    baseline_top_item_id: input.baselineTopItemId ?? null,
    status: 'active',
    metadata: input.metadata ?? {},
    created_by: input.createdBy ?? null,
  }
  const { data, error } = await supabase
    .from('knowledge_retrieval_eval_cases')
    .upsert(row, { onConflict: 'org_id,slug' })
    .select(EVAL_CASE_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge retrieval eval case upsert returned no row'), {
      severity: 'warning',
      context: { operation: 'upsertKnowledgeRetrievalEvalCase', orgId: input.orgId, slug: input.slug },
      tags: { layer: 'database', table: 'knowledge_retrieval_eval_cases' },
    })
    return null
  }

  return mapEvalCase(data as unknown as EvalCaseRow)
}

export async function recordKnowledgeRetrievalCapture(input: {
  packet: KnowledgePromptPacket
  query: string
  evalCaseId?: string | null
  actorUserId?: string | null
  surface?: 'app_api' | 'mission_control' | 'worker_tool' | 'mcp' | 'agent_ops' | 'external_agent' | 'runtime'
  expectedItemIds?: string[]
  expectedCitationKeys?: string[]
  baselineTopItemId?: string | null
  baselineLatencyMs?: number | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const scrubbed = scrubKnowledgeEvalQuery(input.query)
  const metrics = evaluateKnowledgeRetrieval(input.packet, {
    expectedItemIds: input.expectedItemIds,
    expectedCitationKeys: input.expectedCitationKeys,
    baselineTopItemId: input.baselineTopItemId,
    baselineLatencyMs: input.baselineLatencyMs,
    maxLatencyMs: input.packet.budget.maxLatencyMs,
  })

  const row = {
    org_id: input.packet.orgId,
    project_id: input.packet.projectId ?? null,
    team_id: input.packet.teamId ?? null,
    assistant_id: input.packet.assistantId ?? null,
    eval_case_id: input.evalCaseId ?? null,
    actor_user_id: input.actorUserId ?? null,
    surface: input.surface ?? 'runtime',
    query_hash: scrubbed.hash,
    query_preview: scrubbed.preview,
    result_item_ids: input.packet.items.map((item) => item.id),
    result_layers: input.packet.items.map((item) => item.layer),
    citation_keys: input.packet.items.flatMap((item) => item.citationKeys),
    expected_item_ids: input.expectedItemIds ?? [],
    expected_citation_keys: input.expectedCitationKeys ?? [],
    precision_at_k: metrics.precisionAtK,
    recall_at_k: metrics.recallAtK,
    mrr: metrics.mrr,
    ndcg: metrics.ndcg,
    citation_accuracy: metrics.citationAccuracy,
    top1_stable: metrics.top1Stable,
    latency_ms: input.packet.telemetry.durationMs,
    baseline_latency_ms: input.baselineLatencyMs ?? null,
    latency_delta_ms: metrics.latencyDeltaMs,
    failure_types: metrics.failureTypes,
    metadata: input.metadata ?? {},
  }

  let { error } = await supabase
    .from('knowledge_retrieval_captures')
    .insert(row)

  if (isActorUserForeignKeyError(error) && input.actorUserId) {
    const retry = await supabase
      .from('knowledge_retrieval_captures')
      .insert({
        ...row,
        actor_user_id: null,
        metadata: {
          ...row.metadata,
          actor_user_id_unlinked: true,
        },
      })
    error = retry.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'recordKnowledgeRetrievalCapture', orgId: input.packet.orgId },
      tags: { layer: 'database', table: 'knowledge_retrieval_captures' },
    })
  }
}

function isActorUserForeignKeyError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error?.code === '23503' &&
    (error.message ?? '').includes('knowledge_retrieval_captures_actor_user_id_fkey'),
  )
}

export async function recordKnowledgeRetrievalEvalRun(input: {
  orgId: string
  projectId?: string | null
  results: Array<{
    caseId?: string | null
    status: 'passed' | 'failed' | 'warning' | 'skipped'
    metrics: KnowledgeRetrievalEvalMetrics
    latencyMs: number
    summary: string
    metadata?: Record<string, unknown>
  }>
  createdBy?: string | null
  metadata?: Record<string, unknown>
}): Promise<{ evalRunId: string | null; summary: ReturnType<typeof summarizeKnowledgeRetrievalEvalResults> }> {
  const summary = summarizeKnowledgeRetrievalEvalResults(input.results.map((result) => result.metrics))
  const avgLatency = average(input.results.map((result) => result.latencyMs))
  const row = {
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      status: 'completed',
      case_count: input.results.length,
      precision_at_k: summary.precisionAtK,
      recall_at_k: summary.recallAtK,
      mrr: summary.mrr,
      ndcg: summary.ndcg,
      citation_accuracy: summary.citationAccuracy,
      top1_stability: summary.top1Stability,
      avg_latency_ms: avgLatency == null ? null : Math.round(avgLatency),
      failure_counts: summary.failureCounts,
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? null,
      completed_at: new Date().toISOString(),
    }

  const insertEvalRun = async (candidate: typeof row | Omit<typeof row, 'created_by'>) => supabase
    .from('knowledge_retrieval_eval_runs')
    .insert(candidate)
    .select('id')
    .single()

  let { data, error } = await insertEvalRun(row)

  if (error?.code === '23503' && /created_by/i.test(error.message ?? '')) {
    const { created_by: _createdBy, ...rowWithoutActor } = row
    ;({ data, error } = await insertEvalRun(rowWithoutActor))
  }

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge retrieval eval run returned no row'), {
      severity: 'warning',
      context: { operation: 'recordKnowledgeRetrievalEvalRun', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_retrieval_eval_runs' },
    })
    return { evalRunId: null, summary }
  }

  const evalRunId = (data as { id: string }).id
  if (input.results.length > 0) {
    const { error: resultError } = await supabase
      .from('knowledge_retrieval_eval_results')
      .insert(input.results.map((result) => ({
        org_id: input.orgId,
        eval_run_id: evalRunId,
        eval_case_id: result.caseId ?? null,
        status: result.status,
        precision_at_k: result.metrics.precisionAtK,
        recall_at_k: result.metrics.recallAtK,
        mrr: result.metrics.mrr,
        ndcg: result.metrics.ndcg,
        citation_accuracy: result.metrics.citationAccuracy,
        top1_stable: result.metrics.top1Stable,
        latency_ms: result.latencyMs,
        failure_types: result.metrics.failureTypes,
        summary: result.summary,
        metadata: result.metadata ?? {},
      })))

    if (resultError) {
      ErrorService.captureException(resultError, {
        severity: 'warning',
        context: { operation: 'recordKnowledgeRetrievalEvalResults', orgId: input.orgId, evalRunId },
        tags: { layer: 'database', table: 'knowledge_retrieval_eval_results' },
      })
    }
  }

  return { evalRunId, summary }
}

function mapEvalCase(row: EvalCaseRow): KnowledgeRetrievalEvalCase {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    slug: row.slug,
    category: row.category,
    query: row.query,
    expectedItemIds: row.expected_item_ids ?? [],
    expectedCitationKeys: row.expected_citation_keys ?? [],
    requiredLayers: row.required_layers ?? [],
    baselineTopItemId: row.baseline_top_item_id,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function average(values: number[]): number | null {
  const numeric = values.filter((value) => Number.isFinite(value))
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}
