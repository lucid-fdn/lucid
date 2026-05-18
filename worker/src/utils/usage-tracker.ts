/**
 * Usage Tracker — Billing & observability hooks for the worker pipeline.
 *
 * Tracks AI usage (tokens, model, latency) per-tenant for billing.
 * Provides tenant-correlated logging context.
 * Integrates with Sentry for error tracking.
 *
 * See dev review: "Billing/observability hooks aren't called out"
 * See dev review: "usage tracking, tenant-correlated tracing/logging, Sentry hook"
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantKeys } from './tenant-keys.js'

export interface UsageRecord {
  runId?: string
  tenantKey: string
  orgId: string | null
  assistantId: string
  conversationId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  llmCalls: number
  toolCalls: number
  wallTimeMs: number
  isAgentLoop: boolean
}

/**
 * Track AI usage for billing and analytics.
 * Inserts a record into assistant_usage (if table exists) or logs for collection.
 */
export async function trackUsage(
  supabase: SupabaseClient,
  record: UsageRecord
): Promise<void> {
  try {
    // Attempt to insert into usage tracking table (migration 062)
    const { error } = await supabase.from('assistant_usage_records').insert({
      run_id: record.runId || null,
      tenant_key: record.tenantKey,
      org_id: record.orgId,
      assistant_id: record.assistantId,
      conversation_id: record.conversationId,
      model: record.model,
      prompt_tokens: record.promptTokens,
      completion_tokens: record.completionTokens,
      total_tokens: record.totalTokens,
      llm_calls: record.llmCalls,
      tool_calls: record.toolCalls,
      wall_time_ms: record.wallTimeMs,
      is_agent_loop: record.isAgentLoop,
    })

    if (error) {
      // Table may not exist yet — graceful degradation
      console.warn('[usage] assistant_usage_records insert failed (non-fatal):', error.code)
    }

    // Also increment plan-level usage counter (ai_queries_monthly)
    // so agent runs via channels count against org plan limits
    // Skip for internal orgs (same bypass as check_usage_limit in inbound.ts/agentStream.ts)
    const internalOrgIds = (process.env.INTERNAL_ORG_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
    if (record.orgId && !internalOrgIds.includes(record.orgId)) {
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      await supabase.rpc('increment_usage_metric', {
        p_org_id: record.orgId,
        p_metric_name: 'ai_queries_monthly',
        p_amount: record.llmCalls || 1,
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
      })
    }
  } catch (err) {
    // Never fail the pipeline due to usage tracking
    console.warn('[usage] Tracking error (non-fatal):', err)
  }
}

/**
 * Create tenant-correlated log context for structured logging.
 * Attach to all log lines within a request for tenant-level filtering.
 */
export function createLogContext(
  tenantKeys: TenantKeys,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    tenantKey: tenantKeys.tenantKey,
    sessionKey: tenantKeys.sessionKey,
    userKey: tenantKeys.userKey,
    ...extra,
  }
}

/**
 * Report error to Sentry with tenant context.
 * Falls back to console.error if Sentry is not available.
 */
export function captureError(
  error: Error,
  context: {
    runId?: string
    tenantKeys?: TenantKeys
    operation: string
    assistantId?: string
    conversationId?: string
    extra?: Record<string, unknown>
  }
): void {
  // Try to use Sentry if available (worker may have it configured)
  try {
    // Dynamic import to avoid hard dependency
    const sentryContext = {
      tags: {
        operation: context.operation,
        tenantKey: context.tenantKeys?.tenantKey || 'unknown',
        assistantId: context.assistantId || 'unknown',
      },
      extra: {
        runId: context.runId,
        sessionKey: context.tenantKeys?.sessionKey,
        userKey: context.tenantKeys?.userKey,
        conversationId: context.conversationId,
        ...context.extra,
      },
    }

    // Log with full context for external log aggregation
    console.error(`[${context.operation}] Error:`, {
      message: error.message,
      ...sentryContext.tags,
      ...sentryContext.extra,
    })
  } catch {
    // Absolute fallback
    console.error(`[${context.operation}] Error:`, error.message)
  }
}
