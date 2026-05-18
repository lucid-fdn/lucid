import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../config.js'
import { runKnowledgeBrainOps } from '../jobs/brain-ops.js'
import { runKnowledgeSourceRefreshJobs } from '../jobs/knowledge-source-refresh.js'
import { reconcilePmMirrors } from '../pm-sync/reconcile.js'
import {
  createEngineHomeArchive,
  diffEngineHomeSnapshots,
  hydrateEngineHomeArchive,
  snapshotEngineHome,
} from '../runtime/engine-home-lite.js'
import type { RoutineRunStatus } from './receipts.js'
import type { RoutineTargetTask } from './target-context.js'

export interface RoutineDomainAdapterResult {
  handled: boolean
  status: RoutineRunStatus
  outputSummary: string | null
  errorMessage?: string | null
  agentOpsRunId?: string | null
  browserRunId?: string | null
  engineHomeRefs?: Record<string, unknown>
  workGraphRefs?: Record<string, unknown>
  knowledgeRefs?: Record<string, unknown>
  trustgateRefs?: Record<string, unknown>
  dispatchSummary?: Record<string, unknown>
  sanitizedEvidence?: Record<string, unknown>
}

type JsonRecord = Record<string, unknown>

interface NativeScheduleFacet {
  nativeId: string
  label: string
  cronExpression: string
  timezone: string
  prompt: string
  enabled: boolean
  source: string
  metadata: JsonRecord
}

const MAX_NATIVE_SCHEDULE_FILE_BYTES = 256 * 1024

const DOMAIN_TARGETS = new Set([
  'work_graph',
  'agent_ops',
  'browser_procedure',
  'knowledge',
  'engine_home',
  'plugin_job',
  'pm_sync',
])

function readString(record: JsonRecord | null | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(record: JsonRecord | null | undefined, key: string): number | null {
  const value = record?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function readBoolean(record: JsonRecord | null | undefined, key: string): boolean {
  return record?.[key] === true
}

function readRecord(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function readArray(record: JsonRecord | null | undefined, key: string): unknown[] {
  const value = record?.[key]
  return Array.isArray(value) ? value : []
}

function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
}

function stableDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function sanitizeNativeScheduleMetadata(entry: JsonRecord): JsonRecord {
  const allowed: JsonRecord = {}
  for (const key of ['kind', 'source', 'engine', 'channel', 'mode', 'supportLevel', 'authority']) {
    if (typeof entry[key] === 'string') allowed[key] = entry[key]
  }
  if (typeof entry.enabled === 'boolean') allowed.enabled = entry.enabled
  return allowed
}

function normalizeNativeScheduleEntry(entry: unknown, index: number, fallbackPrompt: string): NativeScheduleFacet | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const record = entry as JsonRecord
  const cronExpression = readString(record, 'cron_expression')
    ?? readString(record, 'cronExpression')
    ?? readString(record, 'cron')
    ?? readString(record, 'schedule')
  if (!cronExpression) return null

  const nativeId = readString(record, 'id')
    ?? readString(record, 'native_id')
    ?? readString(record, 'nativeId')
    ?? `native-${index}-${stableHash(record)}`
  const label = readString(record, 'name')
    ?? readString(record, 'label')
    ?? readString(record, 'description')
    ?? `Native schedule ${index + 1}`
  const prompt = readString(record, 'prompt')
    ?? readString(record, 'task_prompt')
    ?? readString(record, 'instruction')
    ?? fallbackPrompt

  return {
    nativeId,
    label: truncate(label, 160),
    cronExpression,
    timezone: readString(record, 'timezone') ?? readString(record, 'tz') ?? 'UTC',
    prompt: truncate(prompt, 12_000),
    enabled: record.enabled !== false,
    source: readString(record, 'source') ?? 'native_scheduler',
    metadata: sanitizeNativeScheduleMetadata(record),
  }
}

async function readNativeScheduleFacets(config: JsonRecord | null | undefined, fallbackPrompt: string): Promise<NativeScheduleFacet[]> {
  const inline = [
    ...readArray(config, 'native_schedules'),
    ...readArray(config, 'nativeSchedules'),
    ...readArray(config, 'schedules'),
    ...readArray(config, 'jobs'),
  ]

  const filePath = readString(config, 'native_schedule_file') ?? readString(config, 'nativeScheduleFile')
  const rootDir = readString(config, 'runtime_home_dir') ?? readString(config, 'home_root') ?? readString(config, 'root_dir')
  if (filePath && rootDir) {
    try {
      const root = path.resolve(rootDir)
      const resolved = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(root, filePath))
      if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) throw new Error('schedule file outside runtime home')
      const fileStat = await stat(resolved)
      if (!fileStat.isFile() || fileStat.size > MAX_NATIVE_SCHEDULE_FILE_BYTES) throw new Error('schedule file not readable')
      const parsed = JSON.parse(await readFile(resolved, 'utf8')) as unknown
      if (Array.isArray(parsed)) inline.push(...parsed)
      else if (parsed && typeof parsed === 'object') {
        const record = parsed as JsonRecord
        inline.push(...readArray(record, 'native_schedules'))
        inline.push(...readArray(record, 'nativeSchedules'))
        inline.push(...readArray(record, 'schedules'))
        inline.push(...readArray(record, 'jobs'))
      }
    } catch {
      // Native files are runtime-owned. A missing/unreadable file is surfaced as
      // an empty observation instead of leaking paths or host details to UI.
    }
  }

  const normalized = inline
    .map((entry, index) => normalizeNativeScheduleEntry(entry, index, fallbackPrompt))
    .filter((entry): entry is NativeScheduleFacet => Boolean(entry))
  const byId = new Map<string, NativeScheduleFacet>()
  for (const schedule of normalized) byId.set(schedule.nativeId, schedule)
  return [...byId.values()]
}

