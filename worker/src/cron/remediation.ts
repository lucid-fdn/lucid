/**
 * Mission Control — Auto-Remediation Engine (60s Cron)
 *
 * Evaluates remediation policies per org and takes automated actions:
 * - pause_agent: pause agent on high error rate
 * - notify: push notification to live feed
 * - switch_model: escalate to strong model
 * - retry: retry dead-lettered events
 *
 * Called from the worker's cron loop every 60 seconds.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import { EncryptionService } from '../crypto/encryption-service.js'

interface RemediationPolicy {
  id: string
  org_id: string
  name: string
  enabled: boolean
  trigger_type: string
  condition: {
    metric: string
    operator: string
    value: number
    window_seconds?: number
  }
  action_type: string
  action_config: Record<string, unknown>
  cooldown_seconds: number
  last_triggered_at: string | null
}

const QUEUED_REPLY_CHANNEL_TYPES = new Set(['discord', 'slack'])
const RECENT_REPLY_GAP_LOOKBACK_MS = 15 * 60 * 1000
const RECENT_REPLY_GAP_LIMIT = 50

export async function repairRecentQueuedReplyGaps(
  supabase: SupabaseClient,
  config: Config,
): Promise<number> {
  const since = new Date(Date.now() - RECENT_REPLY_GAP_LOOKBACK_MS).toISOString()
  const { data: inboundEvents, error: inboundError } = await supabase
    .from('assistant_inbound_events')
    .select('id, channel_id, processed_at')
    .eq('status', 'done')
    .not('processed_at', 'is', null)
    .gte('processed_at', since)
    .order('processed_at', { ascending: false })
    .limit(RECENT_REPLY_GAP_LIMIT)

  if (inboundError || !inboundEvents?.length) {
    if (inboundError) {
      console.warn('[remediation] Failed to scan recent inbound completions:', inboundError.message)
    }
    return 0
  }

  const inboundChannelIds = [...new Set(inboundEvents.map((row) => row.channel_id).filter(Boolean))]
  if (inboundChannelIds.length === 0) return 0

  const { data: channels, error: channelsError } = await supabase
    .from('assistant_channels')
    .select('id, channel_type')
    .in('id', inboundChannelIds)

  if (channelsError || !channels?.length) {
    if (channelsError) {
      console.warn('[remediation] Failed to load channel types for reply-gap repair:', channelsError.message)
    }
    return 0
  }

  const repairableChannelIds = new Set(
    channels
      .filter((row) => QUEUED_REPLY_CHANNEL_TYPES.has(String(row.channel_type ?? '')))
      .map((row) => row.id),
  )

  const candidates = inboundEvents.filter((row) => repairableChannelIds.has(row.channel_id))
  if (candidates.length === 0) return 0

  const candidateIds = candidates.map((row) => row.id)
  const { data: outboundRows, error: outboundError } = await supabase
    .from('assistant_outbound_events')
    .select('inbound_event_id')
    .in('inbound_event_id', candidateIds)

  if (outboundError) {
    console.warn('[remediation] Failed to load outbound links for reply-gap repair:', outboundError.message)
    return 0
  }

  const linkedInboundIds = new Set(
    (outboundRows ?? [])
      .map((row) => row.inbound_event_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )

  const missingCandidates = candidates.filter((row) => !linkedInboundIds.has(row.id))
  if (missingCandidates.length === 0) return 0

  const { repairCompletedInboundDelivery } = await import('../processors/inbound.js')
  const encryptionService = config.MESSAGE_ENCRYPTION_MASTER_KEY
    ? new EncryptionService(supabase, config.MESSAGE_ENCRYPTION_MASTER_KEY)
    : undefined

  let repairedCount = 0
  for (const candidate of missingCandidates) {
    try {
      const repaired = await repairCompletedInboundDelivery({
        supabase,
        config,
        encryptionService,
        eventId: candidate.id,
        acceptedStatuses: ['done'],
      })
      if (repaired) {
        repairedCount += 1
      }
    } catch (error) {
      console.warn(
        `[remediation] Failed reply-gap repair for inbound ${candidate.id}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  if (repairedCount > 0) {
    console.log(
      `[remediation] Repaired ${repairedCount}/${missingCandidates.length} recent queued reply gaps`,
    )
  }

  return repairedCount
}

export async function evaluateRemediationPolicies(
  supabase: SupabaseClient,
  config: Config,
): Promise<void> {
  try {
    await repairRecentQueuedReplyGaps(supabase, config)

    const { data: policies, error } = await supabase
      .from('mc_remediation_policies')
      .select('id, org_id, name, enabled, trigger_type, condition, action_type, action_config, cooldown_seconds, last_triggered_at')
      .eq('enabled', true)

    if (error || !policies?.length) return

    for (const policy of policies as RemediationPolicy[]) {
      // Check cooldown
      if (policy.last_triggered_at) {
        const elapsed =
          (Date.now() - new Date(policy.last_triggered_at).getTime()) / 1000
        if (elapsed < policy.cooldown_seconds) continue
      }

      const shouldTrigger = await evaluateCondition(supabase, policy)
      if (!shouldTrigger) continue

      console.log(`[remediation] Triggering policy: ${policy.name} (${policy.action_type})`)

      const outcome = await executeAction(supabase, policy)

      // Log the action
      await supabase.from('mc_remediation_log').insert({
        policy_id: policy.id,
        org_id: policy.org_id,
        action_taken: `${policy.action_type}: ${policy.name}`,
        outcome,
        details: { condition: policy.condition },
      })

      // Update last_triggered_at
      await supabase
        .from('mc_remediation_policies')
        .update({ last_triggered_at: new Date().toISOString() })
        .eq('id', policy.id)
    }
  } catch (err) {
    console.error(`[remediation] Error:`, err)
  }
}

async function evaluateCondition(
  supabase: SupabaseClient,
  policy: RemediationPolicy
): Promise<boolean> {
  const { metric, operator, value, window_seconds = 3600 } = policy.condition
  const since = new Date(Date.now() - window_seconds * 1000).toISOString()

  let metricValue = 0

  switch (metric) {
    case 'error_rate': {
      const { count: total } = await supabase
        .from('assistant_outbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', policy.org_id)
        .gte('created_at', since)

      const { count: failed } = await supabase
        .from('assistant_outbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', policy.org_id)
        .eq('status', 'failed')
        .gte('created_at', since)

      metricValue = total && total > 0 ? ((failed ?? 0) / total) * 100 : 0
      break
    }
    case 'dead_letters': {
      const { count } = await supabase
        .from('assistant_inbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', policy.org_id)
        .eq('status', 'dead_lettered')

      metricValue = count ?? 0
      break
    }
    case 'daily_cost': {
      const { data } = await supabase
        .from('mc_agent_cost_tracking')
        .select('estimated_cost_usd')
        .eq('org_id', policy.org_id)
        .eq('date', new Date().toISOString().slice(0, 10))

      metricValue = (data ?? []).reduce(
        (sum, r) => sum + Number(r.estimated_cost_usd ?? 0),
        0
      )
      break
    }
    default:
      return false
  }

  switch (operator) {
    case '>': return metricValue > value
    case '>=': return metricValue >= value
    case '<': return metricValue < value
    case '<=': return metricValue <= value
    case '==': return metricValue === value
    default: return false
  }
}

async function executeAction(
  supabase: SupabaseClient,
  policy: RemediationPolicy
): Promise<string> {
  try {
    switch (policy.action_type) {
      case 'pause_agent': {
        const agentId = policy.action_config.agent_id as string | undefined
        if (agentId) {
          const { transitionAgentStatus } = await import('../lib/agent-state-machine.js')
          const result = await transitionAgentStatus(supabase, agentId, policy.org_id, 'paused', {
            actor: 'remediation',
            reason: `Policy triggered: ${policy.name}`,
            metadata: { policyId: policy.id, trigger: policy.trigger_type },
          })
          if (!result.success) {
            console.warn(`[remediation] Failed to pause agent ${agentId}: ${result.error}`)
            return 'failed'
          }
        }
        return 'success'
      }
      case 'retry': {
        // Retry dead-lettered events by resetting their status to pending
        const { error } = await supabase
          .from('assistant_inbound_events')
          .update({ status: 'pending', retry_count: 0 })
          .eq('org_id', policy.org_id)
          .eq('status', 'dead_lettered')
          .limit(10)

        return error ? 'failed' : 'success'
      }
      case 'notify':
      case 'switch_model':
        // These will be implemented when the notification system is built
        return 'skipped'
      default:
        return 'skipped'
    }
  } catch (err) {
    console.error(`[remediation] Action error:`, err)
    return 'failed'
  }
}
