import 'server-only'

import {
  buildProjectLearningFingerprint,
  decisionPreferenceInputSchema,
  sanitizeProjectLearning,
  type DecisionPreferenceInput,
  type ProjectLearningInput,
} from '@/lib/agent-ops/project-learnings'
import {
  buildContextSnapshotFingerprint,
  contextSnapshotInputSchema,
  projectSafetyPolicyInputSchema,
  resolveSafetyPolicy,
  type AgentOpsContextSnapshotInput,
  type AgentOpsProjectSafetyPolicyInput,
  type AgentOpsProjectSafetyMode,
  type AgentOpsSafetyPolicy,
} from '@/lib/agent-ops/operating-loop'
import {
  AGENT_OPS_EVAL_TARGET_KINDS,
  agentOpsEvalResultInputSchema,
  summarizeEvalResults,
  type AgentOpsEvalResultInput,
} from '@/lib/agent-ops/evals'
import {
  summarizeAgentOpsSpecialistTelemetry,
  type AgentOpsSpecialistTelemetryFindingInput,
  type AgentOpsSpecialistTelemetryRunInput,
  type AgentOpsSpecialistTelemetrySummary,
} from '@/lib/agent-ops/specialist-telemetry'
import type { AgentOpsFindingSeverity, AgentOpsFindingStatus } from '@/lib/agent-ops/workflow-types'
import { ErrorService, supabase } from './client'