function dispatch(task: RoutineTargetTask, extra: JsonRecord = {}): JsonRecord {
  return {
    target_type: task.target_type ?? 'assistant',
    task_kind: task.task_kind ?? 'assistant_run',
    routine_id: task.id,
    target_id: task.target_id ?? null,
    project_id: task.project_id ?? null,
    work_item_id: task.work_item_id ?? null,
    managed_resource_id: task.managed_resource_id ?? null,
    trigger_config: task.trigger_config ?? {},
    adapter_mode: 'domain_service',
    ...extra,
  }
}

async function insertWorkGraphEvent(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
  eventType: string,
  payload: JsonRecord,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('work_graph_events')
    .insert({
      org_id: task.org_id,
      project_id: task.project_id ?? null,
      goal_id: readString(task.trigger_config, 'goal_id'),
      work_item_id: task.work_item_id ?? readString(task.trigger_config, 'work_item_id') ?? null,
      actor_kind: 'agent',
      actor_agent_id: task.assistant_id,
      actor_external_provider: null,
      event_type: eventType,
      payload,
    })
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Work Graph event failed: ${error.message}`)
  return (data as { id?: string } | null)?.id ?? null
}

async function executeWorkGraphRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
  receiptId: string | null,
): Promise<RoutineDomainAdapterResult> {
  const config = task.trigger_config ?? {}
  const action = readString(config, 'action') ?? 'event_only'
  const workItemId = task.work_item_id ?? readString(config, 'work_item_id') ?? (readString(config, 'target_kind') === 'work_item' ? task.target_id ?? null : null)
  const goalId = readString(config, 'goal_id') ?? (readString(config, 'target_kind') === 'goal' ? task.target_id ?? null : null)
  const status = readString(config, 'status')
  const summary = readString(config, 'summary') ?? task.task_prompt
  const artifactType = readString(config, 'artifact_type') ?? 'note'

  const refs: JsonRecord = {
    target_id: task.target_id ?? null,
    work_item_id: workItemId,
    goal_id: goalId,
    project_id: task.project_id ?? null,
    action,
  }

  if (workItemId && status && ['update_status', 'complete', 'event_only'].includes(action)) {
    const update: JsonRecord = {
      status,
      resolution_notes: truncate(summary, 2000),
    }
    if (status === 'done') {
      update.completed_at = new Date().toISOString()
      update.resolution = readString(config, 'resolution') ?? 'completed'
    }
    const { error } = await supabase
      .from('human_work_items')
      .update(update)
      .eq('id', workItemId)
      .eq('org_id', task.org_id)
    if (error) throw new Error(`Work item update failed: ${error.message}`)
    refs.updated_work_item_status = status
  }

  if (goalId && status && ['update_goal_status', 'update_status', 'event_only'].includes(action)) {
    const { error } = await supabase
      .from('work_goals')
      .update({
        status,
        metadata: {
          routine_id: task.id,
          routine_summary: truncate(summary, 1000),
          updated_by_routine_at: new Date().toISOString(),
        },
      })
      .eq('id', goalId)
      .eq('org_id', task.org_id)
    if (error) throw new Error(`Work goal update failed: ${error.message}`)
    refs.updated_goal_status = status
  }

  const boardId = readString(config, 'board_id')
  const columnId = readString(config, 'column_id')
  if (workItemId && boardId && columnId && action === 'move_board') {
    const { error } = await supabase
      .from('work_board_items')
      .upsert({
        board_id: boardId,
        column_id: columnId,
        org_id: task.org_id,
        work_item_id: workItemId,
        rank: readString(config, 'rank') ?? `routine:${Date.now()}`,
        swimlane_key: readString(config, 'swimlane_key'),
        metadata: { routine_id: task.id, moved_by_routine_at: new Date().toISOString() },
      }, { onConflict: 'board_id,work_item_id' })
    if (error) throw new Error(`Work board move failed: ${error.message}`)
    refs.board_id = boardId
    refs.column_id = columnId
  }

  const eventId = await insertWorkGraphEvent(supabase, task, `routine.${action}`, {
    routine_id: task.id,
    routine_run_receipt_id: receiptId,
    task_prompt: truncate(task.task_prompt, 2000),
    summary: truncate(summary, 2000),
    refs,
  })
  refs.event_id = eventId

  if (workItemId || goalId) {
    const { data, error } = await supabase
      .from('work_artifact_links')
      .insert({
        org_id: task.org_id,
        project_id: task.project_id ?? null,
        goal_id: goalId,
        work_item_id: workItemId,
        artifact_type: artifactType,
        label: readString(config, 'artifact_label') ?? 'Routine evidence',
        summary: truncate(summary, 2000),
        metadata: {
          external_ref: `routine:${task.id}:${receiptId ?? 'no-receipt'}`,
          routine_id: task.id,
          routine_run_receipt_id: receiptId,
          action,
        },
      })
      .select('id')
      .maybeSingle()
    if (error) throw new Error(`Work artifact link failed: ${error.message}`)
    refs.artifact_link_id = (data as { id?: string } | null)?.id ?? null
  }

  return {
    handled: true,
    status: 'succeeded',
    outputSummary: `Work Graph routine ${action} applied.`,
    workGraphRefs: refs,
    dispatchSummary: dispatch(task, { action, event_id: eventId }),
  }
}

async function createAgentOpsRun(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
  input: {
    workflowId: string
    workflowSlug?: string | null
    status?: 'queued' | 'blocked'
    scopeType: string
    scopeRef?: string | null
    scopeLabel?: string | null
    extraInput?: JsonRecord
    metadata?: JsonRecord
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('agent_ops_runs')
    .insert({
      org_id: task.org_id,
      project_id: task.project_id ?? null,
      assistant_id: task.assistant_id,
      requested_by: null,
      workflow_id: input.workflowId,
      workflow_slug: input.workflowSlug ?? input.workflowId,
      workflow_version: 'routine-v1',
      status: input.status ?? 'queued',
      priority: 'normal',
      safety_mode: 'approval_gated',
      run_mode: readString(task.trigger_config, 'run_mode') ?? 'execute',
      scope_type: input.scopeType,
      scope_ref: input.scopeRef ?? null,
      scope_label: input.scopeLabel ?? null,
      input: {
        routine_id: task.id,
        routine_target_type: task.target_type,
        instruction: task.task_prompt,
        trigger_config: task.trigger_config ?? {},
        ...input.extraInput,
      },
      output_sections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
      error_message: input.status === 'blocked' ? 'Routine adapter blocked before execution.' : null,
      metadata: {
        routine_id: task.id,
        routine_target_type: task.target_type,
        source: 'routine_kernel',
        ...input.metadata,
      },
    })
    .select('id')
    .single()

  if (error) throw new Error(`Agent Ops run create failed: ${error.message}`)
  return (data as { id: string }).id
}

async function executeAgentOpsRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
): Promise<RoutineDomainAdapterResult> {
  const workflowId = readString(task.trigger_config, 'workflow_id') ?? task.target_id ?? 'routine-agent-ops'
  const runId = await createAgentOpsRun(supabase, task, {
    workflowId,
    workflowSlug: readString(task.trigger_config, 'workflow_slug') ?? workflowId,
    scopeType: readString(task.trigger_config, 'scope_type') ?? 'routine',
    scopeRef: readString(task.trigger_config, 'scope_ref') ?? task.target_id ?? task.work_item_id ?? null,
    scopeLabel: readString(task.trigger_config, 'scope_label') ?? task.name ?? null,
  })
  return {
    handled: true,
    status: 'succeeded',
    outputSummary: `Agent Ops run queued: ${runId}`,
    agentOpsRunId: runId,
    dispatchSummary: dispatch(task, { agent_ops_run_id: runId }),
    sanitizedEvidence: { agent_ops_run_id: runId },
  }
}

async function executeBrowserProcedureRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
): Promise<RoutineDomainAdapterResult> {
  const procedureId = task.target_id ?? readString(task.trigger_config, 'procedure_id')
  if (!procedureId) throw new Error('Browser procedure routine is missing procedure id')

  const { data: procedure, error: procedureError } = await supabase
    .from('agent_ops_browser_procedures')
    .select('id, name, slug, trust_state, project_id')
    .eq('id', procedureId)
    .eq('org_id', task.org_id)
    .maybeSingle()
  if (procedureError) throw new Error(`Browser procedure lookup failed: ${procedureError.message}`)
  if (!procedure) throw new Error('Browser procedure not found for organization')

  const { data: version, error: versionError } = await supabase
    .from('agent_ops_browser_procedure_versions')
    .select('id, version, risk_level')
    .eq('procedure_id', procedureId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError) throw new Error(`Browser procedure version lookup failed: ${versionError.message}`)

  const blocked = (procedure as { trust_state?: string }).trust_state === 'blocked'
  const opsRunId = await createAgentOpsRun(supabase, task, {
    workflowId: 'browser_procedure_run',
    workflowSlug: 'browser-procedure-run',
    status: blocked ? 'blocked' : 'queued',
    scopeType: 'browser_procedure',
    scopeRef: procedureId,
    scopeLabel: (procedure as { name?: string }).name ?? task.name,
    extraInput: {
      procedure_id: procedureId,
      version_id: (version as { id?: string } | null)?.id ?? null,
      matched_trigger: readString(task.trigger_config, 'matched_trigger') ?? task.task_prompt,
    },
    metadata: {
      procedure_trust_state: (procedure as { trust_state?: string }).trust_state ?? null,
      procedure_project_id: (procedure as { project_id?: string | null }).project_id ?? null,
    },
  })

  const { data: procedureRun, error: runError } = await supabase
    .from('agent_ops_browser_procedure_runs')
    .upsert({
      procedure_id: procedureId,
      version_id: (version as { id?: string } | null)?.id ?? null,
      ops_run_id: opsRunId,
      status: blocked ? 'blocked' : 'queued',
      matched_trigger: readString(task.trigger_config, 'matched_trigger') ?? truncate(task.task_prompt, 500),
      security_flags: blocked ? ['procedure_blocked'] : [],
      output_summary: {
        routine_id: task.id,
        state: blocked ? 'blocked' : 'queued',
      },
      metadata: {
        routine_id: task.id,
        source: 'routine_kernel',
      },
    }, { onConflict: 'procedure_id,ops_run_id' })
    .select('id')
    .single()
  if (runError) throw new Error(`Browser procedure run create failed: ${runError.message}`)

  const browserRunId = (procedureRun as { id: string }).id
  return {
    handled: true,
    status: blocked ? 'skipped' : 'succeeded',
    outputSummary: blocked
      ? `Browser procedure ${procedureId} is blocked.`
      : `Browser procedure run queued: ${browserRunId}`,
    agentOpsRunId: opsRunId,
    browserRunId,
    dispatchSummary: dispatch(task, { agent_ops_run_id: opsRunId, browser_run_id: browserRunId }),
    sanitizedEvidence: {
      browser_procedure_id: procedureId,
      browser_procedure_run_id: browserRunId,
      agent_ops_run_id: opsRunId,
      trust_state: (procedure as { trust_state?: string }).trust_state ?? null,
    },
  }
}

async function createKnowledgeMaintenanceEvent(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
  input: {
    eventType: string
    severity: 'info' | 'warning' | 'critical'
    title: string
    summary: string
    metadata?: JsonRecord
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('knowledge_maintenance_events')
    .insert({
      org_id: task.org_id,
      project_id: task.project_id ?? null,
      team_id: task.team_id ?? null,
      event_type: input.eventType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      status: 'open',
      confidence: 0.8,
      evidence: [{
        kind: 'routine',
        routine_id: task.id,
        target_type: task.target_type,
      }],
      metadata: {
        routine_id: task.id,
        source: 'routine_kernel',
        ...(input.metadata ?? {}),
      },
      idempotency_key: `routine:${task.id}:${input.eventType}:${readString(task.trigger_config, 'operation') ?? 'knowledge'}`,
    })
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Knowledge maintenance event failed: ${error.message}`)
  return (data as { id?: string } | null)?.id ?? null
}

