/**
 * Proof Anchor — records tool executions for verifiable AI.
 *
 * Creates mc_proof_anchors rows when elevated tools are executed.
 * Policy snapshot captures the trading policy state at execution time.
 * Chain anchoring is stubbed until L3 is deployed.
 */

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const ELEVATED_TOOLS = new Set([
  'dex_swap',
  'wallet_transfer',
  'hl_place_order',
  'hl_cancel_order',
])

export function isProofEligibleTool(toolName: string): boolean {
  return ELEVATED_TOOLS.has(toolName)
}

export async function recordProofAnchor(params: {
  supabase: SupabaseClient
  orgId: string
  agentId: string
  runId: string
  toolName: string
  toolArgs: Record<string, unknown>
  toolResult: string
  policySnapshot?: Record<string, unknown> | null
}): Promise<string | null> {
  try {
    const resultHash = crypto
      .createHash('sha256')
      .update(params.toolResult)
      .digest('hex')

    const { data, error } = await params.supabase
      .from('mc_proof_anchors')
      .insert({
        org_id: params.orgId,
        agent_id: params.agentId,
        run_id: params.runId,
        tool_name: params.toolName,
        tool_args: params.toolArgs,
        tool_result_hash: resultHash,
        policy_snapshot: params.policySnapshot ?? null,
        anchor_status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error(`[proof-anchor] Failed to record: ${error.message}`)
      return null
    }

    console.log(`[proof-anchor] Recorded proof ${data.id} for ${params.toolName}`)
    return data.id
  } catch (err) {
    console.error(`[proof-anchor] Error:`, err)
    return null
  }
}

/**
 * Fetch current trading policy for an assistant to snapshot.
 * Returns null if no policy exists.
 */
export async function fetchPolicySnapshot(
  supabase: SupabaseClient,
  assistantId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from('trading_policies')
      .select('enabled, max_trade_value_usd, daily_limit_usd, allowed_chains, allowed_tokens, max_slippage_bps')
      .eq('assistant_id', assistantId)
      .maybeSingle()

    if (error || !data) return null

    return data as Record<string, unknown>
  } catch {
    return null
  }
}
