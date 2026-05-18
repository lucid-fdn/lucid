/**
 * Mission Control — Approval Gate
 *
 * Intercepts elevated tool calls and holds execution until owner approves.
 * Used by the unified executor to gate tools listed in assistant.approval_required_tools.
 *
 * Flow:
 *   1. Tool call intercepted → insert mc_pending_approvals row
 *   2. Poll for resolution (approved/denied/expired)
 *   3. Return result to agent
 *
 * Timeout: 5 minutes by default (configurable).
 * On timeout: auto-deny + log.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantConfig } from './types.js'

export interface ApprovalGateParams {
  supabase: SupabaseClient
  assistant: AssistantConfig
  runId: string
  toolName: string
  toolArgs: Record<string, unknown>
  timeoutMs?: number
  pollIntervalMs?: number
}

export type ApprovalResult =
  | { status: 'approved' }
  | { status: 'denied'; reason?: string }
  | { status: 'expired' }
  | { status: 'error'; message: string }

/**
 * Check if a tool requires approval for the given assistant.
 */
export function requiresApproval(
  assistant: AssistantConfig,
  toolName: string
): boolean {
  const tools = assistant.approval_required_tools
  if (!tools || tools.length === 0) return false
  return tools.includes(toolName)
}

/**
 * Wait for owner approval of an elevated tool call.
 * Inserts a pending approval, polls for resolution, returns result.
 */
export async function waitForApproval(params: ApprovalGateParams): Promise<ApprovalResult> {
  const {
    supabase,
    assistant,
    runId,
    toolName,
    toolArgs,
    timeoutMs = 300_000, // 5 minutes
    pollIntervalMs = 2_000,
  } = params

  const orgId = assistant.org_id
  if (!orgId) {
    return { status: 'error', message: 'No org_id on assistant — cannot create approval' }
  }

  const expiresAt = new Date(Date.now() + timeoutMs).toISOString()

  // Estimate risk level from tool name
  const riskLevel = estimateRiskLevel(toolName)

  // Insert pending approval
  const { data: approval, error: insertError } = await supabase
    .from('mc_pending_approvals')
    .insert({
      org_id: orgId,
      agent_id: assistant.id,
      run_id: runId,
      tool_name: toolName,
      tool_args: toolArgs,
      risk_level: riskLevel,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (insertError || !approval) {
    console.error('[approval-gate] Failed to insert pending approval:', insertError?.message)
    return { status: 'error', message: insertError?.message ?? 'Insert failed' }
  }

  const approvalId = approval.id
  console.log(`[approval-gate] Waiting for approval: ${approvalId} (tool=${toolName}, timeout=${timeoutMs}ms)`)

  // Phase 6: mirror to unified work queue (best-effort, never blocks approval).
  try {
    await supabase.from('human_work_items').insert({
      org_id: orgId,
      kind: 'pulse_standalone',
      agent_id: assistant.id,
      title: `Approval: ${toolName}`,
      description: `Agent requests approval for ${toolName}`,
      priority: riskLevel === 'high' ? 'high' : 'normal',
      labels: ['approval', toolName],
      status: 'open',
      due_at: expiresAt,
      external_mirror: { approval_id: approvalId },
    })
  } catch (err) {
    console.warn('[approval-gate] Mirror to human_work_items failed (non-fatal):', err instanceof Error ? err.message : err)
  }

  // Poll for resolution
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs)

    const { data: row, error: pollError } = await supabase
      .from('mc_pending_approvals')
      .select('status, resolved_by')
      .eq('id', approvalId)
      .single()

    if (pollError) {
      console.error('[approval-gate] Poll error:', pollError.message)
      continue
    }

    if (row.status === 'approved') {
      console.log(`[approval-gate] Approved: ${approvalId}`)
      return { status: 'approved' }
    }

    if (row.status === 'denied') {
      console.log(`[approval-gate] Denied: ${approvalId}`)
      // Get reason from log
      const { data: logEntry } = await supabase
        .from('mc_approval_log')
        .select('reason')
        .eq('approval_id', approvalId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      return { status: 'denied', reason: logEntry?.reason ?? undefined }
    }

    if (row.status === 'expired') {
      return { status: 'expired' }
    }
  }

  // Timeout — auto-expire
  console.log(`[approval-gate] Timeout: ${approvalId}`)
  await supabase
    .from('mc_pending_approvals')
    .update({ status: 'expired' })
    .eq('id', approvalId)
    .eq('status', 'pending')

  await supabase
    .from('mc_approval_log')
    .insert({
      approval_id: approvalId,
      org_id: orgId,
      action: 'expired',
      reason: `Timed out after ${timeoutMs / 1000}s`,
    })

  // Clean up the mirrored human_work_items row so it doesn't stay open
  // indefinitely after the approval it mirrors has expired.
  try {
    await supabase
      .from('human_work_items')
      .update({ status: 'cancelled', resolution_notes: 'Approval expired', completed_at: new Date().toISOString() })
      .filter('external_mirror->>approval_id', 'eq', approvalId)
      .in('status', ['open', 'in_progress'])
  } catch {
    // Best-effort cleanup.
  }

  return { status: 'expired' }
}

export function estimateRiskLevel(toolName: string): string {
  const highRiskTools = ['dex_swap', 'wallet_transfer', 'hl_place_order']
  const mediumRiskTools = ['hl_cancel_order']

  if (highRiskTools.includes(toolName)) return 'high'
  if (mediumRiskTools.includes(toolName)) return 'medium'
  return 'low'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