async function executeKnowledgeRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
  config: Config,
): Promise<RoutineDomainAdapterResult> {
  const operation = readString(task.trigger_config, 'operation') ?? 'source_refresh'
  let refs: JsonRecord
  let summary: string

  if (operation === 'source_refresh' || operation === 'knowledge.source.refresh') {
    const result = await runKnowledgeSourceRefreshJobs(supabase, config, fetch, { orgId: task.org_id })
    refs = { operation, ...result }
    summary = `Knowledge source refresh scanned ${result.scanned}, refreshed ${result.refreshed}, failed ${result.failed}.`
  } else if (operation === 'brain_ops' || operation === 'knowledge.brain_ops') {
    const result = await runKnowledgeBrainOps(supabase, config, { orgId: task.org_id })
    refs = { operation, ...result }
    summary = `Brain Ops scanned ${result.scannedOrgs} orgs and wrote ${result.eventsWritten} events.`
  } else if (operation === 'claims.list' || operation === 'knowledge.claims.list') {
    const limit = readNumber(task.trigger_config, 'limit') ?? 50
    const { data, error } = await supabase
      .from('knowledge_claims')
      .select('id, subject, status, updated_at')
      .eq('org_id', task.org_id)
      .limit(limit)
    if (error) throw new Error(`Knowledge claim list failed: ${error.message}`)
    refs = { operation, claim_ids: ((data ?? []) as Array<{ id: string }>).map((row) => row.id), count: data?.length ?? 0 }
    summary = `Knowledge claim list collected ${data?.length ?? 0} claims.`
  } else if (operation === 'think' || operation === 'knowledge.think') {
    const query = readString(task.trigger_config, 'query') ?? task.task_prompt
    const runId = await createAgentOpsRun(supabase, task, {
      workflowId: 'knowledge_think',
      workflowSlug: 'knowledge-think',
      scopeType: 'knowledge',
      scopeRef: readString(task.trigger_config, 'claim_id') ?? task.project_id ?? task.team_id ?? task.assistant_id,
      scopeLabel: readString(task.trigger_config, 'scope_label') ?? 'Knowledge Think',
      extraInput: {
        query: truncate(query, 4000),
        project_id: task.project_id ?? null,
        team_id: task.team_id ?? null,
        assistant_id: task.assistant_id,
        persist_claim: readBoolean(task.trigger_config, 'persist_claim'),
        knowledge_scope: task.knowledge_scope ?? {},
      },
      metadata: { operation },
    })
    const eventId = await createKnowledgeMaintenanceEvent(supabase, task, {
      eventType: 'approval_required',
      severity: 'info',
      title: 'Knowledge Think routine queued',
      summary: truncate(`Routine queued a Knowledge Think workflow: ${query}`, 2000),
      metadata: { operation, agent_ops_run_id: runId },
    })
    refs = { operation, agent_ops_run_id: runId, maintenance_event_id: eventId }
    summary = `Knowledge Think workflow queued: ${runId}`
  } else if (operation === 'imports.preview' || operation === 'knowledge.imports.preview' || operation === 'imports.create') {
    const sourceType = readString(task.trigger_config, 'source_type') ?? 'manual_upload'
    const mode = operation === 'imports.create' ? 'probe' : 'preview'
    const { data, error } = await supabase
      .from('knowledge_import_jobs')
      .insert({
        org_id: task.org_id,
        project_id: task.project_id ?? null,
        team_id: task.team_id ?? null,
        source_type: sourceType,
        mode,
        status: 'queued',
        metadata: {
          routine_id: task.id,
          routine_run: true,
          instruction: truncate(task.task_prompt, 1000),
          source_ref: readString(task.trigger_config, 'source_ref'),
          knowledge_scope: task.knowledge_scope ?? {},
        },
      })
      .select('id')
      .single()
    if (error) throw new Error(`Knowledge import job create failed: ${error.message}`)
    refs = { operation, import_job_id: (data as { id: string }).id, source_type: sourceType, mode }
    summary = `Knowledge import ${mode} job queued: ${refs.import_job_id}`
  } else if (operation === 'imports.commit' || operation === 'knowledge.imports.commit') {
    const jobId = readString(task.trigger_config, 'import_job_id')
    if (!jobId) throw new Error('Knowledge import commit requires trigger_config.import_job_id')
    const { error } = await supabase
      .from('knowledge_import_jobs')
      .update({
        status: 'running',
        metadata: {
          routine_id: task.id,
          routine_commit_requested_at: new Date().toISOString(),
          instruction: truncate(task.task_prompt, 1000),
        },
      })
      .eq('id', jobId)
      .eq('org_id', task.org_id)
    if (error) throw new Error(`Knowledge import commit marker failed: ${error.message}`)
    refs = { operation, import_job_id: jobId, status: 'running' }
    summary = `Knowledge import commit requested for job ${jobId}.`
  } else if (operation === 'retrieval_eval' || operation === 'knowledge.retrieval_eval') {
    const category = readString(task.trigger_config, 'category')
    const limit = readNumber(task.trigger_config, 'limit') ?? 50
    let query = supabase
      .from('knowledge_retrieval_eval_cases')
      .select('id, slug, category')
      .eq('org_id', task.org_id)
      .eq('status', 'active')
      .limit(limit)
    if (task.project_id) query = query.eq('project_id', task.project_id)
    if (category) query = query.eq('category', category)
    const { data: cases, error: caseError } = await query
    if (caseError) throw new Error(`Knowledge retrieval eval case lookup failed: ${caseError.message}`)

    const { data: run, error: runError } = await supabase
      .from('knowledge_retrieval_eval_runs')
      .insert({
        org_id: task.org_id,
        project_id: task.project_id ?? null,
        status: 'running',
        case_count: cases?.length ?? 0,
        metadata: {
          routine_id: task.id,
          routine_scheduled_eval: true,
          category: category ?? null,
          limit,
          execution: 'queued_for_replay',
        },
      })
      .select('id')
      .single()
    if (runError) throw new Error(`Knowledge retrieval eval run create failed: ${runError.message}`)
    refs = {
      operation,
      eval_run_id: (run as { id: string }).id,
      case_count: cases?.length ?? 0,
      case_ids: ((cases ?? []) as Array<{ id: string }>).map((row) => row.id),
    }
    summary = `Knowledge retrieval eval queued for ${refs.case_count} cases: ${refs.eval_run_id}`
  } else {
    throw new Error(`Unsupported Knowledge routine operation: ${operation}`)
  }

  return {
    handled: true,
    status: 'succeeded',
    outputSummary: summary,
    knowledgeRefs: refs,
    dispatchSummary: dispatch(task, { operation }),
  }
}

