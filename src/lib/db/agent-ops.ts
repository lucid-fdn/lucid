import 'server-only'

import type {
  AgentOpsArtifact,
  AgentOpsBrowserQaSession,
  AgentOpsFinding,
  AgentOpsRun,
  AgentOpsRunStatus,
  AgentOpsBrowserQaSessionStatus,
  AgentOpsRunMode,
  AgentOpsWorkflowId,
  AppendAgentOpsArtifactInput,
  AppendAgentOpsFindingInput,
  StartAgentOpsRunInput,
} from '@/lib/agent-ops/workflow-types'
import type { AgentOpsEvidenceStore, AgentOpsRunModeRecorder, AgentOpsRunStore } from '@/lib/agent-ops/ports'
import type { AgentOpsRunModePolicy } from '@contracts/agent-ops-run-mode'
import type { AgentOpsBrowserSessionEvent } from '@/lib/agent-ops/browser-live-sessions'
import type {
  AgentOpsBrowserSessionShare,
  AgentOpsBrowserSessionSharedAction,
} from '@/lib/agent-ops/browser-session-sharing'
import type {
  AgentOpsDesignFeedback,
  AgentOpsOperatorProfile,
} from '@/lib/agent-ops/design-ops'
import type { AgentOpsDecisionEvent } from '@/lib/agent-ops/decision-pacing'
import type { AgentOpsWorkflowDefinition } from '@/lib/agent-ops/workflow-types'
import type { EvalReceipt } from '@contracts/eval-receipts'
import { listAgentOpsBrowserSessionEventsForRun } from './agent-ops-browser-session-events'
import {
  listAgentOpsBrowserSessionSharedActions,
  listAgentOpsBrowserSessionShares,
} from './agent-ops-browser-session-shares'
import { listAgentOpsDecisionEvents } from './agent-ops-decision-events'
import {
  listAgentOpsDesignFeedback,
  listAgentOpsOperatorProfiles,
} from './agent-ops-operator-profiles'
import { listEvalReceipts } from './eval-receipts'
import { ErrorService, supabase } from './client'

const RUN_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'assistant_id',
  'requested_by',
  'workflow_id',
  'workflow_slug',
  'workflow_version',
  'status',
  'run_mode',
  'scope_type',
  'scope_ref',
  'scope_label',
  'input',
  'output',
  'output_sections',
  'orchestration_dag_id',
  'root_agent_run_id',
  'artifact_count',
  'finding_count',
  'latency_ms',
  'cost_usd',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'error_message',
  'metadata',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
].join(', ')

const ARTIFACT_COLUMNS = [
  'id',
  'org_id',
  'ops_run_id',
  'artifact_type',
  'title',
  'summary',
  'uri',
  'content',
  'checksum',
  'created_at',
].join(', ')