export interface ProjectLearning {
  id: string
  orgId: string
  projectId: string | null
  assistantId: string | null
  opsRunId: string | null
  type: ProjectLearningInput['type']
  trustLevel: ProjectLearningInput['trustLevel']
  status: 'active' | 'superseded' | 'archived' | 'rejected'
  title: string
  body: string
  confidence: number
  fingerprint: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface DecisionPreference {
  id: string
  orgId: string
  projectId: string | null
  key: string
  questionPattern: string
  preferredDecision: string
  riskLevel: DecisionPreferenceInput['riskLevel']
  sourceKind: DecisionPreferenceInput['sourceKind']
  status: 'active' | 'paused' | 'archived'
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentOpsEvalRunSummary {
  id: string
  orgId: string
  projectId: string | null
  opsRunId: string | null
  workflowId: string | null
  targetKind: (typeof AGENT_OPS_EVAL_TARGET_KINDS)[number]
  targetRef: string | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  score: number | null
  passRate: number | null
  latencyMs: number | null
  costUsd: number | null
  tokenCount: number | null
  metadata: Record<string, unknown>
  createdAt: string
  completedAt: string | null
}

export interface AgentOpsSecurityAttempt {
  id: string
  orgId: string
  projectId: string | null
  assistantId: string | null
  opsRunId: string | null
  sourceKind: string
  sourceRef: string | null
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'reviewed' | 'dismissed' | 'mitigated'
  title: string
  body: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AgentOpsContextSnapshot {
  id: string
  orgId: string
  projectId: string | null
  assistantId: string | null
  opsRunId: string | null
  kind: AgentOpsContextSnapshotInput['kind']
  title: string
  summary: string | null
  state: Record<string, unknown>
  fingerprint: string
  metadata: Record<string, unknown>
  createdBy: string | null
  createdAt: string
}

export interface AgentOpsProjectPolicy {
  id: string
  orgId: string
  projectId: string | null
  safetyMode: AgentOpsProjectSafetyMode
  policy: AgentOpsSafetyPolicy
  status: 'active' | 'archived'
  metadata: Record<string, unknown>
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentOpsPerformanceSummary {
  runCount: number
  completedRunCount: number
  failedRunCount: number
  measuredRunCount: number
  avgLatencyMs: number | null
  p95LatencyMs: number | null
  totalCostUsd: number
  avgCostUsd: number | null
  totalTokens: number
  avgTokens: number | null
  windowDays: number
}

type ProjectLearningRow = {
  id: string
  org_id: string
  project_id: string | null
  assistant_id: string | null
  ops_run_id: string | null
  learning_type: ProjectLearning['type']
  trust_level: ProjectLearning['trustLevel']
  status: ProjectLearning['status']
  title: string
  body: string
  confidence: number
  fingerprint: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type AgentOpsPerformanceRunRow = {
  status: string
  latency_ms: number | string | null
  cost_usd: number | string | null
  total_tokens: number | string | null
  created_at: string
}

type AgentOpsSpecialistTelemetryRunRow = {
  id: string
  project_id: string | null
  assistant_id: string | null
  workflow_id: string
  status: string
  latency_ms: number | string | null
  cost_usd: number | string | null
  total_tokens: number | string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type AgentOpsSpecialistTelemetryFindingRow = {
  id: string
  ops_run_id: string
  severity: AgentOpsFindingSeverity
  status: AgentOpsFindingStatus
  confidence: number | string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type DecisionPreferenceRow = {
  id: string
  org_id: string
  project_id: string | null
  preference_key: string
  question_pattern: string
  preferred_decision: string
  risk_level: DecisionPreference['riskLevel']
  source_kind: DecisionPreference['sourceKind']
  status: DecisionPreference['status']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type AgentOpsEvalRunRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string | null
  workflow_id: string | null
  target_kind: AgentOpsEvalRunSummary['targetKind']
  target_ref: string | null
  status: AgentOpsEvalRunSummary['status']
  score: number | null
  pass_rate: number | null
  latency_ms: number | null
  cost_usd: number | string | null
  token_count: number | null
  metadata: Record<string, unknown> | null
  created_at: string
  completed_at: string | null
}

type AgentOpsSecurityAttemptRow = {
  id: string
  org_id: string
  project_id: string | null
  assistant_id: string | null
  ops_run_id: string | null
  source_kind: string
  source_ref: string | null
  severity: AgentOpsSecurityAttempt['severity']
  status: AgentOpsSecurityAttempt['status']
  title: string
  body: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type AgentOpsContextSnapshotRow = {
  id: string
  org_id: string
  project_id: string | null
  assistant_id: string | null
  ops_run_id: string | null
  snapshot_kind: AgentOpsContextSnapshot['kind']
  title: string
  summary: string | null
  state: Record<string, unknown> | null
  fingerprint: string
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

type AgentOpsProjectPolicyRow = {
  id: string
  org_id: string
  project_id: string | null
  safety_mode: AgentOpsProjectSafetyMode
  policy: AgentOpsSafetyPolicy | null
  status: AgentOpsProjectPolicy['status']
  metadata: Record<string, unknown> | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

const PROJECT_LEARNING_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'assistant_id',
  'ops_run_id',
  'learning_type',
  'trust_level',
  'status',
  'title',
  'body',
  'confidence',
  'fingerprint',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const DECISION_PREFERENCE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'preference_key',
  'question_pattern',
  'preferred_decision',
  'risk_level',
  'source_kind',
  'status',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const AGENT_OPS_EVAL_RUN_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'ops_run_id',
  'workflow_id',
  'target_kind',
  'target_ref',
  'status',
  'score',
  'pass_rate',
  'latency_ms',
  'cost_usd',
  'token_count',
  'metadata',
  'created_at',
  'completed_at',
].join(', ')

const AGENT_OPS_SECURITY_ATTEMPT_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'assistant_id',
  'ops_run_id',
  'source_kind',
  'source_ref',
  'severity',
  'status',
  'title',
  'body',
  'metadata',
  'created_at',
].join(', ')

const AGENT_OPS_CONTEXT_SNAPSHOT_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'assistant_id',
  'ops_run_id',
  'snapshot_kind',
  'title',
  'summary',
  'state',
  'fingerprint',
  'metadata',
  'created_by',
  'created_at',
].join(', ')

const AGENT_OPS_PROJECT_POLICY_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'safety_mode',
  'policy',
  'status',
  'metadata',
  'updated_by',
  'created_at',
  'updated_at',
].join(', ')

const AGENT_OPS_PERFORMANCE_COLUMNS = [
  'status',
  'latency_ms',
  'cost_usd',
  'total_tokens',
  'created_at',
].join(', ')

const AGENT_OPS_SPECIALIST_TELEMETRY_RUN_COLUMNS = [
  'id',
  'project_id',
  'assistant_id',
  'workflow_id',
  'status',
  'latency_ms',
  'cost_usd',
  'total_tokens',
  'metadata',
  'created_at',
].join(', ')

const AGENT_OPS_SPECIALIST_TELEMETRY_FINDING_COLUMNS = [
  'id',
  'ops_run_id',
  'severity',
  'status',
  'confidence',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

export async function createProjectLearning(input: ProjectLearningInput): Promise<ProjectLearning> {
  const sanitized = sanitizeProjectLearning(input)
  const fingerprint = buildProjectLearningFingerprint(sanitized)
  const { data, error } = await supabase
    .from('project_learnings')
    .insert({
      org_id: sanitized.orgId,
      project_id: sanitized.projectId ?? null,
      assistant_id: sanitized.assistantId ?? null,
      ops_run_id: sanitized.opsRunId ?? null,
      learning_type: sanitized.type,
      trust_level: sanitized.trustLevel,
      title: sanitized.title,
      body: sanitized.body,
      source_kind: sanitized.sourceKind,
      source_ref: sanitized.sourceRef ?? null,
      confidence: sanitized.confidence,
      fingerprint,
      metadata: sanitized.metadata,
      created_by: sanitized.createdBy ?? null,
    })
    .select(PROJECT_LEARNING_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, projectId: input.projectId ?? undefined, operation: 'createProjectLearning' },
      tags: { layer: 'database', table: 'project_learnings' },
    })
    throw error
  }

  return mapProjectLearning(data as unknown as ProjectLearningRow)
}

export async function listProjectLearnings(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  limit?: number
}): Promise<ProjectLearning[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('project_learnings')
    .select(PROJECT_LEARNING_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listProjectLearnings' },
      tags: { layer: 'database', table: 'project_learnings' },
    })
    return []
  }

  return ((data ?? []) as unknown as ProjectLearningRow[]).map(mapProjectLearning)
}

export async function updateProjectLearning(input: {
  orgId: string
  learningId: string
  status?: ProjectLearning['status']
  trustLevel?: ProjectLearning['trustLevel']
  confidence?: number
  metadata?: Record<string, unknown>
}): Promise<ProjectLearning> {
  const { data, error } = await supabase
    .from('project_learnings')
    .update({
      ...(input.status ? { status: input.status } : {}),
      ...(input.trustLevel ? { trust_level: input.trustLevel } : {}),
      ...(typeof input.confidence === 'number' ? { confidence: input.confidence } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', input.orgId)
    .eq('id', input.learningId)
    .select(PROJECT_LEARNING_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, learningId: input.learningId, operation: 'updateProjectLearning' },
      tags: { layer: 'database', table: 'project_learnings' },
    })
    throw error
  }

  return mapProjectLearning(data as unknown as ProjectLearningRow)
}

export async function createDecisionPreference(input: DecisionPreferenceInput): Promise<DecisionPreference> {
  const parsed = decisionPreferenceInputSchema.parse(input)
  const { data, error } = await supabase
    .from('workspace_decision_preferences')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      preference_key: parsed.key,
      question_pattern: parsed.questionPattern,
      preferred_decision: parsed.preferredDecision,
      risk_level: parsed.riskLevel,
      source_kind: parsed.sourceKind,
      metadata: parsed.metadata,
      created_by: parsed.createdBy ?? null,
    })
    .select(DECISION_PREFERENCE_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, projectId: input.projectId ?? undefined, operation: 'createDecisionPreference' },
      tags: { layer: 'database', table: 'workspace_decision_preferences' },
    })
    throw error
  }

  return mapDecisionPreference(data as unknown as DecisionPreferenceRow)
}

