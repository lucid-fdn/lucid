/**
 * Mission Control — Approval Gate Logic
 *
 * Shared types and helpers for the approval flow.
 * Worker-side enforcement is in worker/src/agent/approval-gate.ts.
 */

import { ELEVATED_TOOLS, APPROVAL_TIMEOUT_SECONDS } from './constants'
import type { RiskLevel } from './types'

/** Check if a tool requires approval for the given agent config */
export function requiresApproval(
  toolName: string,
  approvalRequiredTools: string[]
): boolean {
  return approvalRequiredTools.includes(toolName)
}

/** Check if a tool is in the elevated tools list */
export function isElevatedTool(toolName: string): boolean {
  return (ELEVATED_TOOLS as readonly string[]).includes(toolName)
}

/** Estimate risk level based on tool name and args */
export function estimateRiskLevel(
  toolName: string,
  args: Record<string, unknown>
): RiskLevel {
  // High-value financial operations
  if (['dex_swap', 'wallet_transfer'].includes(toolName)) {
    const amount = Number(args.amount ?? args.value ?? 0)
    if (amount > 1000) return 'critical'
    if (amount > 100) return 'high'
    return 'medium'
  }

  // Trading operations
  if (['hl_place_order', 'hl_cancel_order'].includes(toolName)) {
    const leverage = Number(args.leverage ?? 1)
    if (leverage > 10) return 'critical'
    if (leverage > 3) return 'high'
    return 'medium'
  }

  return 'low'
}

/** Check if an approval has expired */
export function isApprovalExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now()
}

/** Get remaining seconds before approval expires */
export function approvalTimeRemaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

/** Default timeout for approvals (seconds) */
export { APPROVAL_TIMEOUT_SECONDS }
