/**
 * Worker Notification Emitter
 *
 * Inserts user-facing notifications into the `notifications` table.
 * Used by worker crons/processors to alert org members about critical events.
 *
 * Pattern: resolve org members → insert one notification per member.
 * Fire-and-forget — never blocks agent execution.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error'

export interface AlertPayload {
  orgId: string
  title: string
  message: string
  severity: AlertSeverity
  /** Optional deep link (relative path, e.g. /mission-control) */
  href?: string
  /** If set, only notify this user instead of all org members */
  userId?: string
}

// ── Predefined alert templates ─────────────────────────────────────

export const ALERTS = {
  creditExhausted: (agentName: string, model: string, errorSnippet: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'AI credits exhausted',
    message: `${agentName} failed — ${model} returned a billing error. Top up your API credits to resume. (${errorSnippet.slice(0, 120)})`,
    severity: 'error',
    href: '/mission-control',
  }),

  costLimitExceeded: (agentName: string, limitType: 'daily' | 'monthly', limitUsd: number): Omit<AlertPayload, 'orgId'> => ({
    title: `${limitType === 'daily' ? 'Daily' : 'Monthly'} cost limit reached`,
    message: `${agentName} was auto-paused after exceeding the $${limitUsd.toFixed(2)} ${limitType} limit.`,
    severity: 'warning',
    href: '/mission-control',
  }),

  agentPaused: (agentName: string, reason: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Agent paused',
    message: `${agentName} was auto-paused: ${reason}`,
    severity: 'warning',
    href: '/mission-control',
  }),

  loopDetected: (agentName: string, toolName: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Loop detected',
    message: `${agentName} is repeating ${toolName} — tool execution was blocked to prevent a runaway loop.`,
    severity: 'warning',
    href: '/mission-control',
  }),

  healthDegraded: (agentName: string, score: number): Omit<AlertPayload, 'orgId'> => ({
    title: 'Agent health degraded',
    message: `${agentName} health score dropped to ${score}/100. Check Mission Control for details.`,
    severity: score < 30 ? 'error' : 'warning',
    href: '/mission-control',
  }),

  approvalExpired: (agentName: string, toolName: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Approval expired',
    message: `${agentName} requested approval for ${toolName} but it timed out. The tool call was blocked.`,
    severity: 'warning',
    href: '/mission-control',
  }),

  llmError: (agentName: string, errorMsg: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Agent run failed',
    message: `${agentName} encountered an error: ${errorMsg.slice(0, 200)}`,
    severity: 'error',
    href: '/mission-control',
  }),

  runEmpty: (agentName: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Agent returned empty response',
    message: `${agentName} produced no output. This usually means the AI provider returned an error or the model is unavailable.`,
    severity: 'warning',
    href: '/mission-control',
  }),

  integrationExpired: (provider: string, label?: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Connection expired',
    message: `Your ${label || provider} connection has expired. Reconnect to restore access.`,
    severity: 'error',
    href: '/mission-control/integrations',
  }),

  integrationExpiring: (provider: string, daysLeft: number, label?: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Connection expiring soon',
    message: `Your ${label || provider} connection expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Reconnect to avoid disruption.`,
    severity: 'warning',
    href: '/mission-control/integrations',
  }),

  integrationRevoked: (provider: string, label?: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Integration disconnected',
    message: `Your ${label || provider} connection was revoked or deleted. Reconnect to restore access.`,
    severity: 'error',
    href: '/mission-control/integrations',
  }),

  integrationError: (provider: string, errorMsg: string, label?: string): Omit<AlertPayload, 'orgId'> => ({
    title: 'Integration connection error',
    message: `Your ${label || provider} connection encountered an error: ${errorMsg.slice(0, 150)}`,
    severity: 'warning',
    href: '/mission-control/integrations',
  }),
} as const

// ── Emitter ────────────────────────────────────────────────────────

/**
 * Emit a user-facing notification to all members of an org (or a specific user).
 * Fire-and-forget — logs errors but never throws.
 */
export async function emitNotification(
  supabase: SupabaseClient,
  payload: AlertPayload,
): Promise<void> {
  try {
    let userIds: string[]

    if (payload.userId) {
      userIds = [payload.userId]
    } else {
      // Resolve org members
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', payload.orgId)

      userIds = (members ?? []).map((m: { user_id: string }) => m.user_id)
    }

    if (userIds.length === 0) return

    const rows = userIds.map((uid) => ({
      user_id: uid,
      organization_id: payload.orgId,
      title: payload.title,
      message: payload.message,
      type: payload.severity,
      severity: payload.severity,
      href: payload.href ?? null,
    }))

    const { error } = await supabase.from('notifications').insert(rows)

    if (error) {
      console.error('[notifications] Failed to emit:', error.message)
    }
  } catch (err) {
    console.error('[notifications] Emit error:', err instanceof Error ? err.message : err)
  }
}

/**
 * Detect credit/billing errors from LLM provider responses.
 * Returns true if the error message indicates a billing/credit issue.
 */
export function isCreditError(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase()
  return (
    lower.includes('credit balance is too low') ||
    lower.includes('quota exceeded') ||
    lower.includes('insufficient_quota') ||
    (lower.includes('billing') && lower.includes('error')) ||
    (lower.includes('rate limit') && lower.includes('billing')) ||
    lower.includes('exceeded your current quota')
  )
}