export async function listDecisionPreferences(input: {
  orgId: string
  projectId?: string | null
  limit?: number
}): Promise<DecisionPreference[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let query = supabase
    .from('workspace_decision_preferences')
    .select(DECISION_PREFERENCE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listDecisionPreferences' },
      tags: { layer: 'database', table: 'workspace_decision_preferences' },
    })
    return []
  }

  return ((data ?? []) as unknown as DecisionPreferenceRow[]).map(mapDecisionPreference)
}

export async function listAgentOpsEvalRuns(input: {
  orgId: string
  projectId?: string | null
  opsRunId?: string | null
  targetKind?: (typeof AGENT_OPS_EVAL_TARGET_KINDS)[number]
  limit?: number
}): Promise<AgentOpsEvalRunSummary[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let query = supabase
    .from('agent_ops_eval_runs')
    .select(AGENT_OPS_EVAL_RUN_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.opsRunId) query = query.eq('ops_run_id', input.opsRunId)
  if (input.targetKind) query = query.eq('target_kind', input.targetKind)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listAgentOpsEvalRuns' },
      tags: { layer: 'database', table: 'agent_ops_eval_runs' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsEvalRunRow[]).map(mapAgentOpsEvalRun)
}

export async function recordAgentOpsSecurityAttempt(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  sourceKind: string
  sourceRef?: string | null
  severity?: AgentOpsSecurityAttempt['severity']
  title: string
  body: string
  metadata?: Record<string, unknown>
}): Promise<AgentOpsSecurityAttempt> {
  const { data, error } = await supabase
    .from('agent_ops_security_attempts')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      assistant_id: input.assistantId ?? null,
      ops_run_id: input.opsRunId ?? null,
      source_kind: input.sourceKind,
      source_ref: input.sourceRef ?? null,
      severity: input.severity ?? 'medium',
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? {},
    })
    .select(AGENT_OPS_SECURITY_ATTEMPT_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'recordAgentOpsSecurityAttempt' },
      tags: { layer: 'database', table: 'agent_ops_security_attempts' },
    })
    throw error
  }

  return mapAgentOpsSecurityAttempt(data as unknown as AgentOpsSecurityAttemptRow)
}

