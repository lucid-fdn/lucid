/**
 * Step Claim Proxy — DAG StepRunPacket protocol (Phase 4N-c, Task 50).
 *
 * Control-plane functions used by the dedicated-runtime REST endpoints
 * `/api/runtimes/steps/{claim,complete,fail,renew-lease}` to operate on
 * `orchestration_steps` rows scoped to a particular dedicated runtime.
 *
 * Why a DB claim instead of a Pulse Redis claim:
 *   The Pulse queue is a single global ZSET per (eventType, priority).
 *   A dedicated runtime should only see steps whose owning agent is
 *   bound to *that* runtime. Filtering by `runtime_target='dedicated'`
 *   AND `agent_id IN (agents of this runtime)` is naturally a DB query.
 *   The control plane uses an optimistic-CAS update to claim a row
 *   without holding a long-lived advisory lock.
 *
 * Lease semantics: `orchestration_steps` has no `lease_expires_at`
 * column — `timeout_at` is the canonical lease expiry. Renew bumps it.
 * Orphan detection (Phase 4N-0, Task 6) recovers stuck `claimed` rows
 * whose `started_at` is older than `STEP_LEASE_TTL_SECONDS`.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StepRunPacket } from '@contracts/dag'
import { supabase } from '@/lib/db/client'
import {
  projectAgentOpsStepOutput,
  structuredStepOutputToRunOutput,
} from '@/lib/agent-ops/step-output'
import { buildProjectLearningPromptContext } from '@/lib/agent-ops/project-learning-context'
import { resolveAgentModel } from '@/lib/agents/model-resolution'
import { SchedulerBridge } from './scheduler-bridge'

/** How long a runtime gets between claim and renew before orphan reaper steps in. */
export const STEP_LEASE_TTL_SECONDS = 60

/** Max candidate rows the claimer will scan per call (CAS protected). */
const CLAIM_CANDIDATE_LIMIT = 5

interface StepRow {
  id: string
  dag_id: string | null
  dag_node_id: string | null
  step_type: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  attempt: number
  agent_id: string
  org_id: string
  input: unknown
  webhook_url: string | null
  status: string
  timeout_at: string | null
}

interface AssistantStepConfigRow {
  id: string
  name: string
  engine: string | null
  system_prompt: string | null
  soul_content: string | null
  lucid_model: string | null
  temperature: number | null
  max_tokens: number | null
  memory_enabled: boolean | null
  approval_required_tools: string[] | null
  policy_config: Record<string, unknown> | null
  org_id: string
  runtime_flavor: string | null
}

interface ProjectLearningContextRow {
  learning_type: string
  trust_level: string
  title: string
  body: string
  confidence: number
}

/** Look up agent IDs bound to this runtime. Empty array → claim returns null. */
async function fetchAgentsForRuntime(
  client: SupabaseClient,
  runtimeId: string,
  orgId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('ai_assistants')
    .select('id')
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)
  if (error) {
    throw new Error(`[step-claim] fetchAgentsForRuntime failed: ${error.message}`)
  }
  return (data ?? []).map((r: { id: string }) => r.id)
}

/** Look up a step row and verify it belongs to an agent bound to this runtime. */
async function loadOwnedStep(
  client: SupabaseClient,
  stepId: string,
  runtimeId: string,
  orgId: string,
): Promise<StepRow | null> {
  const { data, error } = await client
    .from('orchestration_steps')
    .select(
      'id, dag_id, dag_node_id, step_type, attempt, agent_id, org_id, input, webhook_url, status, timeout_at',
    )
    .eq('id', stepId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error || !data) return null

  // Cross-runtime guard: agent must belong to this runtime.
  const { data: agent } = await client
    .from('ai_assistants')
    .select('runtime_id')
    .eq('id', (data as StepRow).agent_id)
    .maybeSingle()
  if (!agent || (agent as { runtime_id: string | null }).runtime_id !== runtimeId) {
    return null
  }
  return data as StepRow
}

/** Look up a shared-worker step. Worker-secret auth is already checked at the route layer. */
async function loadSharedStep(
  client: SupabaseClient,
  stepId: string,
): Promise<StepRow | null> {
  const { data, error } = await client
    .from('orchestration_steps')
    .select(
      'id, dag_id, dag_node_id, step_type, attempt, agent_id, org_id, input, webhook_url, status, timeout_at',
    )
    .eq('id', stepId)
    .eq('runtime_target', 'shared')
    .maybeSingle()
  if (error || !data) return null
  return data as StepRow
}

