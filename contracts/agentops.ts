/**
 * AgentOps Event Taxonomy
 *
 * Shared, provider-neutral event classes used by runtimes, Mission Control,
 * App Service, Commerce, and support tooling. This file intentionally contains
 * only contracts and pure helpers so app, worker, and generated surfaces can
 * classify events without importing control-plane code.
 */

import { z } from 'zod'
import type { LucidStackId } from './stack'

export const AgentOpsEventClassSchema = z.enum([
  'runtime_lifecycle',
  'run_lifecycle',
  'tool_execution',
  'native_mutation',
  'approval_lifecycle',
  'channel_lifecycle',
  'team_lifecycle',
  'commerce_lifecycle',
  'app_service_lifecycle',
  'app_service_public_runtime',
  'provider_lifecycle',
  'trust_security',
  'data_lifecycle',
  'unknown',
])

export type AgentOpsEventClass = z.infer<typeof AgentOpsEventClassSchema>

export const AGENTOPS_EVENT_TYPES_BY_CLASS = {
  runtime_lifecycle: [
    'runtime_connected',
    'runtime_disconnected',
    'runtime_offline',
    'runtime_restarted',
    'runtime_migration_started',
    'runtime_migration_completed',
    'runtime_migration_failed',
  ],
  run_lifecycle: [
    'run_started',
    'run_finished',
    'run_failed',
    'run_cancelled',
    'task_scheduled',
    'task_completed',
    'task_failed',
    'task_cancelled',
  ],
  tool_execution: [
    'tool_call',
    'tool_result',
    'error',
  ],
  native_mutation: [
    'native_mutation_candidate',
  ],
  approval_lifecycle: [
    'approval_requested',
    'approval_resolved',
    'agent_paused',
    'agent_resumed',
  ],
  channel_lifecycle: [
    'message_received',
    'message_sent',
    'channel_connected',
    'channel_disconnected',
    'channel_deactivated',
    'inbound',
    'outbound',
  ],
  team_lifecycle: [
    'crew_run_started',
    'crew_run_completed',
    'crew_run_failed',
    'crew_member_started',
    'crew_member_completed',
    'crew_member_failed',
    'subagent_spawned',
    'subagent_completed',
    'subagent_failed',
  ],
  commerce_lifecycle: [
    'agent_commerce_intent_created',
    'agent_commerce_policy_decision',
    'agent_commerce_approval_requested',
    'agent_commerce_approval_resolved',
    'agent_commerce_credential_issued',
    'agent_commerce_provider_event',
    'agent_commerce_reconciliation_mismatch',
  ],
  app_service_lifecycle: [
    'app_generation_queued',
    'app_generation_started',
    'app_generation_completed',
    'app_generation_failed',
    'app_build_started',
    'app_build_completed',
    'app_build_failed',
    'app_deployment_created',
    'app_deployment_settings_updated',
    'app_deployment_paused',
    'app_deployment_resumed',
    'app_deployment_rolled_back',
    'app_deployment_failed',
  ],
  app_service_public_runtime: [
    'public_config_read',
    'public_status_read',
    'public_chat_completed',
    'public_lead_submitted',
    'public_feedback_submitted',
    'public_feedback_reported',
    'public_action_completed',
    'public_action_failed',
    'public_action_payment_required',
  ],
  provider_lifecycle: [
    'provider_health_updated',
    'provider_rate_limited',
    'provider_circuit_opened',
    'provider_circuit_closed',
    'external_deployment_started',
    'external_deployment_completed',
    'external_deployment_failed',
  ],
  trust_security: [
    'rate_limit_exceeded',
    'auth_failed',
    'policy_denied',
    'unsafe_feedback_reported',
    'abuse_signal_detected',
  ],
  data_lifecycle: [
    'receipt_created',
    'receipt_verified',
    'passport_provisioned',
    'epoch_anchored',
  ],
  unknown: [],
} as const satisfies Record<AgentOpsEventClass, readonly string[]>

export const AgentOpsEventTypeSchema = z.enum(
  Object.values(AGENTOPS_EVENT_TYPES_BY_CLASS)
    .flat()
    .filter((value, index, list) => list.indexOf(value) === index) as [string, ...string[]],
)

export type AgentOpsEventType = z.infer<typeof AgentOpsEventTypeSchema>

const EVENT_CLASS_BY_TYPE = new Map<string, AgentOpsEventClass>(
  Object.entries(AGENTOPS_EVENT_TYPES_BY_CLASS).flatMap(([eventClass, eventTypes]) => (
    eventTypes.map((eventType) => [eventType, eventClass as AgentOpsEventClass])
  )),
)

export const AGENTOPS_STACK_BY_EVENT_CLASS = {
  runtime_lifecycle: 'runtime',
  run_lifecycle: 'agentops',
  tool_execution: 'agentops',
  native_mutation: 'agentops',
  approval_lifecycle: 'mission_control',
  channel_lifecycle: 'runtime',
  team_lifecycle: 'teams',
  commerce_lifecycle: 'commerce',
  app_service_lifecycle: 'app_service',
  app_service_public_runtime: 'app_service',
  provider_lifecycle: 'providers',
  trust_security: 'trust',
  data_lifecycle: 'data',
  unknown: 'agentops',
} as const satisfies Record<AgentOpsEventClass, LucidStackId>

export function agentOpsClassForEventType(eventType: string): AgentOpsEventClass {
  return EVENT_CLASS_BY_TYPE.get(eventType) ?? 'unknown'
}

export function agentOpsStackForEventType(eventType: string): LucidStackId {
  return AGENTOPS_STACK_BY_EVENT_CLASS[agentOpsClassForEventType(eventType)]
}