export async function listAgentOpsSecurityAttempts(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  limit?: number
}): Promise<AgentOpsSecurityAttempt[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let query = supabase
    .from('agent_ops_security_attempts')
    .select(AGENT_OPS_SECURITY_ATTEMPT_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.opsRunId) query = query.eq('ops_run_id', input.opsRunId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listAgentOpsSecurityAttempts' },
      tags: { layer: 'database', table: 'agent_ops_security_attempts' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsSecurityAttemptRow[]).map(mapAgentOpsSecurityAttempt)
}

export async function createAgentOpsContextSnapshot(input: AgentOpsContextSnapshotInput): Promise<AgentOpsContextSnapshot> {
  const parsed = contextSnapshotInputSchema.parse(input)
  const fingerprint = buildContextSnapshotFingerprint(parsed)
  const { data, error } = await supabase
    .from('agent_ops_context_snapshots')
    .upsert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      assistant_id: parsed.assistantId ?? null,
      ops_run_id: parsed.opsRunId ?? null,
      snapshot_kind: parsed.kind,
      title: parsed.title,
      summary: parsed.summary ?? null,
      state: parsed.state,
      fingerprint,
      metadata: parsed.metadata,
      created_by: parsed.createdBy ?? null,
    }, { onConflict: 'org_id,fingerprint' })
    .select(AGENT_OPS_CONTEXT_SNAPSHOT_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'createAgentOpsContextSnapshot' },
      tags: { layer: 'database', table: 'agent_ops_context_snapshots' },
    })
    throw error
  }

  return mapAgentOpsContextSnapshot(data as unknown as AgentOpsContextSnapshotRow)
}

export async function listAgentOpsContextSnapshots(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  limit?: number
}): Promise<AgentOpsContextSnapshot[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let query = supabase
    .from('agent_ops_context_snapshots')
    .select(AGENT_OPS_CONTEXT_SNAPSHOT_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.opsRunId) query = query.eq('ops_run_id', input.opsRunId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listAgentOpsContextSnapshots' },
      tags: { layer: 'database', table: 'agent_ops_context_snapshots' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsContextSnapshotRow[]).map(mapAgentOpsContextSnapshot)
}

export async function upsertAgentOpsProjectPolicy(input: AgentOpsProjectSafetyPolicyInput): Promise<AgentOpsProjectPolicy> {
  const parsed = projectSafetyPolicyInputSchema.parse(input)
  const policy = resolveSafetyPolicy(parsed.mode)
  const upsertPolicy = async (updatedBy: string | null) => supabase
    .from('agent_ops_project_policies')
    .upsert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      safety_mode: parsed.mode,
      policy,
      status: 'active',
      metadata: parsed.metadata,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,project_key,status' })
    .select(AGENT_OPS_PROJECT_POLICY_COLUMNS)
    .single()

  let { data, error } = await upsertPolicy(parsed.updatedBy ?? null)
  if (error?.code === '23503' && parsed.updatedBy) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        projectId: input.projectId ?? undefined,
        operation: 'upsertAgentOpsProjectPolicy',
        fallback: 'retry_without_updated_by',
      },
      tags: { layer: 'database', table: 'agent_ops_project_policies' },
    })
    const retry = await upsertPolicy(null)
    data = retry.data
    error = retry.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, projectId: input.projectId ?? undefined, operation: 'upsertAgentOpsProjectPolicy' },
      tags: { layer: 'database', table: 'agent_ops_project_policies' },
    })
    throw error
  }

  return mapAgentOpsProjectPolicy(data as unknown as AgentOpsProjectPolicyRow)
}