const FINDING_COLUMNS = [
  'id',
  'org_id',
  'ops_run_id',
  'severity',
  'status',
  'title',
  'body',
  'file_path',
  'start_line',
  'end_line',
  'confidence',
  'evidence_artifact_id',
  'fingerprint',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const BROWSER_QA_SESSION_COLUMNS = [
  'id',
  'org_id',
  'ops_run_id',
  'assistant_id',
  'session_key',
  'target_url',
  'status',
  'owner_runtime_id',
  'viewport',
  'artifact_count',
  'last_artifact_id',
  'last_error',
  'started_at',
  'completed_at',
  'expires_at',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const RUN_LINK_COLUMNS = [
  'id',
  'org_id',
  'ops_run_id',
  'link_type',
  'ref_id',
  'ref_text',
  'label',
  'metadata',
  'created_at',
].join(', ')

const PROJECT_TIMELINE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'ops_run_id',
  'event_type',
  'title',
  'body',
  'evidence',
  'metadata',
  'created_by',
  'created_at',
].join(', ')

const USAGE_EVENT_COLUMNS = [
  'id',
  'org_id',
  'ops_run_id',
  'source_kind',
  'source_ref',
  'duration_ms',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'cost_usd',
  'metadata',
  'created_at',
].join(', ')

type AgentOpsRunRow = {
  id: string
  org_id: string
  project_id: string | null
  assistant_id: string | null
  requested_by: string | null
  workflow_id: AgentOpsRun['workflowId']
  workflow_slug: string
  workflow_version: string
  status: AgentOpsRun['status']
  run_mode: AgentOpsRunMode | null
  scope_type: AgentOpsRun['scope']['type']
  scope_ref: string | null
  scope_label: string | null
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  output_sections: AgentOpsRun['metadata'] | string[] | null
  orchestration_dag_id: string | null
  root_agent_run_id: string | null
  artifact_count: number | null
  finding_count: number | null
  latency_ms: number | null
  cost_usd: number | string | null
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type AgentOpsArtifactRow = {
  id: string
  org_id: string
  ops_run_id: string
  artifact_type: AgentOpsArtifact['type']
  title: string
  summary: string | null
  uri: string | null
  content: Record<string, unknown> | null
  checksum: string | null
  created_at: string
}

type AgentOpsFindingRow = {
  id: string
  org_id: string
  ops_run_id: string
  severity: AgentOpsFinding['severity']
  status: AgentOpsFinding['status']
  title: string
  body: string
  file_path: string | null
  start_line: number | null
  end_line: number | null
  confidence: number | null
  evidence_artifact_id: string | null
  fingerprint: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type AgentOpsBrowserQaSessionRow = {
  id: string
  org_id: string
  ops_run_id: string
  assistant_id: string | null
  session_key: string
  target_url: string
  status: AgentOpsBrowserQaSessionStatus
  owner_runtime_id: string | null
  viewport: Record<string, unknown> | null
  artifact_count: number | null
  last_artifact_id: string | null
  last_error: string | null
  started_at: string
  completed_at: string | null
  expires_at: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AgentOpsRunLinkType =
  | 'agent_run'
  | 'orchestration_dag'
  | 'human_work_item'
  | 'approval'
  | 'template_deployment'
  | 'external'

type AgentOpsRunLinkRow = {
  id: string
  org_id: string
  ops_run_id: string
  link_type: AgentOpsRunLinkType
  ref_id: string | null
  ref_text: string | null
  label: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type AgentOpsProjectTimelineEventRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string | null
  event_type:
    | 'agent_ops_run_started'
    | 'agent_ops_performance_alert'
    | 'agent_ops_performance_alert_resolved'
    | 'learning_created'
    | 'learning_superseded'
    | 'decision_recorded'
    | 'eval_completed'
    | 'release_shipped'
    | 'incident_investigated'
    | 'retro_completed'
  title: string
  body: string | null
  evidence: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

export interface AgentOpsRunLink {
  id: string
  orgId: string
  runId: string
  linkType: AgentOpsRunLinkType
  refId: string | null
  refText: string | null
  label: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AgentOpsProjectTimelineEvent {
  id: string
  orgId: string
  projectId: string | null
  runId: string | null
  eventType: AgentOpsProjectTimelineEventRow['event_type']
  title: string
  body: string | null
  evidence: Record<string, unknown>
  metadata: Record<string, unknown>
  createdBy: string | null
  createdAt: string
}

export interface AgentOpsRunUsageEvent {
  id: string
  orgId: string
  runId: string
  sourceKind: 'orchestration_step' | 'browser_qa' | 'agent_run' | 'manual' | 'external'
  sourceRef: string | null
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  metadata: Record<string, unknown>
  createdAt: string
}

type AgentOpsRunUsageEventRow = {
  id: string
  org_id: string
  ops_run_id: string
  source_kind: AgentOpsRunUsageEvent['sourceKind']
  source_ref: string | null
  duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  cost_usd: number | string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export const supabaseAgentOpsRunStore: AgentOpsRunStore = {
  createRun: createAgentOpsRun,
  getRun: getAgentOpsRun,
  updateRunStatus: updateAgentOpsRunStatus,
}

export const supabaseAgentOpsEvidenceStore: AgentOpsEvidenceStore = {
  appendArtifact: appendAgentOpsArtifactRow,
  appendFinding: appendAgentOpsFindingRow,
}

export const supabaseAgentOpsRunModeRecorder: AgentOpsRunModeRecorder = {
  record: recordAgentOpsRunModeEvent,
}

export interface ListAgentOpsRunsOptions {
  status?: AgentOpsRunStatus | AgentOpsRunStatus[]
  workflowId?: AgentOpsWorkflowId
  projectId?: string
  assistantId?: string
  limit?: number
  offset?: number
}

export interface AgentOpsRunDetail {
  run: AgentOpsRun
  artifacts: AgentOpsArtifact[]
  findings: AgentOpsFinding[]
  browserQaSessions: AgentOpsBrowserQaSession[]
  browserSessionEvents: AgentOpsBrowserSessionEvent[]
  browserSessionShares: AgentOpsBrowserSessionShare[]
  browserSessionSharedActions: AgentOpsBrowserSessionSharedAction[]
  operatorProfiles: AgentOpsOperatorProfile[]
  designFeedback: AgentOpsDesignFeedback[]
  decisionEvents: AgentOpsDecisionEvent[]
  links: AgentOpsRunLink[]
  timelineEvents: AgentOpsProjectTimelineEvent[]
  usageEvents: AgentOpsRunUsageEvent[]
  evalReceipts: EvalReceipt[]
}

export async function createAgentOpsRun(
  input: StartAgentOpsRunInput & {
    workflow: AgentOpsWorkflowDefinition
    status: AgentOpsRun['status']
    errorMessage?: string | null
  },
): Promise<AgentOpsRun> {
  const { workflow } = input
  const { data, error } = await supabase
    .from('agent_ops_runs')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      assistant_id: input.assistantId ?? null,
      requested_by: input.requestedByUserId ?? null,
      workflow_id: workflow.id,
      workflow_slug: workflow.slug,
      workflow_version: workflow.version,
      status: input.status,
      run_mode: input.runMode ?? 'execute',
      safety_mode: workflow.safetyMode,
      scope_type: input.scope.type,
      scope_ref: input.scope.ref ?? null,
      scope_label: input.scope.label ?? null,
      input: input.input,
      error_message: input.errorMessage ?? null,
      output_sections: workflow.outputSections,
      metadata: {
        ...input.metadata,
        workflow_name: workflow.name,
        execution_mode: workflow.executionMode,
        run_mode: input.runMode ?? 'execute',
      },
    })
    .select(RUN_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, workflowId: workflow.id, operation: 'createAgentOpsRun' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    throw error
  }

  return mapRun(data as unknown as AgentOpsRunRow)
}

export async function getAgentOpsRun(runId: string): Promise<AgentOpsRun | null> {
  const { data, error } = await supabase
    .from('agent_ops_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { runId, operation: 'getAgentOpsRun' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    return null
  }

  return data ? mapRun(data as unknown as AgentOpsRunRow) : null
}

export async function updateAgentOpsRunMetadata(input: {
  runId: string
  orgId: string
  metadata: Record<string, unknown>
}): Promise<AgentOpsRun> {
  const { data, error } = await supabase
    .from('agent_ops_runs')
    .update({ metadata: input.metadata })
    .eq('id', input.runId)
    .eq('org_id', input.orgId)
    .select(RUN_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, runId: input.runId, operation: 'updateAgentOpsRunMetadata' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    throw error
  }

  return mapRun(data as unknown as AgentOpsRunRow)
}

export async function getAgentOpsRunForOrg(
  orgId: string,
  runId: string,
): Promise<AgentOpsRun | null> {
  const { data, error } = await supabase
    .from('agent_ops_runs')
    .select(RUN_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, runId, operation: 'getAgentOpsRunForOrg' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    return null
  }

  return data ? mapRun(data as unknown as AgentOpsRunRow) : null
}

export async function listAgentOpsRunsForOrg(
  orgId: string,
  opts: ListAgentOpsRunsOptions = {},
): Promise<AgentOpsRun[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const offset = Math.min(Math.max(opts.offset ?? 0, 0), 10_000)

  let query = supabase
    .from('agent_ops_runs')
    .select(RUN_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
    query = query.in('status', statuses)
  }
  if (opts.workflowId) query = query.eq('workflow_id', opts.workflowId)
  if (opts.projectId) query = query.eq('project_id', opts.projectId)
  if (opts.assistantId) query = query.eq('assistant_id', opts.assistantId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'listAgentOpsRunsForOrg' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsRunRow[]).map(mapRun)
}

export async function listAgentOpsArtifactsForRun(
  orgId: string,
  runId: string,
  limit = 100,
): Promise<AgentOpsArtifact[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 500)
  const { data, error } = await supabase
    .from('agent_ops_artifacts')
    .select(ARTIFACT_COLUMNS)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, runId, operation: 'listAgentOpsArtifactsForRun' },
      tags: { layer: 'database', table: 'agent_ops_artifacts' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsArtifactRow[]).map(mapArtifact)
}

export async function listAgentOpsFindingsForRun(
  orgId: string,
  runId: string,
  options: { status?: AgentOpsFinding['status']; limit?: number } = {},
): Promise<AgentOpsFinding[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
  let query = supabase
    .from('agent_ops_findings')
    .select(FINDING_COLUMNS)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.status) query = query.eq('status', options.status)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, runId, status: options.status, operation: 'listAgentOpsFindingsForRun' },
      tags: { layer: 'database', table: 'agent_ops_findings' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsFindingRow[]).map(mapFinding)
}

export async function getAgentOpsRunDetail(
  orgId: string,
  runId: string,
): Promise<AgentOpsRunDetail | null> {
  const run = await getAgentOpsRunForOrg(orgId, runId)
  if (!run) return null

  const [
    artifacts,
    findings,
    browserQaSessions,
    browserSessionEvents,
    browserSessionShares,
    browserSessionSharedActions,
    operatorProfiles,
    designFeedback,
    decisionEvents,
    links,
    timelineEvents,
    usageEvents,
    evalReceipts,
  ] = await Promise.all([
    listAgentOpsArtifactsForRun(orgId, runId),
    listAgentOpsFindingsForRun(orgId, runId),
    listAgentOpsBrowserQaSessionsForRun(orgId, runId),
    listAgentOpsBrowserSessionEventsForRun(orgId, runId),
    listAgentOpsBrowserSessionShares({ orgId, runId, limit: 100 }),
    listAgentOpsBrowserSessionSharedActions({ orgId, runId, limit: 100 }),
    listAgentOpsOperatorProfiles({ orgId, projectId: run.projectId, limit: 20 }),
    listAgentOpsDesignFeedback({ orgId, runId, limit: 100 }),
    listAgentOpsDecisionEvents({ orgId, runId, limit: 100 }),
    listAgentOpsRunLinksForRun(orgId, runId),
    listAgentOpsProjectTimelineEventsForRun(orgId, runId),
    listAgentOpsRunUsageEventsForRun(orgId, runId),
    listEvalReceipts({ orgId, runId, limit: 50 }),
  ])

  return {
    run,
    artifacts,
    findings,
    browserQaSessions,
    browserSessionEvents,
    browserSessionShares,
    browserSessionSharedActions,
    operatorProfiles,
    designFeedback,
    decisionEvents,
    links,
    timelineEvents,
    usageEvents,
    evalReceipts,
  }
}

export async function listAgentOpsRunUsageEventsForRun(
  orgId: string,
  runId: string,
  limit = 100,
): Promise<AgentOpsRunUsageEvent[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await supabase
    .from('agent_ops_run_usage_events')
    .select(USAGE_EVENT_COLUMNS)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, runId, operation: 'listAgentOpsRunUsageEventsForRun' },
      tags: { layer: 'database', table: 'agent_ops_run_usage_events' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsRunUsageEventRow[]).map(mapUsageEvent)
}