/**
 * Atomically claim the next pending DAG step targeted at this runtime.
 *
 * Strategy: SELECT up to N candidates by (org, runtime_target, status,
 * agent_id IN runtime_agents), then loop trying CAS UPDATE per candidate.
 * The first row whose `status='pending'` flips to `claimed` wins. Other
 * candidates fall through silently if a peer worker grabbed them first.
 */
export async function claimNextStep(
  runtimeId: string,
  orgId: string,
): Promise<StepRunPacket | null> {
  const agentIds = await fetchAgentsForRuntime(supabase, runtimeId, orgId)
  if (agentIds.length === 0) return null

  const { data: candidates, error } = await supabase
    .from('orchestration_steps')
    .select(
      'id, dag_id, dag_node_id, step_type, attempt, agent_id, org_id, input, webhook_url, status, timeout_at',
    )
    .eq('org_id', orgId)
    .eq('runtime_target', 'dedicated')
    .eq('status', 'pending')
    .not('dag_id', 'is', null)
    .in('agent_id', agentIds)
    .order('created_at', { ascending: true })
    .limit(CLAIM_CANDIDATE_LIMIT)

  if (error) {
    throw new Error(`[step-claim] candidate scan failed: ${error.message}`)
  }
  if (!candidates || candidates.length === 0) return null

  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + STEP_LEASE_TTL_SECONDS * 1000)

  for (const candidate of candidates as StepRow[]) {
    const { data: claimed, error: updateErr } = await supabase
      .from('orchestration_steps')
      .update({
        status: 'claimed',
        started_at: now.toISOString(),
        timeout_at: leaseExpiresAt.toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'pending') // CAS — peer worker may have grabbed it first
      .select(
        'id, dag_id, dag_node_id, step_type, attempt, agent_id, org_id, input, webhook_url',
      )
      .maybeSingle()

    if (updateErr || !claimed) continue
    const row = claimed as StepRow

    if (!row.dag_id || !row.dag_node_id) continue // shouldn't happen given the filter
    const agentOpsContext = await buildAgentOpsStepPacketContext(supabase, row)

    return {
      stepId: row.id,
      dagId: row.dag_id,
      dagNodeId: row.dag_node_id,
      stepType: row.step_type,
      attempt: row.attempt,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      payload: row.input ?? null,
      ...agentOpsContext,
    }
  }

  return null
}

/**
 * Atomically claim the next pending DAG step targeted at the shared SaaS worker.
 * This mirrors the dedicated claim path but does not require an agent-runtime
 * binding: worker-secret auth represents the Lucid-owned shared worker fleet.
 */
