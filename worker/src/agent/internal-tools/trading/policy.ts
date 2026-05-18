import type { BuiltInToolExecutorParams } from '../../BuiltInToolExecutor.js'

/**
 * get_trading_policy — internal SaaS tool.
 * Reads trading_policies + trading_daily_usage from Supabase.
 *
 * Private tool — depends on Supabase, org context, RLS.
 * Per architecture: internal tools stay in LucidMerged permanently.
 */
export async function executeTradingPolicyTool(
  params: BuiltInToolExecutorParams,
): Promise<string> {
  const { supabase, userId, assistant } = params

  const { data: policy, error: policyErr } = await supabase
    .from('trading_policies')
    .select(
      'enabled, max_trade_value_usd, daily_limit_usd, max_slippage_bps, require_confirmation_above_usd, allowed_chains, allowed_tokens, blocked_protocols',
    )
    .eq('assistant_id', assistant.id)
    .single()

  if (policyErr && policyErr.code !== 'PGRST116') {
    return JSON.stringify({ error: 'Failed to fetch trading policy' })
  }

  if (!policy) {
    return JSON.stringify({
      enabled: false,
      message: 'No trading policy configured. Trading is disabled.',
    })
  }

  const today = new Date().toISOString().split('T')[0]
  const { data: usage } = await supabase
    .from('trading_daily_usage')
    .select('total_volume_usd, trade_count')
    .eq('user_id', userId)
    .eq('assistant_id', assistant.id)
    .eq('usage_date', today)
    .single()

  const maxTrade = Number(policy.max_trade_value_usd) || 100
  const dailyLimit = Number(policy.daily_limit_usd) || 500
  const slippageBps = Number(policy.max_slippage_bps) || 100
  const dailyUsed = Number(usage?.total_volume_usd) || 0
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed)
  const tradeCount = Number(usage?.trade_count) || 0
  const confirmAbove = policy.require_confirmation_above_usd
    ? `$${Number(policy.require_confirmation_above_usd)} USD`
    : 'not set'

  // Return human-readable text so the LLM presents it clearly
  const lines = [
    `Trading: ${policy.enabled ? 'ENABLED' : 'DISABLED'}`,
    '',
    '## Limits',
    `- Max per trade: $${maxTrade} USD`,
    `- Daily limit: $${dailyLimit} USD`,
    `- Max slippage: ${slippageBps / 100}% (${slippageBps} basis points)`,
    `- Require confirmation above: ${confirmAbove}`,
    '',
    '## Allowed Chains',
    (policy.allowed_chains?.length
      ? policy.allowed_chains.map((c: string) => `- ${c}`).join('\n')
      : '- None configured'),
    '',
    '## Allowed Tokens',
  ]

  const tokens = policy.allowed_tokens as Record<string, string[]> | null
  if (tokens && Object.keys(tokens).length > 0) {
    for (const [chain, tokenList] of Object.entries(tokens)) {
      lines.push(`- ${chain}: ${tokenList.join(', ')}`)
    }
  } else {
    lines.push('- All tokens (no restriction)')
  }

  if (policy.blocked_protocols?.length) {
    lines.push('', '## Blocked Protocols')
    for (const p of policy.blocked_protocols) {
      lines.push(`- ${p}`)
    }
  }

  lines.push(
    '',
    `## Today's Usage (${today})`,
    `- Trades: ${tradeCount}`,
    `- Volume: $${dailyUsed} USD`,
    `- Remaining: $${dailyRemaining} USD of $${dailyLimit} daily limit`,
  )

  return lines.join('\n')
}