export async function listAgentOpsRunLinksForRun(
  orgId: string,
  runId: string,
  limit = 100,
): Promise<AgentOpsRunLink[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await supabase
    .from('agent_ops_run_links')
    .select(RUN_LINK_COLUMNS)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, runId, operation: 'listAgentOpsRunLinksForRun' },
      tags: { layer: 'database', table: 'agent_ops_run_links' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsRunLinkRow[]).map(mapRunLink)
}

export async function listAgentOpsProjectTimelineEventsForRun(
  orgId: string,
  runId: string,
  limit = 50,
): Promise<AgentOpsProjectTimelineEvent[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await supabase
    .from('project_timeline_events')
    .select(PROJECT_TIMELINE_COLUMNS)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, runId, operation: 'listAgentOpsProjectTimelineEventsForRun' },
      tags: { layer: 'database', table: 'project_timeline_events' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsProjectTimelineEventRow[]).map(mapProjectTimelineEvent)
}

export async function listAgentOpsPerformanceAlertTimelineEvents(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  limit?: number
}): Promise<AgentOpsProjectTimelineEvent[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 10, 1), 50)
  let query = supabase
    .from('project_timeline_events')
    .select(PROJECT_TIMELINE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('event_type', 'agent_ops_performance_alert')

  if (input.projectId) {
    query = query.eq('project_id', input.projectId)
  }
  if (input.assistantId) {
    query = query.contains('metadata', { assistant_id: input.assistantId })
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        projectId: input.projectId ?? undefined,
        assistantId: input.assistantId ?? undefined,
        operation: 'listAgentOpsPerformanceAlertTimelineEvents',
      },
      tags: { layer: 'database', table: 'project_timeline_events' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsProjectTimelineEventRow[]).map(mapProjectTimelineEvent)
}