async function persistEngineHomeSnapshot(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
  input: {
    runtimeId: string | null
    engine: string
    runtimeFlavor: string
    homeId: string
    rootDigest: string
    manifest: JsonRecord
    archiveRef?: JsonRecord | null
    metadata?: JsonRecord
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('engine_home_snapshots')
    .upsert({
      org_id: task.org_id,
      agent_id: task.assistant_id,
      runtime_id: input.runtimeId,
      engine: input.engine,
      runtime_flavor: input.runtimeFlavor,
      home_id: input.homeId,
      root_digest: input.rootDigest,
      manifest: input.manifest,
      archive_ref: input.archiveRef ?? null,
      metadata: {
        routine_id: task.id,
        routine_target_type: task.target_type,
        ...(input.metadata ?? {}),
      },
    }, { onConflict: 'home_id,root_digest' })
    .select('id')
    .single()

  if (error) throw new Error(`Engine Home snapshot persist failed: ${error.message}`)
  return data as { id: string }
}

async function executeEngineHomeRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
): Promise<RoutineDomainAdapterResult> {
  const operation = readString(task.trigger_config, 'operation') ?? 'snapshot_summary'
  const snapshotId = readString(task.trigger_config, 'snapshot_id')
  const runtimeId = readString(task.trigger_config, 'runtime_id')
  const rootDir = readString(task.trigger_config, 'root_dir') ?? readString(task.trigger_config, 'runtime_home_root')
  const engine = readString(task.trigger_config, 'engine') ?? 'openclaw'
  const runtimeFlavor = readString(task.trigger_config, 'runtime_flavor') ?? 'shared'
  const homeId = readString(task.trigger_config, 'home_id') ?? `${engine}:${runtimeId ?? task.assistant_id ?? task.id}`
  const refs: JsonRecord = { operation, runtime_id: runtimeId, snapshot_id: snapshotId, home_id: homeId }

  if ([
    'native_scheduler.observe',
    'native_scheduler.import',
    'engine_home.native_scheduler.observe',
    'engine_home.native_scheduler.import',
  ].includes(operation)) {
    const schedules = await readNativeScheduleFacets(task.trigger_config, task.task_prompt)
    const { data: candidate, error: candidateError } = await supabase
      .from('engine_home_diff_candidates')
      .insert({
        org_id: task.org_id,
        agent_id: task.assistant_id,
        runtime_id: runtimeId,
        source: runtimeFlavor === 'c2a_autonomous' ? 'native' : runtimeId ? 'relay' : 'shared',
        engine,
        runtime_flavor: runtimeFlavor,
        home_id: homeId,
        before_snapshot_id: snapshotId,
        after_snapshot_id: null,
        before_digest: null,
        after_digest: stableDigest(schedules.map(({ nativeId, cronExpression }) => ({ nativeId, cronExpression }))),
        diff: {
          operation,
          nativeScheduleCount: schedules.length,
          schedules: schedules.map((schedule) => ({
            native_id: schedule.nativeId,
            label: schedule.label,
            cron_expression: schedule.cronExpression,
            timezone: schedule.timezone,
            enabled: schedule.enabled,
            source: schedule.source,
            metadata: schedule.metadata,
          })),
          delegationAllowed: false,
          delegationReason: 'Lucid imports native schedules as disabled Routine definitions until ACK/reconcile/idempotency delegation is proven.',
        },
        status: 'pending',
        review_notes: truncate(task.task_prompt, 2000),
      })
      .select('id')
      .single()
    if (candidateError) throw new Error(`Native schedule observation failed: ${candidateError.message}`)

    const importedRoutineIds: string[] = []
    if (operation.endsWith('.import')) {
      for (const schedule of schedules) {
        const idempotencyKey = `native-schedule:${engine}:${runtimeId ?? homeId}:${stableHash(schedule.nativeId)}`
        const { data: routine, error } = await supabase
          .from('agent_scheduled_tasks')
          .upsert({
            assistant_id: task.assistant_id,
            org_id: task.org_id,
            name: schedule.label,
            description: `Imported from ${engine} native scheduler for operator review.`,
            task_prompt: schedule.prompt,
            cron_expression: schedule.cronExpression,
            run_at: null,
            timezone: schedule.timezone,
            next_run_at: null,
            status: 'pending',
            enabled: false,
            idempotency_key: idempotencyKey,
            webhook_url: null,
            task_kind: 'assistant_run',
            target_type: 'assistant',
            target_id: task.assistant_id,
            team_id: null,
            project_id: task.project_id ?? null,
            work_item_id: task.work_item_id ?? null,
            trigger_kind: 'cron',
            trigger_config: {
              native_schedule_id: schedule.nativeId,
              native_schedule_source: schedule.source,
              imported_from_routine_id: task.id,
              review_candidate_id: (candidate as { id?: string }).id ?? null,
            },
            concurrency_policy: 'skip_if_running',
            catch_up_policy: 'latest_only',
            catch_up_limit: 1,
            max_retries: 3,
            budget_policy: {},
            runtime_selector: {
              engine,
              runtimeFlavor: runtimeFlavor === 'c1_managed' ? 'dedicated' : runtimeFlavor === 'c2a_autonomous' ? 'byo' : 'shared',
              runtimeId,
              nativeScheduler: 'observe',
              importedFromNativeScheduler: true,
            },
            capability_requirements: [
              { id: 'scheduled.native_scheduler.observe', required: true },
              { id: 'scheduled.native_scheduler.import', required: true },
            ],
            context_policy: {},
            knowledge_scope: {},
            trustgate_policy: {},
            team_policy: {},
            dispatch_policy: {
              native_schedule_review: true,
              delegation_allowed: false,
            },
            source_kind: 'import',
            managed_resource_id: null,
          }, { onConflict: 'assistant_id,idempotency_key', ignoreDuplicates: false })
          .select('id')
          .single()
        if (error) throw new Error(`Native schedule import failed: ${error.message}`)
        importedRoutineIds.push((routine as { id: string }).id)
      }
    }

    refs.candidate_id = (candidate as { id?: string }).id ?? null
    refs.native_schedule_count = schedules.length
    refs.imported_routine_ids = importedRoutineIds
    return {
      handled: true,
      status: schedules.length > 0 ? 'succeeded' : 'skipped',
      outputSummary: operation.endsWith('.import')
        ? `Imported ${importedRoutineIds.length} native schedules as disabled Routine candidates.`
        : `Observed ${schedules.length} native schedules for review.`,
      engineHomeRefs: refs,
      dispatchSummary: dispatch(task, {
        operation,
        candidate_id: refs.candidate_id,
        native_schedule_count: schedules.length,
        imported_routine_count: importedRoutineIds.length,
        execution_delegated: false,
      }),
      sanitizedEvidence: {
        native_schedule_count: schedules.length,
        imported_routine_count: importedRoutineIds.length,
        delegation: 'disabled_until_ack_reconcile_stable',
      },
    }
  }

  if (rootDir && ['snapshot', 'engine_home.snapshot', 'diff', 'engine_home.diff', 'export', 'engine_home.export', 'import', 'engine_home.import'].includes(operation)) {
    if (operation === 'import' || operation === 'engine_home.import') {
      if (!readBoolean(task.trigger_config, 'confirm')) throw new Error('Engine Home import requires trigger_config.confirm=true')
      const archive = readRecord(task.trigger_config, 'archive')
      if (!archive) throw new Error('Engine Home import requires trigger_config.archive')
      const snapshot = await hydrateEngineHomeArchive(rootDir, archive, { clean: readBoolean(task.trigger_config, 'clean') })
      const row = await persistEngineHomeSnapshot(supabase, task, {
        runtimeId,
        engine: String(snapshot.engine ?? engine),
        runtimeFlavor: String(snapshot.runtimeFlavor ?? runtimeFlavor),
        homeId: String(snapshot.homeId ?? homeId),
        rootDigest: String(snapshot.rootDigest),
        manifest: snapshot,
        archiveRef: { type: 'routine_import_source', importedAt: new Date().toISOString() },
        metadata: { operation, source: 'routine_kernel' },
      })
      refs.snapshot_id = row.id
      refs.root_digest = snapshot.rootDigest
      return {
        handled: true,
        status: 'succeeded',
        outputSummary: `Engine Home import applied and snapshotted: ${row.id}`,
        engineHomeRefs: refs,
        dispatchSummary: dispatch(task, { operation, snapshot_id: row.id }),
      }
    }

    const archive = operation === 'export' || operation === 'engine_home.export'
      ? await createEngineHomeArchive({
          engine,
          runtimeFlavor: runtimeFlavor as 'shared' | 'c1_managed' | 'c2a_autonomous',
          rootDir,
          homeId,
          metadata: { routine_id: task.id, runtime_id: runtimeId },
          labels: { source: 'routine_kernel' },
        })
      : null
    const snapshot = archive
      ? {
          version: archive.manifest.snapshotVersion,
          engine: archive.manifest.engine,
          runtimeFlavor: archive.manifest.runtimeFlavor,
          homeId: archive.manifest.homeId,
          rootDigest: archive.manifest.rootDigest,
          createdAt: archive.manifest.createdAt,
          entries: archive.files,
          metadata: { routine_id: task.id },
        }
      : await snapshotEngineHome({
          engine,
          runtimeFlavor: runtimeFlavor as 'shared' | 'c1_managed' | 'c2a_autonomous',
          rootDir,
          homeId,
          metadata: { routine_id: task.id, runtime_id: runtimeId },
        })

    const snapshotRow = await persistEngineHomeSnapshot(supabase, task, {
      runtimeId,
      engine: String(snapshot.engine ?? engine),
      runtimeFlavor: String(snapshot.runtimeFlavor ?? runtimeFlavor),
      homeId: String(snapshot.homeId ?? homeId),
      rootDigest: String(snapshot.rootDigest),
      manifest: archive?.manifest ?? snapshot as JsonRecord,
      archiveRef: archive ? { type: 'inline_routine_archive', archive, authority: 'routine_kernel' } : null,
      metadata: { operation, source: 'routine_kernel' },
    })
    refs.snapshot_id = snapshotRow.id
    refs.root_digest = snapshot.rootDigest
    refs.entry_count = Array.isArray(snapshot.entries) ? snapshot.entries.length : archive?.files.length ?? 0

    if (operation === 'diff' || operation === 'engine_home.diff') {
      const beforeSnapshot = readRecord(task.trigger_config, 'before_snapshot')
      const diff = diffEngineHomeSnapshots(beforeSnapshot, snapshot as JsonRecord)
      const { data: candidate, error } = await supabase
        .from('engine_home_diff_candidates')
        .insert({
          org_id: task.org_id,
          agent_id: task.assistant_id,
          runtime_id: runtimeId,
          source: runtimeId ? 'relay' : 'shared',
          engine,
          runtime_flavor: runtimeFlavor,
          home_id: homeId,
          before_snapshot_id: snapshotId,
          after_snapshot_id: snapshotRow.id,
          before_digest: beforeSnapshot?.rootDigest ?? null,
          after_digest: snapshot.rootDigest,
          diff,
          status: 'pending',
          review_notes: truncate(task.task_prompt, 2000),
        })
        .select('id')
        .single()
      if (error) throw new Error(`Engine Home diff candidate create failed: ${error.message}`)
      refs.candidate_id = (candidate as { id: string }).id
    }

    return {
      handled: true,
      status: 'succeeded',
      outputSummary: `Engine Home ${operation} completed for ${homeId}.`,
      engineHomeRefs: refs,
      dispatchSummary: dispatch(task, { operation, snapshot_id: refs.snapshot_id, candidate_id: refs.candidate_id ?? null }),
    }
  }

  if (operation === 'rollback_proposal' || operation === 'engine_home.rollback') {
    if (!snapshotId) throw new Error('Engine Home rollback proposal requires trigger_config.snapshot_id')
    const { data: snapshot, error: snapshotError } = await supabase
      .from('engine_home_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('org_id', task.org_id)
      .eq('agent_id', task.assistant_id)
      .maybeSingle()
    if (snapshotError) throw new Error(`Engine Home snapshot lookup failed: ${snapshotError.message}`)
    if (!snapshot) throw new Error('Engine Home snapshot not found for assistant/org')
    const row = snapshot as JsonRecord
    const { data: candidate, error } = await supabase
      .from('engine_home_diff_candidates')
      .insert({
        org_id: task.org_id,
        agent_id: task.assistant_id,
        runtime_id: row.runtime_id ?? null,
        source: row.runtime_id ? 'relay' : 'shared',
        engine: row.engine,
        runtime_flavor: row.runtime_flavor ?? 'shared',
        home_id: row.home_id,
        before_snapshot_id: null,
        after_snapshot_id: snapshotId,
        before_digest: null,
        after_digest: row.root_digest,
        diff: {
          operation: 'rollback',
          targetSnapshotId: snapshotId,
          targetDigest: row.root_digest,
          requestedBy: `routine:${task.id}`,
        },
        status: 'pending',
        review_notes: truncate(task.task_prompt, 2000),
      })
      .select('id')
      .single()
    if (error) throw new Error(`Engine Home rollback candidate create failed: ${error.message}`)
    refs.candidate_id = (candidate as { id: string }).id
    return {
      handled: true,
      status: 'succeeded',
      outputSummary: `Engine Home rollback proposal created: ${refs.candidate_id}`,
      engineHomeRefs: refs,
      dispatchSummary: dispatch(task, { operation, candidate_id: refs.candidate_id }),
    }
  }

  let query = supabase
    .from('engine_home_snapshots')
    .select('id, runtime_id, engine, runtime_flavor, home_id, root_digest, created_at')
    .eq('org_id', task.org_id)
    .eq('agent_id', task.assistant_id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (runtimeId) query = query.eq('runtime_id', runtimeId)
  const { data: snapshots, error: snapshotError } = await query
  if (snapshotError) throw new Error(`Engine Home snapshot summary failed: ${snapshotError.message}`)
  refs.snapshot_ids = ((snapshots ?? []) as Array<{ id: string }>).map((row) => row.id)
  refs.snapshot_count = snapshots?.length ?? 0

  const { data: candidates, error: candidateError } = await supabase
    .from('engine_home_diff_candidates')
    .select('id, status, created_at')
    .eq('org_id', task.org_id)
    .eq('agent_id', task.assistant_id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (candidateError) throw new Error(`Engine Home candidate summary failed: ${candidateError.message}`)
  refs.candidate_ids = ((candidates ?? []) as Array<{ id: string }>).map((row) => row.id)
  refs.candidate_count = candidates?.length ?? 0

  return {
    handled: true,
    status: 'succeeded',
    outputSummary: `Engine Home routine ${operation} found ${refs.snapshot_count} snapshots and ${refs.candidate_count} candidates.`,
    engineHomeRefs: refs,
    dispatchSummary: dispatch(task, { operation }),
  }
}

async function executePluginJobRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
): Promise<RoutineDomainAdapterResult> {
  const resourceId = task.managed_resource_id ?? task.target_id ?? readString(task.trigger_config, 'managed_resource_id')
  if (!resourceId) throw new Error('Plugin job routine requires managed_resource_id or target_id')
  const { data, error } = await supabase
    .from('lucid_pack_managed_resources')
    .select('id, resource_key, resource_kind, status, metadata')
    .eq('id', resourceId)
    .maybeSingle()
  if (error) throw new Error(`Managed resource lookup failed: ${error.message}`)
  if (!data) throw new Error('Managed resource not found')

  const row = data as { metadata?: JsonRecord | null; resource_key?: string; resource_kind?: string; status?: string }
  const { error: updateError } = await supabase
    .from('lucid_pack_managed_resources')
    .update({
      metadata: {
        ...(row.metadata ?? {}),
        last_routine_reconcile_at: new Date().toISOString(),
        last_routine_id: task.id,
        last_routine_instruction: truncate(task.task_prompt, 1000),
      },
    })
    .eq('id', resourceId)
  if (updateError) throw new Error(`Managed resource reconcile marker failed: ${updateError.message}`)

  return {
    handled: true,
    status: 'succeeded',
    outputSummary: `Managed plugin resource checked: ${row.resource_key ?? resourceId}`,
    dispatchSummary: dispatch(task, {
      resource_id: resourceId,
      resource_key: row.resource_key ?? null,
      resource_kind: row.resource_kind ?? null,
      resource_status: row.status ?? null,
    }),
    sanitizedEvidence: {
      managed_resource_id: resourceId,
      resource_key: row.resource_key ?? null,
      resource_kind: row.resource_kind ?? null,
      status: row.status ?? null,
    },
  }
}

async function executePmSyncRoutine(
  supabase: SupabaseClient,
  task: RoutineTargetTask,
): Promise<RoutineDomainAdapterResult> {
  await reconcilePmMirrors(supabase)
  const workItemId = task.work_item_id ?? task.target_id ?? readString(task.trigger_config, 'work_item_id')
  let eventId: string | null = null
  if (workItemId) {
    eventId = await insertWorkGraphEvent(supabase, {
      ...task,
      work_item_id: workItemId,
    }, 'routine.pm_sync.reconcile', {
      routine_id: task.id,
      provider: readString(task.trigger_config, 'provider'),
      work_item_id: workItemId,
    })
  }

  return {
    handled: true,
    status: 'succeeded',
    outputSummary: 'PM sync reconciliation completed.',
    workGraphRefs: {
      work_item_id: workItemId ?? null,
      project_id: task.project_id ?? null,
      event_id: eventId,
      provider: readString(task.trigger_config, 'provider'),
    },
    dispatchSummary: dispatch(task, { event_id: eventId }),
  }
}

export async function executeRoutineDomainAdapter(
  task: RoutineTargetTask,
  supabase: SupabaseClient,
  config: Config,
  receiptId: string | null,
): Promise<RoutineDomainAdapterResult> {
  const targetType = task.target_type ?? 'assistant'
  if (!DOMAIN_TARGETS.has(targetType)) {
    return { handled: false, status: 'skipped', outputSummary: null }
  }

  try {
    switch (targetType) {
      case 'work_graph':
        return await executeWorkGraphRoutine(supabase, task, receiptId)
      case 'agent_ops':
        return await executeAgentOpsRoutine(supabase, task)
      case 'browser_procedure':
        return await executeBrowserProcedureRoutine(supabase, task)
      case 'knowledge':
        return await executeKnowledgeRoutine(supabase, task, config)
      case 'engine_home':
        return await executeEngineHomeRoutine(supabase, task)
      case 'plugin_job':
        return await executePluginJobRoutine(supabase, task)
      case 'pm_sync':
        return await executePmSyncRoutine(supabase, task)
      default:
        return { handled: false, status: 'skipped', outputSummary: null }
    }
  } catch (error) {
    return {
      handled: true,
      status: 'failed',
      outputSummary: null,
      errorMessage: error instanceof Error ? error.message : 'Routine domain adapter failed',
      dispatchSummary: dispatch(task, { adapter_error: true }),
    }
  }
}
