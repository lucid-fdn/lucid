import 'server-only'

import { supabase, ErrorService } from '@/lib/db/client'
import {
  listScheduledTaskVersions,
  recordScheduledTaskVersion,
  restoreScheduledTaskVersion,
} from '@/lib/db/mission-control'
import { validateCronExpression, calculateNextRun, getNextRuns } from '@/lib/scheduler/cron-utils'
import {
  CreateRoutineInputSchema,
  UpdateRoutineInputSchema,
  type CreateRoutineInput,
  type RoutineDefinition,
  type RoutineSimulation,
  type RoutineTargetType,
  type UpdateRoutineInput,
} from './types'
import {
  ROUTINE_TARGET_ADAPTERS,
  buildRoutineSimulation,
  inferRoutineKinds,
  inferTriggerKind,
} from './registry'

const ROUTINE_SELECT = '*'
type VersionedScheduledTask = Parameters<typeof recordScheduledTaskVersion>[0]['task']

function isMissingRoutineSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  const message = error?.message ?? ''
  return error?.code === '42703' || /schema cache|column .* does not exist|could not find/i.test(message)
}

function toRoutine(row: Record<string, unknown>): RoutineDefinition {
  const targetType = (row.target_type as RoutineTargetType | null) ?? (row.team_id ? 'team' : 'assistant')
  const inferred = inferRoutineKinds({
    target_type: targetType,
    task_kind: row.task_kind as RoutineDefinition['task_kind'] | undefined,
    assistant_id: row.assistant_id as string | null | undefined,
    team_id: row.team_id as string | null | undefined,
    target_id: row.target_id as string | null | undefined,
  })

  return {
    id: row.id as string,
    org_id: row.org_id as string,
    assistant_id: (row.assistant_id as string | null | undefined) ?? null,
    team_id: (row.team_id as string | null | undefined) ?? null,
    project_id: (row.project_id as string | null | undefined) ?? null,
    work_item_id: (row.work_item_id as string | null | undefined) ?? null,
    name: row.name as string,
    description: (row.description as string | null | undefined) ?? null,
    task_prompt: row.task_prompt as string,
    task_kind: inferred.taskKind,
    target_type: inferred.targetType,
    target_id: (row.target_id as string | null | undefined) ?? (targetType === 'team' ? row.team_id as string | null : row.assistant_id as string | null) ?? null,
    trigger_kind: (row.trigger_kind as RoutineDefinition['trigger_kind'] | null) ?? inferTriggerKind({
      cron_expression: row.cron_expression as string | null | undefined,
      run_at: row.run_at as string | null | undefined,
    }),
    trigger_config: (row.trigger_config as Record<string, unknown> | null | undefined) ?? {},
    cron_expression: (row.cron_expression as string | null | undefined) ?? null,
    run_at: (row.run_at as string | null | undefined) ?? null,
    timezone: (row.timezone as string | null | undefined) ?? 'UTC',
    concurrency_policy: (row.concurrency_policy as RoutineDefinition['concurrency_policy'] | null) ?? 'skip_if_running',
    catch_up_policy: (row.catch_up_policy as RoutineDefinition['catch_up_policy'] | null) ?? 'latest_only',
    catch_up_limit: (row.catch_up_limit as number | null | undefined) ?? 1,
    max_retries: (row.max_retries as number | null | undefined) ?? 3,
    budget_policy: (row.budget_policy as Record<string, unknown> | null | undefined) ?? {},
    runtime_selector: (row.runtime_selector as RoutineDefinition['runtime_selector'] | null | undefined) ?? { nativeScheduler: 'disabled' },
    capability_requirements: (row.capability_requirements as RoutineDefinition['capability_requirements'] | null | undefined) ?? [],
    context_policy: (row.context_policy as Record<string, unknown> | null | undefined) ?? {},
    knowledge_scope: (row.knowledge_scope as Record<string, unknown> | null | undefined) ?? {},
    trustgate_policy: (row.trustgate_policy as Record<string, unknown> | null | undefined) ?? {},
    team_policy: (row.team_policy as Record<string, unknown> | null | undefined) ?? {},
    dispatch_policy: (row.dispatch_policy as Record<string, unknown> | null | undefined) ?? {},
    source_kind: (row.source_kind as RoutineDefinition['source_kind'] | null) ?? 'manual',
    managed_resource_id: (row.managed_resource_id as string | null | undefined) ?? null,
    enabled: (row.enabled as boolean | null | undefined) ?? true,
    status: (row.status as string | null | undefined) ?? 'pending',
    next_run_at: (row.next_run_at as string | null | undefined) ?? null,
    last_run_at: (row.last_run_at as string | null | undefined) ?? null,
    last_run_status: (row.last_run_status as RoutineDefinition['last_run_status'] | null | undefined) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

async function resolveTeamCoordinator(teamId: string, orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('assistant_id, crews!inner(org_id)')
    .eq('crew_id', teamId)
    .eq('is_coordinator', true)
    .eq('crews.org_id', orgId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { fn: 'resolveTeamCoordinator', teamId, orgId },
      tags: { layer: 'routine', table: 'crew_members' },
    })
    return null
  }

  return (data as { assistant_id?: string | null } | null)?.assistant_id ?? null
}