export async function getAgentOpsProjectPolicy(input: {
  orgId: string
  projectId?: string | null
}): Promise<AgentOpsProjectPolicy | null> {
  let query = supabase
    .from('agent_ops_project_policies')
    .select(AGENT_OPS_PROJECT_POLICY_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('status', 'active')
    .limit(1)

  query = input.projectId ? query.eq('project_id', input.projectId) : query.is('project_id', null)

  const { data, error } = await query.single()
  if (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code !== 'PGRST116') {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { orgId: input.orgId, projectId: input.projectId ?? undefined, operation: 'getAgentOpsProjectPolicy' },
        tags: { layer: 'database', table: 'agent_ops_project_policies' },
      })
    }
    return null
  }

  return data ? mapAgentOpsProjectPolicy(data as unknown as AgentOpsProjectPolicyRow) : null
}

export async function getAgentOpsPerformanceSummary(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  windowDays?: number
  limit?: number
}): Promise<AgentOpsPerformanceSummary> {
  const windowDays = Math.min(Math.max(input.windowDays ?? 14, 1), 90)
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 2_000)
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1_000).toISOString()

  let query = supabase
    .from('agent_ops_runs')
    .select(AGENT_OPS_PERFORMANCE_COLUMNS)
    .eq('org_id', input.orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'getAgentOpsPerformanceSummary' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    return emptyAgentOpsPerformanceSummary(windowDays)
  }

  return summarizeAgentOpsPerformance((data ?? []) as unknown as AgentOpsPerformanceRunRow[], windowDays)
}