export async function listAgentOpsBrowserQaSessionsForRun(
  orgId: string,
  runId: string,
  limit = 50,
): Promise<AgentOpsBrowserQaSession[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await supabase
    .from('agent_ops_browser_qa_sessions')
    .select(BROWSER_QA_SESSION_COLUMNS)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('updated_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, runId, operation: 'listAgentOpsBrowserQaSessionsForRun' },
      tags: { layer: 'database', table: 'agent_ops_browser_qa_sessions' },
    })
    return []
  }

  return ((data ?? []) as unknown as AgentOpsBrowserQaSessionRow[]).map(mapBrowserQaSession)
}

export async function upsertAgentOpsBrowserQaSession(input: {
  orgId: string
  runId: string
  assistantId?: string | null
  sessionKey: string
  targetUrl: string
  status?: AgentOpsBrowserQaSessionStatus
  ownerRuntimeId?: string | null
  viewport?: Record<string, unknown>
  lastArtifactId?: string | null
  lastError?: string | null
  metadata?: Record<string, unknown>
}): Promise<AgentOpsBrowserQaSession> {
  const completedAt = input.status === 'completed' || !input.status
    ? new Date().toISOString()
    : null
  const { data, error } = await supabase
    .from('agent_ops_browser_qa_sessions')
    .upsert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      assistant_id: input.assistantId ?? null,
      session_key: input.sessionKey,
      target_url: input.targetUrl,
      status: input.status ?? 'completed',
      owner_runtime_id: input.ownerRuntimeId ?? null,
      viewport: input.viewport ?? {},
      artifact_count: 1,
      last_artifact_id: input.lastArtifactId ?? null,
      last_error: input.lastError ?? null,
      completed_at: completedAt,
      metadata: input.metadata ?? {},
    }, { onConflict: 'org_id,ops_run_id,session_key' })
    .select(BROWSER_QA_SESSION_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, runId: input.runId, operation: 'upsertAgentOpsBrowserQaSession' },
      tags: { layer: 'database', table: 'agent_ops_browser_qa_sessions' },
    })
    throw error
  }

  return mapBrowserQaSession(data as unknown as AgentOpsBrowserQaSessionRow)
}