function computeNextRun(input: {
  cronExpression?: string | null
  runAt?: string | null
  timezone?: string | null
}): string | null {
  if (input.runAt) return new Date(input.runAt).toISOString()
  if (!input.cronExpression) return null
  return calculateNextRun(input.cronExpression, new Date(), input.timezone ?? 'UTC')?.toISOString() ?? null
}

function estimateMonthlyRuns(cronExpression?: string | null): number | undefined {
  if (!cronExpression) return undefined
  const horizonStart = new Date()
  const horizonEnd = new Date(horizonStart.getTime() + 30 * 24 * 60 * 60 * 1000)
  let count = 0
  let cursor = horizonStart
  for (let i = 0; i < 10_000; i += 1) {
    const next = calculateNextRun(cronExpression, cursor)
    if (!next || next > horizonEnd) break
    count += 1
    cursor = new Date(next.getTime() + 60_000)
  }
  return count
}

async function syncAssistantRoutineWake(assistantId: string | null | undefined): Promise<void> {
  if (!assistantId) return
  try {
    const { data, error } = await supabase
      .from('agent_scheduled_tasks')
      .select('next_run_at')
      .eq('assistant_id', assistantId)
      .eq('enabled', true)
      .in('status', ['pending', 'failed'])
      .not('next_run_at', 'is', null)
      .order('next_run_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { fn: 'syncAssistantRoutineWake', assistantId },
        tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
      })
      return
    }

    const nextWakeAt = (data as { next_run_at?: string | null } | null)?.next_run_at ?? null
    const { error: updateError } = await supabase
      .from('ai_assistants')
      .update({ next_wake_at: nextWakeAt })
      .eq('id', assistantId)

    if (updateError) {
      ErrorService.captureException(updateError, {
        severity: 'warning',
        context: { fn: 'syncAssistantRoutineWake.update', assistantId },
        tags: { layer: 'routine', table: 'ai_assistants' },
      })
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { fn: 'syncAssistantRoutineWake.catch', assistantId },
      tags: { layer: 'routine' },
    })
  }
}

async function resolveAuthUserId(actorUserId?: string | null): Promise<string | null> {
  if (!actorUserId) return null
  const { data, error } = await supabase
    .schema('auth')
    .from('users')
    .select('id')
    .eq('id', actorUserId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id?: string | null }).id ?? null
}