export async function listAgentOpsSpecialistTelemetry(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  runLimit?: number
  limit?: number
}): Promise<AgentOpsSpecialistTelemetrySummary[]> {
  const runLimit = Math.min(Math.max(input.runLimit ?? 200, 1), 1_000)
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50)

  let runQuery = supabase
    .from('agent_ops_runs')
    .select(AGENT_OPS_SPECIALIST_TELEMETRY_RUN_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(runLimit)

  if (input.projectId) runQuery = runQuery.eq('project_id', input.projectId)
  if (input.assistantId) runQuery = runQuery.eq('assistant_id', input.assistantId)

  const { data: runRows, error: runError } = await runQuery
  if (runError) {
    ErrorService.captureException(runError, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listAgentOpsSpecialistTelemetry:runs' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    return []
  }

  const runs = ((runRows ?? []) as unknown as AgentOpsSpecialistTelemetryRunRow[]).map(mapAgentOpsSpecialistTelemetryRun)
  if (runs.length === 0) return []

  const runIds = runs.map((run) => run.id)
  const findingLimit = Math.min(Math.max(runIds.length * 10, 100), 2_000)
  const { data: findingRows, error: findingError } = await supabase
    .from('agent_ops_findings')
    .select(AGENT_OPS_SPECIALIST_TELEMETRY_FINDING_COLUMNS)
    .eq('org_id', input.orgId)
    .in('ops_run_id', runIds)
    .order('updated_at', { ascending: false })
    .limit(findingLimit)

  if (findingError) {
    ErrorService.captureException(findingError, {
      severity: 'warning',
      context: { orgId: input.orgId, runCount: runIds.length, operation: 'listAgentOpsSpecialistTelemetry:findings' },
      tags: { layer: 'database', table: 'agent_ops_findings' },
    })
    return summarizeAgentOpsSpecialistTelemetry({ runs, findings: [], limit })
  }

  return summarizeAgentOpsSpecialistTelemetry({
    runs,
    findings: ((findingRows ?? []) as unknown as AgentOpsSpecialistTelemetryFindingRow[])
      .map(mapAgentOpsSpecialistTelemetryFinding),
    limit,
  })
}

export const supabaseAgentOpsSpecialistTelemetryProvider = Object.freeze({
  async list(input: {
    orgId: string
    projectId?: string | null
    assistantId?: string | null
  }): Promise<AgentOpsSpecialistTelemetrySummary[]> {
    return listAgentOpsSpecialistTelemetry({
      orgId: input.orgId,
      projectId: input.projectId,
      assistantId: input.assistantId,
      runLimit: 100,
      limit: 20,
    })
  },
})

export async function recordAgentOpsEvalRun(input: {
  orgId: string
  projectId?: string | null
  opsRunId?: string | null
  workflowId?: string | null
  targetKind: 'workflow' | 'template' | 'model' | 'channel' | 'runtime' | 'memory' | 'release'
  targetRef?: string | null
  latencyMs?: number | null
  costUsd?: number | null
  tokenCount?: number | null
  results: AgentOpsEvalResultInput[]
  metadata?: Record<string, unknown>
  createdBy?: string | null
}): Promise<{ evalRunId: string; score: number | null; passRate: number | null }> {
  const results = input.results.map((result) => agentOpsEvalResultInputSchema.parse(result))
  const summary = summarizeEvalResults(results)
  const { data: run, error: runError } = await supabase
    .from('agent_ops_eval_runs')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      ops_run_id: input.opsRunId ?? null,
      workflow_id: input.workflowId ?? null,
      target_kind: input.targetKind,
      target_ref: input.targetRef ?? null,
      status: 'completed',
      score: summary.score,
      pass_rate: summary.passRate,
      latency_ms: input.latencyMs == null ? null : Math.max(0, Math.round(input.latencyMs)),
      cost_usd: input.costUsd ?? null,
      token_count: input.tokenCount == null ? null : Math.max(0, Math.round(input.tokenCount)),
      metadata: {
        ...input.metadata,
        result_count: summary.resultCount,
        failed_count: summary.failedCount,
        warning_count: summary.warningCount,
        skipped_count: summary.skippedCount,
      },
      created_by: input.createdBy ?? null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runError) {
    ErrorService.captureException(runError, {
      severity: 'error',
      context: { orgId: input.orgId, targetKind: input.targetKind, operation: 'recordAgentOpsEvalRun' },
      tags: { layer: 'database', table: 'agent_ops_eval_runs' },
    })
    throw runError
  }

  const evalRunId = (run as { id: string }).id
  if (results.length > 0) {
    const { error: resultError } = await supabase
      .from('agent_ops_eval_results')
      .insert(results.map((result) => ({
        org_id: input.orgId,
        eval_run_id: evalRunId,
        scenario_slug: result.scenarioSlug,
        status: result.status,
        score: result.score ?? null,
        summary: result.summary,
        evidence: result.evidence,
        metrics: result.metrics,
        metadata: result.metadata,
      })))

    if (resultError) {
      ErrorService.captureException(resultError, {
        severity: 'error',
        context: { orgId: input.orgId, evalRunId, operation: 'recordAgentOpsEvalResults' },
        tags: { layer: 'database', table: 'agent_ops_eval_results' },
      })
      throw resultError
    }
  }

  return { evalRunId, score: summary.score, passRate: summary.passRate }
}

