/**
 * Usage Tracker — hooks into OpenClaw's processing pipeline to track
 * token usage per org/project for billing purposes.
 *
 * Matches the worker's UsageRecord shape (worker/src/utils/usage-tracker.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantContext } from '../types'

export interface UsageEvent {
  runId?: string
  assistantId: string
  conversationId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  llmCalls: number
  toolCalls: number
  wallTimeMs: number
  tenant: TenantContext
}

export class UsageTracker {
  constructor(private supabase: SupabaseClient) {}

  /** Record token usage for billing (matches worker's assistant_usage_records table) */
  async trackUsage(event: UsageEvent): Promise<void> {
    try {
      const { error } = await this.supabase.from('assistant_usage_records').insert({
        run_id: event.runId || null,
        org_id: event.tenant.orgId,
        assistant_id: event.assistantId,
        conversation_id: event.conversationId,
        model: event.model,
        prompt_tokens: event.promptTokens,
        completion_tokens: event.completionTokens,
        total_tokens: event.totalTokens,
        llm_calls: event.llmCalls,
        tool_calls: event.toolCalls,
        wall_time_ms: event.wallTimeMs,
      })

      if (error) {
        // Log but don't throw — billing failures shouldn't block message processing
        console.error('[UsageTracker] Failed to record usage:', error.message)
      }
    } catch (err) {
      console.warn('[UsageTracker] Tracking error (non-fatal):', err)
    }
  }

  /** Get total tokens used by an org in a time period */
  async getOrgUsage(orgId: string, since: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from('assistant_usage_records')
      .select('total_tokens')
      .eq('org_id', orgId)
      .gte('created_at', since.toISOString())

    if (error) throw new Error(`Failed to get org usage: ${error.message}`)
    return (data ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0)
  }
}