export async function simulateRoutine(input: CreateRoutineInput | UpdateRoutineInput): Promise<RoutineSimulation> {
  const parsed = ('org_id' in input ? CreateRoutineInputSchema : UpdateRoutineInputSchema).safeParse(input)
  const warnings: string[] = []
  const errors: string[] = []

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`))
  }

  const safe = parsed.success ? parsed.data : input
  const inferred = inferRoutineKinds({
    target_type: safe.target_type,
    task_kind: safe.task_kind,
    assistant_id: safe.assistant_id,
    team_id: safe.team_id,
    target_id: safe.target_id,
  })
  const triggerKind = inferTriggerKind({
    trigger_kind: safe.trigger_kind,
    cron_expression: safe.cron_expression,
    run_at: safe.run_at,
  })
  const adapter = ROUTINE_TARGET_ADAPTERS[inferred.targetType]
  errors.push(...adapter.validate({
    targetId: safe.target_id,
    assistantId: safe.assistant_id,
    teamId: safe.team_id,
    projectId: safe.project_id,
    workItemId: safe.work_item_id,
    managedResourceId: safe.managed_resource_id,
    triggerConfig: safe.trigger_config,
    contextPolicy: safe.context_policy,
    knowledgeScope: safe.knowledge_scope,
  }))

  if (triggerKind === 'cron') {
    if (!safe.cron_expression) {
      errors.push('cron_expression is required for cron routines')
    } else {
      const validation = validateCronExpression(safe.cron_expression)
      if (!validation.valid) errors.push(validation.error ?? 'Invalid cron expression')
    }
  }

  if (triggerKind === 'one_shot') {
    if (!safe.run_at) {
      errors.push('run_at is required for one-shot routines')
    } else if (Number.isNaN(new Date(safe.run_at).getTime())) {
      errors.push('run_at must be a valid ISO timestamp')
    } else if (new Date(safe.run_at).getTime() < Date.now()) {
      errors.push('run_at must be in the future')
    }
  }

  if (safe.webhook_url) {
    const webhookUrl = new URL(safe.webhook_url)
    if (webhookUrl.protocol !== 'https:') errors.push('webhook_url must use HTTPS')
  }

  if (safe.runtime_selector?.nativeScheduler?.startsWith('delegate')) {
    warnings.push('Native scheduler delegation is capability-gated and must ACK/reconcile before it can execute Lucid-managed routines.')
  }
  warnings.push(...adapter.operatorNotes({
    targetId: safe.target_id,
    assistantId: safe.assistant_id,
    teamId: safe.team_id,
    projectId: safe.project_id,
    workItemId: safe.work_item_id,
    managedResourceId: safe.managed_resource_id,
    triggerConfig: safe.trigger_config,
    contextPolicy: safe.context_policy,
    knowledgeScope: safe.knowledge_scope,
  }))

  let nextRuns: string[] = []
  const first = computeNextRun({
    cronExpression: safe.cron_expression ?? null,
    runAt: safe.run_at ?? null,
    timezone: safe.timezone ?? 'UTC',
  })
  if (triggerKind === 'cron' && safe.cron_expression) {
    nextRuns = getNextRuns(safe.cron_expression, 5).map((date) => date.toISOString())
  } else if (first) {
    nextRuns.push(first)
  }

  const estimatedMonthlyRuns = triggerKind === 'cron' ? estimateMonthlyRuns(safe.cron_expression ?? null) : undefined
  if ((estimatedMonthlyRuns ?? 0) > 5000) {
    warnings.push('This routine may run more than 5,000 times per month; review budget, concurrency, and evidence retention policies.')
  }

  return buildRoutineSimulation({
    targetType: inferred.targetType,
    taskKind: inferred.taskKind,
    triggerKind,
    nextRuns,
    warnings,
    errors,
    capabilityRequirements: safe.capability_requirements ?? adapter.requiredCapabilities,
    estimatedMonthlyRuns,
    estimatedFanout: adapter.estimatedFanout({
      targetId: safe.target_id,
      assistantId: safe.assistant_id,
      teamId: safe.team_id,
      projectId: safe.project_id,
      workItemId: safe.work_item_id,
      managedResourceId: safe.managed_resource_id,
      triggerConfig: safe.trigger_config,
      contextPolicy: safe.context_policy,
      knowledgeScope: safe.knowledge_scope,
    }),
  })
}

export async function listRoutines(options: {
  orgId: string
  assistantId?: string
  teamId?: string
  targetType?: RoutineTargetType
  status?: string
  limit?: number
}): Promise<RoutineDefinition[]> {
  let query = supabase
    .from('agent_scheduled_tasks')
    .select(ROUTINE_SELECT)
    .eq('org_id', options.orgId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50)

  if (options.assistantId) query = query.eq('assistant_id', options.assistantId)
  if (options.teamId) query = query.eq('team_id', options.teamId)
  if (options.targetType) query = query.eq('target_type', options.targetType)
  if (options.status) query = query.eq('status', options.status)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'listRoutines', options },
      tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
    })
    return []
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toRoutine)
}

export async function getRoutine(options: {
  routineId: string
  orgId: string
}): Promise<RoutineDefinition | null> {
  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .select(ROUTINE_SELECT)
    .eq('id', options.routineId)
    .eq('org_id', options.orgId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getRoutine', routineId: options.routineId, orgId: options.orgId },
      tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
    })
    return null
  }

  return data ? toRoutine(data as Record<string, unknown>) : null
}

export async function createRoutine(input: CreateRoutineInput, actorUserId?: string | null): Promise<RoutineDefinition | null> {
  const parsed = CreateRoutineInputSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))

  const authActorUserId = await resolveAuthUserId(actorUserId)
  const simulation = await simulateRoutine(parsed.data)
  if (!simulation.valid) throw new Error(simulation.errors.join('; '))

  const inferred = inferRoutineKinds(parsed.data)
  const adapter = ROUTINE_TARGET_ADAPTERS[inferred.targetType]
  const triggerKind = inferTriggerKind(parsed.data)
  const teamId = parsed.data.team_id ?? (inferred.targetType === 'team' ? parsed.data.target_id ?? null : null)
  const assistantId = parsed.data.assistant_id
    ?? (inferred.targetType === 'assistant' ? parsed.data.target_id ?? null : null)
    ?? (teamId ? await resolveTeamCoordinator(teamId, parsed.data.org_id) : null)

  if (!assistantId) {
    throw new Error(inferred.targetType === 'team'
      ? 'Team routines require a coordinator assistant'
      : adapter.needsExecutionAssistant
        ? `Execution assistant is required for ${adapter.label} routines`
        : 'assistant_id is required')
  }

  const row = {
    assistant_id: assistantId,
    org_id: parsed.data.org_id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    task_prompt: parsed.data.task_prompt,
    cron_expression: parsed.data.cron_expression ?? null,
    run_at: parsed.data.run_at ?? null,
    timezone: parsed.data.timezone ?? 'UTC',
    next_run_at: computeNextRun({
      cronExpression: parsed.data.cron_expression ?? null,
      runAt: parsed.data.run_at ?? null,
      timezone: parsed.data.timezone ?? 'UTC',
    }),
    status: 'pending',
    enabled: true,
    idempotency_key: parsed.data.idempotency_key ?? null,
    webhook_url: parsed.data.webhook_url ?? null,
    task_kind: inferred.taskKind,
    target_type: inferred.targetType,
    target_id: parsed.data.target_id ?? (inferred.targetType === 'team' ? teamId : assistantId),
    team_id: teamId,
    project_id: parsed.data.project_id ?? null,
    work_item_id: parsed.data.work_item_id ?? null,
    trigger_kind: triggerKind,
    trigger_config: parsed.data.trigger_config ?? {},
    concurrency_policy: parsed.data.concurrency_policy ?? 'skip_if_running',
    catch_up_policy: parsed.data.catch_up_policy ?? 'latest_only',
    catch_up_limit: parsed.data.catch_up_limit ?? 1,
    max_retries: parsed.data.max_retries ?? 3,
    budget_policy: parsed.data.budget_policy ?? {},
    runtime_selector: parsed.data.runtime_selector ?? { nativeScheduler: 'disabled' },
    capability_requirements: parsed.data.capability_requirements ?? adapter.requiredCapabilities,
    context_policy: parsed.data.context_policy ?? {},
    knowledge_scope: parsed.data.knowledge_scope ?? {},
    trustgate_policy: parsed.data.trustgate_policy ?? {},
    team_policy: parsed.data.team_policy ?? {},
    dispatch_policy: parsed.data.dispatch_policy ?? {},
    source_kind: parsed.data.source_kind ?? 'manual',
    managed_resource_id: parsed.data.managed_resource_id ?? null,
    updated_by_user_id: authActorUserId,
  }

  const query = parsed.data.idempotency_key
    ? supabase.from('agent_scheduled_tasks').upsert(row, { onConflict: 'assistant_id,idempotency_key', ignoreDuplicates: false })
    : supabase.from('agent_scheduled_tasks').insert(row)

  const { data, error } = await query.select(ROUTINE_SELECT).single()
  if (error) {
    ErrorService.captureException(error, {
      severity: isMissingRoutineSchema(error) ? 'error' : 'error',
      context: { fn: 'createRoutine', orgId: parsed.data.org_id, targetType: inferred.targetType },
      tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
    })
    throw new Error(isMissingRoutineSchema(error)
      ? 'Routine database migration is not applied'
      : `Failed to create routine: ${error.message}`)
  }

  await recordScheduledTaskVersion({
    task: data as unknown as VersionedScheduledTask,
    changeType: 'created',
    summary: 'Routine created',
    actorUserId: authActorUserId,
  })
  await syncAssistantRoutineWake((data as { assistant_id?: string | null }).assistant_id)

  return toRoutine(data as Record<string, unknown>)
}

export async function updateRoutine(
  routineId: string,
  orgId: string,
  updates: UpdateRoutineInput,
  actorUserId?: string | null,
): Promise<RoutineDefinition | null> {
  const parsed = UpdateRoutineInputSchema.safeParse(updates)
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))

  const authActorUserId = await resolveAuthUserId(actorUserId)
  const current = await getRoutine({ routineId, orgId })
  if (!current) return null

  const merged: CreateRoutineInput = {
    org_id: orgId,
    assistant_id: parsed.data.assistant_id !== undefined ? parsed.data.assistant_id : current.assistant_id,
    team_id: parsed.data.team_id !== undefined ? parsed.data.team_id : current.team_id,
    project_id: parsed.data.project_id !== undefined ? parsed.data.project_id : current.project_id,
    work_item_id: parsed.data.work_item_id !== undefined ? parsed.data.work_item_id : current.work_item_id,
    name: parsed.data.name ?? current.name,
    description: parsed.data.description !== undefined ? parsed.data.description : current.description,
    task_prompt: parsed.data.task_prompt ?? current.task_prompt,
    task_kind: parsed.data.task_kind ?? current.task_kind,
    target_type: parsed.data.target_type ?? current.target_type,
    target_id: parsed.data.target_id !== undefined ? parsed.data.target_id : current.target_id,
    trigger_kind: parsed.data.trigger_kind ?? current.trigger_kind,
    trigger_config: parsed.data.trigger_config ?? current.trigger_config,
    cron_expression: parsed.data.cron_expression !== undefined ? parsed.data.cron_expression : current.cron_expression,
    run_at: parsed.data.run_at !== undefined ? parsed.data.run_at : current.run_at,
    timezone: parsed.data.timezone ?? current.timezone,
    concurrency_policy: parsed.data.concurrency_policy ?? current.concurrency_policy,
    catch_up_policy: parsed.data.catch_up_policy ?? current.catch_up_policy,
    catch_up_limit: parsed.data.catch_up_limit ?? current.catch_up_limit,
    max_retries: parsed.data.max_retries ?? current.max_retries,
    budget_policy: parsed.data.budget_policy ?? current.budget_policy,
    runtime_selector: parsed.data.runtime_selector ?? current.runtime_selector,
    capability_requirements: parsed.data.capability_requirements ?? current.capability_requirements,
    context_policy: parsed.data.context_policy ?? current.context_policy,
    knowledge_scope: parsed.data.knowledge_scope ?? current.knowledge_scope,
    trustgate_policy: parsed.data.trustgate_policy ?? current.trustgate_policy,
    team_policy: parsed.data.team_policy ?? current.team_policy,
    dispatch_policy: parsed.data.dispatch_policy ?? current.dispatch_policy,
    source_kind: parsed.data.source_kind ?? current.source_kind,
    managed_resource_id: parsed.data.managed_resource_id !== undefined ? parsed.data.managed_resource_id : current.managed_resource_id,
    webhook_url: parsed.data.webhook_url,
  }
  const simulation = await simulateRoutine(merged)
  if (!simulation.valid) throw new Error(simulation.errors.join('; '))

  const inferred = inferRoutineKinds(merged)
  const triggerKind = inferTriggerKind(merged)
  const teamId = merged.team_id ?? (inferred.targetType === 'team' ? merged.target_id ?? null : null)
  const assistantId = merged.assistant_id
    ?? (inferred.targetType === 'assistant' ? merged.target_id ?? null : null)
    ?? (teamId ? await resolveTeamCoordinator(teamId, orgId) : null)
  if (!assistantId) {
    const adapter = ROUTINE_TARGET_ADAPTERS[inferred.targetType]
    throw new Error(inferred.targetType === 'team'
      ? 'Team routines require a coordinator assistant'
      : adapter.needsExecutionAssistant
        ? `Execution assistant is required for ${adapter.label} routines`
        : 'assistant_id is required')
  }

  const patch: Record<string, unknown> = { updated_by_user_id: authActorUserId }
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value
  }
  patch.task_kind = inferred.taskKind
  patch.target_type = inferred.targetType
  patch.assistant_id = assistantId
  patch.team_id = teamId
  patch.target_id = merged.target_id ?? (inferred.targetType === 'team' ? teamId : assistantId)
  patch.trigger_kind = triggerKind
  patch.cron_expression = triggerKind === 'cron' ? merged.cron_expression ?? null : null
  patch.run_at = triggerKind === 'one_shot' ? merged.run_at ?? null : null
  patch.next_run_at = computeNextRun({
    cronExpression: patch.cron_expression as string | null,
    runAt: patch.run_at as string | null,
    timezone: merged.timezone,
  })
  if (parsed.data.enabled === true) patch.status = 'pending'

  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .update(patch)
    .eq('id', routineId)
    .eq('org_id', orgId)
    .select(ROUTINE_SELECT)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'updateRoutine', routineId, orgId },
      tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
    })
    throw new Error(`Failed to update routine: ${error.message}`)
  }

  if (!data) return null

  await recordScheduledTaskVersion({
    task: data as unknown as VersionedScheduledTask,
    changeType: 'updated',
    summary: 'Routine updated',
    actorUserId: authActorUserId,
  })
  await syncAssistantRoutineWake((data as { assistant_id?: string | null }).assistant_id)

  return toRoutine(data as Record<string, unknown>)
}

export async function cancelRoutine(routineId: string, orgId: string, actorUserId?: string | null): Promise<boolean> {
  const authActorUserId = await resolveAuthUserId(actorUserId)
  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .update({
      status: 'cancelled',
      enabled: false,
      updated_by_user_id: authActorUserId,
    })
    .eq('id', routineId)
    .eq('org_id', orgId)
    .select(ROUTINE_SELECT)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'cancelRoutine', routineId, orgId },
      tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
    })
    return false
  }
  if (data) {
    await recordScheduledTaskVersion({
      task: data as unknown as VersionedScheduledTask,
      changeType: 'cancelled',
      summary: 'Routine cancelled',
      actorUserId: authActorUserId,
    })
    await syncAssistantRoutineWake((data as { assistant_id?: string | null }).assistant_id)
  }
  return true
}

export async function deleteRoutine(routineId: string, orgId: string, actorUserId?: string | null): Promise<boolean> {
  return cancelRoutine(routineId, orgId, actorUserId)
}

export async function listRoutineRuns(options: {
  routineId: string
  orgId: string
  limit?: number
}): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('agent_scheduled_task_runs')
    .select('*')
    .eq('task_id', options.routineId)
    .eq('org_id', options.orgId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 25)

  if (error) {
    if (isMissingRoutineSchema(error)) return []
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'listRoutineRuns', routineId: options.routineId, orgId: options.orgId },
      tags: { layer: 'routine', table: 'agent_scheduled_task_runs' },
    })
    return []
  }

  return (data ?? []) as Array<Record<string, unknown>>
}

export async function triggerRoutineNow(
  routineId: string,
  orgId: string,
  actorUserId?: string | null,
): Promise<RoutineDefinition | null> {
  const authActorUserId = await resolveAuthUserId(actorUserId)
  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .update({
      status: 'pending',
      enabled: true,
      next_run_at: new Date().toISOString(),
      updated_by_user_id: authActorUserId,
    })
    .eq('id', routineId)
    .eq('org_id', orgId)
    .select(ROUTINE_SELECT)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'triggerRoutineNow', routineId, orgId },
      tags: { layer: 'routine', table: 'agent_scheduled_tasks' },
    })
    throw new Error(`Failed to trigger routine: ${error.message}`)
  }

  if (!data) return null
  await recordScheduledTaskVersion({
    task: data as unknown as VersionedScheduledTask,
    changeType: 'updated',
    summary: 'Routine queued for immediate run',
    actorUserId: authActorUserId,
  })
  await syncAssistantRoutineWake((data as { assistant_id?: string | null }).assistant_id)
  return toRoutine(data as Record<string, unknown>)
}

export async function listRoutineVersions(options: {
  orgId: string
  routineId: string
  limit?: number
}) {
  return listScheduledTaskVersions({
    orgId: options.orgId,
    taskId: options.routineId,
    limit: options.limit,
  })
}

export async function restoreRoutineVersion(options: {
  orgId: string
  routineId: string
  versionId: string
  actorUserId?: string | null
  expectedCurrentSnapshotHash?: string | null
}) {
  const authActorUserId = await resolveAuthUserId(options.actorUserId)
  return restoreScheduledTaskVersion({
    orgId: options.orgId,
    taskId: options.routineId,
    versionId: options.versionId,
    actorUserId: authActorUserId,
    expectedCurrentSnapshotHash: options.expectedCurrentSnapshotHash,
  })
}

export async function getRoutineDrift(options: {
  orgId: string
  routineId: string
}): Promise<{ drifted: boolean; checks: Array<{ name: string; status: 'ok' | 'unknown'; detail?: string }> }> {
  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .select('id, org_id, managed_resource_id, source_kind, updated_at')
    .eq('id', options.routineId)
    .eq('org_id', options.orgId)
    .maybeSingle()

  if (error || !data) {
    return {
      drifted: false,
      checks: [{ name: 'routine_definition', status: 'unknown', detail: error?.message ?? 'Routine not found' }],
    }
  }

  const row = data as { managed_resource_id?: string | null; source_kind?: string | null }
  return {
    drifted: false,
    checks: [
      {
        name: 'managed_resource',
        status: 'ok',
        detail: row.managed_resource_id
          ? 'Managed resource linkage present; pack reconciler remains source of truth for deep drift.'
          : 'Routine is not pack-managed.',
      },
      {
        name: 'source_kind',
        status: 'ok',
        detail: row.source_kind ?? 'manual',
      },
    ],
  }
}