function summarizeAgentOpsPerformance(rows: AgentOpsPerformanceRunRow[], windowDays: number): AgentOpsPerformanceSummary {
  const latencies = rows
    .map((row) => normalizeMetricNumber(row.latency_ms))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)
  const costs = rows.map((row) => normalizeMetricNumber(row.cost_usd) ?? 0)
  const tokens = rows.map((row) => normalizeMetricNumber(row.total_tokens) ?? 0)
  const totalCostUsd = roundMetric(costs.reduce((sum, value) => sum + value, 0), 6)
  const totalTokens = Math.round(tokens.reduce((sum, value) => sum + value, 0))
  const runCount = rows.length

  return {
    runCount,
    completedRunCount: rows.filter((row) => row.status === 'completed').length,
    failedRunCount: rows.filter((row) => row.status === 'failed' || row.status === 'cancelled').length,
    measuredRunCount: latencies.length,
    avgLatencyMs: latencies.length > 0
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null,
    p95LatencyMs: percentile(latencies, 0.95),
    totalCostUsd,
    avgCostUsd: runCount > 0 ? roundMetric(totalCostUsd / runCount, 6) : null,
    totalTokens,
    avgTokens: runCount > 0 ? Math.round(totalTokens / runCount) : null,
    windowDays,
  }
}

function emptyAgentOpsPerformanceSummary(windowDays: number): AgentOpsPerformanceSummary {
  return {
    runCount: 0,
    completedRunCount: 0,
    failedRunCount: 0,
    measuredRunCount: 0,
    avgLatencyMs: null,
    p95LatencyMs: null,
    totalCostUsd: 0,
    avgCostUsd: null,
    totalTokens: 0,
    avgTokens: null,
    windowDays,
  }
}

function normalizeMetricNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1)
  return Math.round(values[index])
}

function roundMetric(value: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function mapProjectLearning(row: ProjectLearningRow): ProjectLearning {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    assistantId: row.assistant_id,
    opsRunId: row.ops_run_id,
    type: row.learning_type,
    trustLevel: row.trust_level,
    status: row.status,
    title: row.title,
    body: row.body,
    confidence: Number(row.confidence),
    fingerprint: row.fingerprint,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDecisionPreference(row: DecisionPreferenceRow): DecisionPreference {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    key: row.preference_key,
    questionPattern: row.question_pattern,
    preferredDecision: row.preferred_decision,
    riskLevel: row.risk_level,
    sourceKind: row.source_kind,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAgentOpsEvalRun(row: AgentOpsEvalRunRow): AgentOpsEvalRunSummary {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    opsRunId: row.ops_run_id,
    workflowId: row.workflow_id,
    targetKind: row.target_kind,
    targetRef: row.target_ref,
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    passRate: row.pass_rate === null ? null : Number(row.pass_rate),
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    tokenCount: row.token_count === null ? null : Number(row.token_count),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

function mapAgentOpsContextSnapshot(row: AgentOpsContextSnapshotRow): AgentOpsContextSnapshot {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    assistantId: row.assistant_id,
    opsRunId: row.ops_run_id,
    kind: row.snapshot_kind,
    title: row.title,
    summary: row.summary,
    state: row.state ?? {},
    fingerprint: row.fingerprint,
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function mapAgentOpsProjectPolicy(row: AgentOpsProjectPolicyRow): AgentOpsProjectPolicy {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    safetyMode: row.safety_mode,
    policy: row.policy ?? resolveSafetyPolicy(row.safety_mode),
    status: row.status,
    metadata: row.metadata ?? {},
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAgentOpsSecurityAttempt(row: AgentOpsSecurityAttemptRow): AgentOpsSecurityAttempt {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    assistantId: row.assistant_id,
    opsRunId: row.ops_run_id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    severity: row.severity,
    status: row.status,
    title: row.title,
    body: row.body,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapAgentOpsSpecialistTelemetryRun(row: AgentOpsSpecialistTelemetryRunRow): AgentOpsSpecialistTelemetryRunInput {
  return {
    id: row.id,
    projectId: row.project_id,
    assistantId: row.assistant_id,
    workflowId: row.workflow_id,
    status: row.status,
    latencyMs: normalizeMetricNumber(row.latency_ms),
    costUsd: normalizeMetricNumber(row.cost_usd),
    totalTokens: normalizeMetricNumber(row.total_tokens),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapAgentOpsSpecialistTelemetryFinding(row: AgentOpsSpecialistTelemetryFindingRow): AgentOpsSpecialistTelemetryFindingInput {
  return {
    id: row.id,
    runId: row.ops_run_id,
    severity: row.severity,
    status: row.status,
    confidence: normalizeMetricNumber(row.confidence),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