export async function updateAgentOpsRunStatus(input: {
  runId: string
  orgId: string
  status: AgentOpsRun['status']
  errorMessage?: string | null
  orchestrationDagId?: string | null
  rootAgentRunId?: string | null
  output?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}): Promise<AgentOpsRun> {
  const patch: Record<string, unknown> = {
    status: input.status,
  }

  if (input.status === 'running') patch.started_at = new Date().toISOString()
  if (['completed', 'failed', 'cancelled'].includes(input.status)) {
    patch.completed_at = new Date().toISOString()
  }
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage
  if (input.orchestrationDagId !== undefined) patch.orchestration_dag_id = input.orchestrationDagId
  if (input.rootAgentRunId !== undefined) patch.root_agent_run_id = input.rootAgentRunId
  if (input.output !== undefined) patch.output = input.output
  if (input.metadata !== undefined) patch.metadata = input.metadata

  const { data, error } = await supabase
    .from('agent_ops_runs')
    .update(patch)
    .eq('id', input.runId)
    .eq('org_id', input.orgId)
    .select(RUN_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, runId: input.runId, status: input.status, operation: 'updateAgentOpsRunStatus' },
      tags: { layer: 'database', table: 'agent_ops_runs' },
    })
    throw error
  }

  const run = mapRun(data as unknown as AgentOpsRunRow)
  await Promise.all([
    input.orchestrationDagId
      ? appendAgentOpsRunLink({
          orgId: input.orgId,
          runId: input.runId,
          linkType: 'orchestration_dag',
          refId: input.orchestrationDagId,
          label: 'Backing Nerve DAG',
        }).catch(() => null)
      : Promise.resolve(null),
    input.rootAgentRunId
      ? appendAgentOpsRunLink({
          orgId: input.orgId,
          runId: input.runId,
          linkType: 'agent_run',
          refId: input.rootAgentRunId,
          label: 'Root agent run',
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  return run
}

export async function recordAgentOpsRunModeEvent(input: {
  run: AgentOpsRun
  policy: AgentOpsRunModePolicy
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase
    .from('agent_ops_run_mode_events')
    .insert({
      org_id: input.run.orgId,
      ops_run_id: input.run.id,
      requested_mode: input.policy.requestedMode,
      effective_mode: input.policy.effectiveMode,
      reason: input.policy.reason,
      allowed_mutations: input.policy.allowedMutations,
      required_questions: input.policy.requiredQuestions,
      anti_shortcut_applied: input.policy.antiShortcutApplied,
      metadata: input.metadata ?? {},
    })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.run.orgId, runId: input.run.id, operation: 'recordAgentOpsRunModeEvent' },
      tags: { layer: 'database', table: 'agent_ops_run_mode_events' },
    })
  }
}

