/**
 * Mission Control — Remediation Engine Types
 *
 * Shared types for auto-remediation policies.
 * Actual evaluation runs in worker/src/cron/remediation.ts.
 */

export type TriggerType = 'threshold' | 'pattern' | 'schedule'
export type ActionType =
  | 'pause_agent'
  | 'restart_channel'
  | 'retry_dead_letters'
  | 'switch_model'
  | 'archive_memories'
  | 'notify'

export interface RemediationPolicy {
  id: string
  org_id: string
  name: string
  enabled: boolean
  trigger_type: TriggerType
  condition: Record<string, unknown>
  action_type: ActionType
  action_config: Record<string, unknown>
  cooldown_seconds: number
  last_triggered_at: string | null
}

export interface RemediationLogEntry {
  id: string
  policy_id: string
  org_id: string
  agent_id: string | null
  action_taken: string
  outcome: 'success' | 'failure' | 'skipped'
  details: Record<string, unknown>
  triggered_at: string
}

/** Default policies created for each org */
export const DEFAULT_POLICIES: Array<Omit<RemediationPolicy, 'id' | 'org_id' | 'last_triggered_at'>> = [
  {
    name: 'Auto-pause on high error rate',
    enabled: true,
    trigger_type: 'threshold',
    condition: { metric: 'error_rate_10m', operator: '>', value: 0.5 },
    action_type: 'pause_agent',
    action_config: { notify: true },
    cooldown_seconds: 600,
  },
  {
    name: 'Retry dead letters',
    enabled: true,
    trigger_type: 'threshold',
    condition: { metric: 'dead_letter_count', operator: '>', value: 0 },
    action_type: 'retry_dead_letters',
    action_config: { max_retries: 3, backoff_ms: 5000 },
    cooldown_seconds: 300,
  },
  {
    name: 'Cost guard — route to fast model',
    enabled: false,
    trigger_type: 'threshold',
    condition: { metric: 'daily_cost_pct', operator: '>', value: 0.8 },
    action_type: 'switch_model',
    action_config: { target_model: 'gpt-4o-mini', non_critical_only: true },
    cooldown_seconds: 3600,
  },
  {
    name: 'Memory cleanup',
    enabled: false,
    trigger_type: 'threshold',
    condition: { metric: 'memory_count_per_user', operator: '>', value: 5000 },
    action_type: 'archive_memories',
    action_config: { importance_below: 0.3, older_than_days: 30 },
    cooldown_seconds: 86400,
  },
]

/** Check if a policy should fire based on cooldown */
export function isPolicyCoolingDown(policy: RemediationPolicy): boolean {
  if (!policy.last_triggered_at) return false
  const elapsed = Date.now() - new Date(policy.last_triggered_at).getTime()
  return elapsed < policy.cooldown_seconds * 1000
}