export async function claimNextSharedStep(): Promise<StepRunPacket | null> {
  const { data: candidates, error } = await supabase
    .from('orchestration_steps')
    .select(
      'id, dag_id, dag_node_id, step_type, attempt, agent_id, org_id, input, webhook_url, status, timeout_at',
    )
    .eq('runtime_target', 'shared')
    .eq('status', 'pending')
    .not('dag_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(CLAIM_CANDIDATE_LIMIT)

  if (error) {
    throw new Error(`[step-claim] shared candidate scan failed: ${error.message}`)
  }
  if (!candidates || candidates.length === 0) return null

  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + STEP_LEASE_TTL_SECONDS * 1000)

  for (const candidate of candidates as StepRow[]) {
    const { data: claimed, error: updateErr } = await supabase
      .from('orchestration_steps')
      .update({
        status: 'claimed',
        started_at: now.toISOString(),
        timeout_at: leaseExpiresAt.toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select(
        'id, dag_id, dag_node_id, step_type, attempt, agent_id, org_id, input, webhook_url',
      )
      .maybeSingle()

    if (updateErr || !claimed) continue
    const row = claimed as StepRow

    if (!row.dag_id || !row.dag_node_id) continue
    const agentOpsContext = await buildAgentOpsStepPacketContext(supabase, row)

    return {
      stepId: row.id,
      dagId: row.dag_id,
      dagNodeId: row.dag_node_id,
      stepType: row.step_type,
      attempt: row.attempt,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      payload: row.input ?? null,
      ...agentOpsContext,
    }
  }

  return null
}

/**
 * Mark a claimed step completed. Verifies the runtime owns the step,
 * then drives the scheduler bridge to promote any newly ready children.
 */
export async function completeStep(
  runtimeId: string,
  orgId: string,
  stepId: string,
  result?: {
    output?: string
    durationMs?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    costUsd?: number
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await loadOwnedStep(supabase, stepId, runtimeId, orgId)
  if (!row) return { ok: false, error: 'Step not found', status: 404 }
  return completeLoadedStep(row, stepId, result)
}

export async function completeSharedStep(
  stepId: string,
  result?: {
    output?: string
    durationMs?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    costUsd?: number
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await loadSharedStep(supabase, stepId)
  if (!row) return { ok: false, error: 'Step not found', status: 404 }
  return completeLoadedStep(row, stepId, result)
}

async function completeLoadedStep(
  row: StepRow,
  stepId: string,
  result?: {
    output?: string
    durationMs?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    costUsd?: number
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (row.status !== 'claimed' && row.status !== 'running') {
    return { ok: false, error: `Step not claimable (status=${row.status})`, status: 409 }
  }

  const { error: updErr } = await supabase
    .from('orchestration_steps')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output: result?.output ? result.output.slice(0, 102_400) : null,
      duration_ms: result?.durationMs ?? null,
    })
    .eq('id', stepId)
    .in('status', ['claimed', 'running'])

  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}`, status: 500 }
  }

  let projectedOutput: Awaited<ReturnType<typeof projectAgentOpsStepOutput>> | null = null
  const runId = getAgentOpsRunId(row.input)
  if (runId && result?.output) {
    projectedOutput = await projectAgentOpsStepOutput(supabase, {
      orgId: row.org_id,
      runId,
      dagId: row.dag_id,
      dagNodeId: row.dag_node_id,
      stepId,
      output: result.output,
      payload: row.input,
    })
  }
  if (row.dag_id && row.dag_node_id) {
    const bridge = new SchedulerBridge(supabase)
    await bridge.onNodeComplete(row.dag_id, row.dag_node_id)
  }

  await completeAgentOpsRunIfDagFinished(supabase, row, projectedOutput)
  if (runId) {
    await recordAgentOpsRunUsageEvent(supabase, {
      orgId: row.org_id,
      runId,
      sourceKind: 'orchestration_step',
      sourceRef: stepId,
      durationMs: result?.durationMs ?? null,
      inputTokens: result?.inputTokens ?? null,
      outputTokens: result?.outputTokens ?? null,
      totalTokens: result?.totalTokens ?? null,
      costUsd: result?.costUsd ?? null,
      metadata: {
        dag_id: row.dag_id,
        dag_node_id: row.dag_node_id,
        step_type: row.step_type,
      },
    })
  }

  return { ok: true }
}

async function recordAgentOpsRunUsageEvent(
  client: SupabaseClient,
  input: {
    orgId: string
    runId: string
    sourceKind: 'orchestration_step' | 'browser_qa' | 'agent_run' | 'manual' | 'external'
    sourceRef?: string | null
    durationMs?: number | null
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    costUsd?: number | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const hasUsage =
    input.durationMs != null ||
    input.inputTokens != null ||
    input.outputTokens != null ||
    input.totalTokens != null ||
    input.costUsd != null
  if (!hasUsage) return

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

  try {
    const query = input.sourceRef
      ? client
          .from('agent_ops_run_usage_events')
          .upsert(row, { onConflict: 'ops_run_id,source_kind,source_ref' })
      : client
          .from('agent_ops_run_usage_events')
          .insert(row)

    await query
  } catch {
    // Usage accounting is observability; it must not break step completion.
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

/**
 * Mark a claimed step failed. Drives the scheduler bridge to either
 * leave the failure as a retryable transient (no subtree cancel) or
 * propagate `cancelled` down through descendants.
 */
export async function failStep(
  runtimeId: string,
  orgId: string,
  stepId: string,
  errorMessage: string,
  retryable: boolean,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await loadOwnedStep(supabase, stepId, runtimeId, orgId)
  if (!row) return { ok: false, error: 'Step not found', status: 404 }
  if (row.status !== 'claimed' && row.status !== 'running') {
    return { ok: false, error: `Step not claimable (status=${row.status})`, status: 409 }
  }

  const { error: updErr } = await supabase
    .from('orchestration_steps')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage.slice(0, 4_096),
    })
    .eq('id', stepId)
    .in('status', ['claimed', 'running'])

  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}`, status: 500 }
  }

  if (row.dag_id && row.dag_node_id) {
    const bridge = new SchedulerBridge(supabase)
    await bridge.onNodeFail(row.dag_id, row.dag_node_id, retryable, errorMessage)
  }

  return { ok: true }
}