export async function appendAgentOpsRunLink(input: {
  orgId: string
  runId: string
  linkType: AgentOpsRunLinkType
  refId?: string | null
  refText?: string | null
  label?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  if (!input.refId && !input.refText) return

  const { error } = await supabase
    .from('agent_ops_run_links')
    .insert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      link_type: input.linkType,
      ref_id: input.refId ?? null,
      ref_text: input.refText ?? null,
      label: input.label ?? null,
      metadata: input.metadata ?? {},
    })

  if (error?.code === '23505') return

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, runId: input.runId, linkType: input.linkType, operation: 'appendAgentOpsRunLink' },
      tags: { layer: 'database', table: 'agent_ops_run_links' },
    })
  }
}

export async function recordAgentOpsRunUsageEvent(input: {
  orgId: string
  runId: string
  sourceKind: AgentOpsRunUsageEvent['sourceKind']
  sourceRef?: string | null
  durationMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  costUsd?: number | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const row = {
    org_id: input.orgId,
    ops_run_id: input.runId,
    source_kind: input.sourceKind,
    source_ref: input.sourceRef ?? null,
    duration_ms: normalizeNonNegativeInteger(input.durationMs),
    input_tokens: normalizeNonNegativeInteger(input.inputTokens),
    output_tokens: normalizeNonNegativeInteger(input.outputTokens),
    total_tokens: normalizeNonNegativeInteger(
      input.totalTokens ?? ((input.inputTokens ?? 0) + (input.outputTokens ?? 0) || null),
    ),
    cost_usd: normalizeNonNegativeNumber(input.costUsd),
    metadata: input.metadata ?? {},
  }

  const query = input.sourceRef
    ? supabase
        .from('agent_ops_run_usage_events')
        .upsert(row, { onConflict: 'ops_run_id,source_kind,source_ref' })
    : supabase
        .from('agent_ops_run_usage_events')
        .insert(row)

  const { error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, runId: input.runId, sourceKind: input.sourceKind, operation: 'recordAgentOpsRunUsageEvent' },
      tags: { layer: 'database', table: 'agent_ops_run_usage_events' },
    })
  }
}

export async function recordAgentOpsProjectTimelineEvent(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  eventType:
    | 'agent_ops_run_started'
    | 'agent_ops_performance_alert'
    | 'agent_ops_performance_alert_resolved'
    | 'learning_created'
    | 'learning_superseded'
    | 'decision_recorded'
    | 'eval_completed'
    | 'release_shipped'
    | 'incident_investigated'
    | 'retro_completed'
  title: string
  body?: string | null
  evidence?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdBy?: string | null
}): Promise<boolean> {
  if (!input.projectId) return false

  const { error } = await supabase
    .from('project_timeline_events')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId,
      ops_run_id: input.runId ?? null,
      event_type: input.eventType,
      title: input.title,
      body: input.body ?? null,
      evidence: input.evidence ?? {},
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? null,
    })

  if (error) {
    if (input.eventType === 'agent_ops_performance_alert' && readSupabaseErrorCode(error) === '23505') {
      return false
    }
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, projectId: input.projectId, runId: input.runId, operation: 'recordAgentOpsProjectTimelineEvent' },
      tags: { layer: 'database', table: 'project_timeline_events' },
    })
    return false
  }

  return true
}

function readSupabaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export async function appendAgentOpsArtifactRow(
  input: AppendAgentOpsArtifactInput,
): Promise<AgentOpsArtifact> {
  const { data, error } = await supabase
    .from('agent_ops_artifacts')
    .insert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      artifact_type: input.type,
      title: input.title,
      summary: input.summary ?? null,
      uri: input.uri ?? null,
      content: input.content,
      checksum: input.checksum ?? null,
    })
    .select(ARTIFACT_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, runId: input.runId, type: input.type, operation: 'appendAgentOpsArtifactRow' },
      tags: { layer: 'database', table: 'agent_ops_artifacts' },
    })
    throw error
  }

  return mapArtifact(data as unknown as AgentOpsArtifactRow)
}

export async function appendAgentOpsFindingRow(
  input: AppendAgentOpsFindingInput,
): Promise<AgentOpsFinding> {
  const { data, error } = await supabase
    .from('agent_ops_findings')
    .insert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      severity: input.severity,
      title: input.title,
      body: input.body,
      file_path: input.filePath ?? null,
      start_line: input.startLine ?? null,
      end_line: input.endLine ?? null,
      confidence: input.confidence ?? null,
      evidence_artifact_id: input.evidenceArtifactId ?? null,
      fingerprint: input.fingerprint ?? null,
      metadata: input.metadata,
    })
    .select(FINDING_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, runId: input.runId, severity: input.severity, operation: 'appendAgentOpsFindingRow' },
      tags: { layer: 'database', table: 'agent_ops_findings' },
    })
    throw error
  }

  return mapFinding(data as unknown as AgentOpsFindingRow)
}

function mapRun(row: AgentOpsRunRow): AgentOpsRun {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    assistantId: row.assistant_id,
    requestedByUserId: row.requested_by,
    workflowId: row.workflow_id,
    workflowVersion: row.workflow_version,
    status: row.status,
    runMode: row.run_mode ?? 'execute',
    scope: {
      type: row.scope_type,
      ref: row.scope_ref ?? undefined,
      label: row.scope_label ?? undefined,
      metadata: {},
    },
    input: row.input ?? {},
    output: row.output,
    agentRunIds: row.root_agent_run_id ? [row.root_agent_run_id] : [],
    orchestrationDagId: row.orchestration_dag_id,
    humanWorkItemIds: [],
    approvalIds: [],
    artifactCount: row.artifact_count ?? 0,
    findingCount: row.finding_count ?? 0,
    latencyMs: row.latency_ms,
    costUsd: Number(row.cost_usd ?? 0),
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    totalTokens: row.total_tokens ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapArtifact(row: AgentOpsArtifactRow): AgentOpsArtifact {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.ops_run_id,
    type: row.artifact_type,
    title: row.title,
    summary: row.summary,
    uri: row.uri,
    content: row.content ?? {},
    checksum: row.checksum,
    createdAt: row.created_at,
  }
}

function mapFinding(row: AgentOpsFindingRow): AgentOpsFinding {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.ops_run_id,
    severity: row.severity,
    status: row.status,
    title: row.title,
    body: row.body,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    confidence: row.confidence,
    evidenceArtifactId: row.evidence_artifact_id,
    fingerprint: row.fingerprint,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBrowserQaSession(row: AgentOpsBrowserQaSessionRow): AgentOpsBrowserQaSession {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.ops_run_id,
    assistantId: row.assistant_id,
    sessionKey: row.session_key,
    targetUrl: row.target_url,
    status: row.status,
    ownerRuntimeId: row.owner_runtime_id,
    viewport: row.viewport ?? {},
    artifactCount: row.artifact_count ?? 0,
    lastArtifactId: row.last_artifact_id,
    lastError: row.last_error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRunLink(row: AgentOpsRunLinkRow): AgentOpsRunLink {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.ops_run_id,
    linkType: row.link_type,
    refId: row.ref_id,
    refText: row.ref_text,
    label: row.label,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapProjectTimelineEvent(row: AgentOpsProjectTimelineEventRow): AgentOpsProjectTimelineEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.ops_run_id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    evidence: row.evidence ?? {},
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function mapUsageEvent(row: AgentOpsRunUsageEventRow): AgentOpsRunUsageEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.ops_run_id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    durationMs: row.duration_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function normalizeNonNegativeInteger(value: number | null | undefined): number | null {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : null
}

function normalizeNonNegativeNumber(value: number | null | undefined): number | null {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : null
}
