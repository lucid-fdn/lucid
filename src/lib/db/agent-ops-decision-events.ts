import 'server-only'

import {
  decisionEventSchema,
  type AgentOpsDecisionEvent,
} from '@/lib/agent-ops/decision-pacing'
import { ErrorService, supabase } from './client'

type DecisionEventRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string | null
  phase: AgentOpsDecisionEvent['phase']
  question_id: string
  door_type: AgentOpsDecisionEvent['doorType']
  decision_mode: AgentOpsDecisionEvent['decisionMode']
  question: string
  options: AgentOpsDecisionEvent['options'] | null
  selected_option: Record<string, unknown> | null
  risk_reason: string | null
  reversible: boolean
  flipped_from_event_id: string | null
  metadata: Record<string, unknown> | null
  created_by_user_id: string | null
  created_at: string
}

const DECISION_EVENT_SELECT = `
  id,
  org_id,
  project_id,
  ops_run_id,
  phase,
  question_id,
  door_type,
  decision_mode,
  question,
  options,
  selected_option,
  risk_reason,
  reversible,
  flipped_from_event_id,
  metadata,
  created_by_user_id,
  created_at
`

export async function recordAgentOpsDecisionEvent(
  input: AgentOpsDecisionEvent,
): Promise<AgentOpsDecisionEvent | null> {
  const parsed = decisionEventSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_ops_decision_events')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      ops_run_id: parsed.runId ?? null,
      phase: parsed.phase,
      question_id: parsed.questionId,
      door_type: parsed.doorType,
      decision_mode: parsed.decisionMode,
      question: parsed.question,
      options: parsed.options,
      selected_option: parsed.selectedOption ?? null,
      risk_reason: parsed.riskReason ?? null,
      reversible: parsed.reversible,
      flipped_from_event_id: parsed.flippedFromEventId ?? null,
      metadata: parsed.metadata,
      created_by_user_id: parsed.createdByUserId ?? null,
    })
    .select(DECISION_EVENT_SELECT)
    .single()

  if (error) {
    captureDecisionDbError(error, 'recordAgentOpsDecisionEvent', {
      orgId: parsed.orgId,
      runId: parsed.runId ?? null,
      questionId: parsed.questionId,
    })
    return null
  }

  return mapDecisionEventRow(data as DecisionEventRow)
}

export async function listAgentOpsDecisionEvents(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  decisionMode?: AgentOpsDecisionEvent['decisionMode'] | null
  limit?: number
}): Promise<AgentOpsDecisionEvent[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('agent_ops_decision_events')
    .select(DECISION_EVENT_SELECT)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.runId) query = query.eq('ops_run_id', input.runId)
  if (input.decisionMode) query = query.eq('decision_mode', input.decisionMode)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    captureDecisionDbError(error, 'listAgentOpsDecisionEvents', {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      runId: input.runId ?? null,
    })
    return []
  }

  return ((data ?? []) as DecisionEventRow[]).map(mapDecisionEventRow)
}

export async function flipAgentOpsDecisionEvent(input: {
  orgId: string
  eventId: string
  selectedOption: Record<string, unknown>
  createdByUserId?: string | null
  reason?: string | null
}): Promise<AgentOpsDecisionEvent | null> {
  const { data: source, error } = await supabase
    .from('agent_ops_decision_events')
    .select(DECISION_EVENT_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.eventId)
    .maybeSingle()

  if (error || !source) {
    if (error) {
      captureDecisionDbError(error, 'flipAgentOpsDecisionEvent.load', input)
    }
    return null
  }

  const event = mapDecisionEventRow(source as DecisionEventRow)
  if (!event.reversible) return null

  return recordAgentOpsDecisionEvent({
    orgId: event.orgId,
    projectId: event.projectId,
    runId: event.runId,
    phase: event.phase,
    questionId: event.questionId,
    doorType: event.doorType,
    decisionMode: 'flipped',
    question: event.question,
    options: event.options,
    selectedOption: input.selectedOption,
    riskReason: input.reason ?? event.riskReason,
    reversible: true,
    flippedFromEventId: event.id,
    metadata: {
      ...event.metadata,
      flipped_from_mode: event.decisionMode,
      flip_reason: input.reason ?? null,
    },
    createdByUserId: input.createdByUserId ?? null,
  })
}

function mapDecisionEventRow(row: DecisionEventRow): AgentOpsDecisionEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.ops_run_id,
    phase: row.phase,
    questionId: row.question_id,
    doorType: row.door_type,
    decisionMode: row.decision_mode,
    question: row.question,
    options: row.options ?? [],
    selectedOption: row.selected_option,
    riskReason: row.risk_reason,
    reversible: row.reversible,
    flippedFromEventId: row.flipped_from_event_id,
    metadata: row.metadata ?? {},
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

function captureDecisionDbError(error: unknown, operation: string, context: Record<string, unknown>) {
  ErrorService.captureException(error, {
    severity: 'warning',
    context: { ...context, operation },
    tags: { layer: 'database', table: 'agent_ops_decision_events' },
  })
}