export async function failSharedStep(
  stepId: string,
  errorMessage: string,
  retryable: boolean,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await loadSharedStep(supabase, stepId)
  if (!row) return { ok: false, error: 'Step not found', status: 404 }
  if (row.status !== 'claimed' && row.status !== 'running') {
    return { ok: false, error: `Step not claimable (status=${row.status})`, status: 409 }
  }

  const { error: updErr } = await supabase
    .from('orchestration_steps')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage.slice(0, 4_096),
    })
    .eq('id', stepId)
    .in('status', ['claimed', 'running'])

  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}`, status: 500 }
  }

  if (row.dag_id && row.dag_node_id) {
    const bridge = new SchedulerBridge(supabase)
    await bridge.onNodeFail(row.dag_id, row.dag_node_id, retryable, errorMessage)
  }

  return { ok: true }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getAgentOpsContext(input: unknown): Record<string, unknown> | null {
  const payload = asRecord(input)
  return asRecord(payload?.agent_ops)
}

function getAgentOpsRunId(input: unknown): string | null {
  const agentOps = getAgentOpsContext(input)
  return typeof agentOps?.run_id === 'string' ? agentOps.run_id : null
}

async function buildAgentOpsStepPacketContext(
  client: SupabaseClient,
  row: StepRow,
): Promise<Partial<StepRunPacket>> {
  const runId = getAgentOpsRunId(row.input)
  if (!runId) return {}

  const { data: assistantData, error: assistantError } = await client
    .from('ai_assistants')
    .select(`
      id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens,
      memory_enabled, approval_required_tools, policy_config, org_id, runtime_flavor
    `)
    .eq('id', row.agent_id)
    .eq('org_id', row.org_id)
    .maybeSingle()

  if (assistantError || !assistantData) {
    throw new Error(
      `[step-claim] Agent Ops assistant context failed: ${assistantError?.message ?? 'assistant missing'}`,
    )
  }

  const assistant = assistantData as AssistantStepConfigRow
  const [memoriesRes, boardMemoriesRes, projectLearningsRes] = await Promise.all([
    assistant.memory_enabled
      ? client.rpc('get_recent_memories_v2', {
          p_assistant_id: row.agent_id,
          p_scoped_user_id: `agent-ops:${runId}`,
          p_limit: 10,
        })
      : Promise.resolve({ data: [], error: null }),
    client.rpc('get_board_memories', { p_org_id: row.org_id, p_limit: 10 }),
    client
      .from('project_learnings')
      .select('learning_type, trust_level, title, body, confidence')
      .eq('org_id', row.org_id)
      .eq('assistant_id', row.agent_id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  if (memoriesRes.error) {
    console.warn('[step-claim] Agent Ops memory RPC failed:', memoriesRes.error.message)
  }
  if (boardMemoriesRes.error) {
    console.warn('[step-claim] Agent Ops board memory RPC failed:', boardMemoriesRes.error.message)
  }
  if (projectLearningsRes.error) {
    console.warn('[step-claim] Agent Ops project learning load failed:', projectLearningsRes.error.message)
  }

  const memoryInjection = ((memoriesRes.data ?? []) as Array<Record<string, unknown>>)
    .map((memory) => typeof memory.content === 'string' ? memory.content : '')
    .filter(Boolean)

  const boardMemories: string[] = []
  let boardMemoryChars = 0
  const maxBoardMemoryChars = 8_000
  for (const memory of (boardMemoriesRes.data ?? []) as Array<Record<string, unknown>>) {
    const safeContent = String(memory.content || '').replace(/<\/org_knowledge>/gi, '')
    const formatted = `[${memory.category}] ${safeContent}`
    if (!formatted || boardMemoryChars + formatted.length > maxBoardMemoryChars) break
    boardMemories.push(formatted)
    boardMemoryChars += formatted.length
  }
  const projectLearningContext = buildProjectLearningPromptContext(
    ((projectLearningsRes.data ?? []) as ProjectLearningContextRow[]).map((learning) => ({
      type: learning.learning_type,
      trustLevel: learning.trust_level,
      title: learning.title,
      body: learning.body,
      confidence: Number(learning.confidence ?? 0.7),
    })),
  )
  boardMemories.push(...projectLearningContext)

  return {
    assistantConfig: {
      id: assistant.id,
      name: assistant.name,
      engine: assistant.engine === 'hermes' ? 'hermes' : 'openclaw',
      systemPrompt: assistant.system_prompt,
      soulContent: assistant.soul_content,
      runtimeFlavor:
        assistant.runtime_flavor === 'c1_managed' || assistant.runtime_flavor === 'c2a_autonomous'
          ? assistant.runtime_flavor
          : 'c1_managed',
      modelId: resolveAgentModel(assistant.lucid_model),
      temperature: Number(assistant.temperature ?? 0.7),
      maxTokens: Number(assistant.max_tokens ?? 4096),
      policyConfig: assistant.policy_config ?? {},
      memoryEnabled: Boolean(assistant.memory_enabled),
      approvalRequiredTools: assistant.approval_required_tools ?? [],
      orgId: row.org_id,
    },
    memoryInjection,
    boardMemories,
    conversationSummary: null,
  }
}

async function completeAgentOpsRunIfDagFinished(
  client: SupabaseClient,
  row: StepRow,
  projection: Awaited<ReturnType<typeof projectAgentOpsStepOutput>> | null,
): Promise<void> {
  const runId = getAgentOpsRunId(row.input)
  if (!runId || !row.dag_id) return

  const { data: dag, error } = await client
    .from('orchestration_dags')
    .select('status')
    .eq('id', row.dag_id)
    .maybeSingle()
  if (error || (dag as { status?: string } | null)?.status !== 'completed') {
    return
  }

  const completedAt = new Date().toISOString()
  await client
    .from('agent_ops_runs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      output: projection
        ? structuredStepOutputToRunOutput(projection.structured, {
            dagId: row.dag_id,
            dagNodeId: row.dag_node_id,
            stepId: row.id,
          })
        : {
            summary: '',
            completed_dag_id: row.dag_id,
            completed_dag_node_id: row.dag_node_id,
            completed_step_id: row.id,
          },
    })
    .eq('id', runId)
    .eq('org_id', row.org_id)
    .in('status', ['queued', 'running'])
}

/**
 * Extend the lease (timeout_at) for a claimed step. Used by long-running
 * dedicated-runtime executions to prevent the orphan detector from
 * reaping their step row mid-flight.
 */
export async function renewStepLease(
  runtimeId: string,
  orgId: string,
  stepId: string,
): Promise<{ ok: true; leaseExpiresAt: string } | { ok: false; error: string; status: number }> {
  const row = await loadOwnedStep(supabase, stepId, runtimeId, orgId)
  if (!row) return { ok: false, error: 'Step not found', status: 404 }
  if (row.status !== 'claimed' && row.status !== 'running') {
    return { ok: false, error: `Step not claimable (status=${row.status})`, status: 409 }
  }

  const leaseExpiresAt = new Date(Date.now() + STEP_LEASE_TTL_SECONDS * 1000)
  const { error: updErr } = await supabase
    .from('orchestration_steps')
    .update({ timeout_at: leaseExpiresAt.toISOString() })
    .eq('id', stepId)
    .in('status', ['claimed', 'running'])

  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}`, status: 500 }
  }

  return { ok: true, leaseExpiresAt: leaseExpiresAt.toISOString() }
}

export async function renewSharedStepLease(
  stepId: string,
): Promise<{ ok: true; leaseExpiresAt: string } | { ok: false; error: string; status: number }> {
  const row = await loadSharedStep(supabase, stepId)
  if (!row) return { ok: false, error: 'Step not found', status: 404 }
  if (row.status !== 'claimed' && row.status !== 'running') {
    return { ok: false, error: `Step not claimable (status=${row.status})`, status: 409 }
  }

  const leaseExpiresAt = new Date(Date.now() + STEP_LEASE_TTL_SECONDS * 1000)
  const { error: updErr } = await supabase
    .from('orchestration_steps')
    .update({ timeout_at: leaseExpiresAt.toISOString() })
    .eq('id', stepId)
    .in('status', ['claimed', 'running'])

  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}`, status: 500 }
  }

  return { ok: true, leaseExpiresAt: leaseExpiresAt.toISOString() }
}
