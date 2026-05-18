/**
 * TradingPolicyGuard
 * Enforces trading policies for autonomous agent transactions
 *
 * Checks:
 * 1. Trading enabled for assistant
 * 2. Chain in allowed_chains
 * 3. Tokens in allowed_tokens
 * 4. Trade value within max_trade_value_usd
 * 5. Daily total within daily_limit_usd
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export interface TradingPolicy {
  id: string
  assistant_id: string
  enabled: boolean
  max_trade_value_usd: number
  daily_limit_usd: number
  allowed_chains: string[]
  allowed_tokens: Record<string, string[]> // { chain: [tokens] }
  max_slippage_bps: number
  require_confirmation_above_usd: number | null
  blocked_protocols: string[]
  created_at: string
  updated_at: string
}

export interface TradingDailyUsage {
  total_volume_usd: number
  trade_count: number
}

export interface TradeValidationResult {
  allowed: boolean
  reason?: string
  requiresConfirmation?: boolean
  confirmationThreshold?: number
  maxSlippageBps?: number
  dailyUsed?: number
  dailyLimit?: number
  dailyRemaining?: number
}

export interface TradeRecordParams {
  txHash: string
  txType: 'swap' | 'transfer' | 'perp_order' | 'perp_cancel'
  chainType: 'ethereum' | 'solana'
  chainId?: string
  inputToken?: string
  inputAmount?: string
  outputToken?: string
  outputAmount?: string
  valueUsd: number
  slippageBps?: number
  status: 'pending' | 'submitted' | 'confirmed' | 'failed' | 'rejected'
  dexUsed?: string
  toolCallId?: string
  runId?: string
  errorMessage?: string
}

const TRADING_POLICY_COLUMNS = [
  'id',
  'assistant_id',
  'enabled',
  'max_trade_value_usd',
  'daily_limit_usd',
  'allowed_chains',
  'allowed_tokens',
  'max_slippage_bps',
  'require_confirmation_above_usd',
  'blocked_protocols',
  'created_at',
  'updated_at',
].join(', ')

const TRADING_TRANSACTION_SUMMARY_COLUMNS = [
  'id',
  'tx_hash',
  'tx_type',
  'chain_type',
  'chain_id',
  'input_token',
  'input_amount',
  'output_token',
  'output_amount',
  'recipient_address',
  'perp_market',
  'perp_side',
  'perp_size',
  'perp_price',
  'value_usd',
  'slippage_bps',
  'status',
  'dex_used',
  'tool_call_id',
  'run_id',
  'error_message',
  'confirmed_at',
  'block_number',
  'block_timestamp',
  'created_at',
].join(', ')

// ============================================================================
// TradingPolicyGuard
// ============================================================================

export class TradingPolicyGuard {
  constructor(
    private supabase: SupabaseClient,
    private assistantId: string,
    private userId: string
  ) {}

  /**
   * Check if a trade is allowed by policy
   */
  async canExecuteTrade(params: {
    chain: string
    inputToken: string
    outputToken?: string
    valueUsd: number
    type: 'swap' | 'transfer' | 'perp_order' | 'perp_cancel'
  }): Promise<TradeValidationResult> {
    const { chain, inputToken, outputToken, valueUsd, type } = params

    console.log('[TradingPolicyGuard] Checking trade:', {
      assistantId: this.assistantId.substring(0, 8) + '...',
      chain,
      inputToken,
      valueUsd,
      type,
    })

    try {
      // Use the database function for atomic policy check
      const { data, error } = await this.supabase.rpc('check_trading_policy', {
        p_assistant_id: this.assistantId,
        p_user_id: this.userId,
        p_chain_type: this.normalizeChainType(chain),
        p_input_token: inputToken,
        p_output_token: outputToken || inputToken,
        p_value_usd: valueUsd,
      })

      if (error) {
        console.error('[TradingPolicyGuard] Policy check error:', error)
        return {
          allowed: false,
          reason: `Policy check failed: ${error.message}`,
        }
      }

      const result = data as {
        allowed: boolean
        reason?: string
        requires_confirmation?: boolean
        confirmation_threshold?: number
        max_slippage_bps?: number
        daily_used?: number
        daily_limit?: number
        daily_remaining?: number
      }

      console.log('[TradingPolicyGuard] Policy check result:', result)

      return {
        allowed: result.allowed,
        reason: result.reason,
        requiresConfirmation: result.requires_confirmation,
        confirmationThreshold: result.confirmation_threshold,
        maxSlippageBps: result.max_slippage_bps,
        dailyUsed: result.daily_used,
        dailyLimit: result.daily_limit,
        dailyRemaining: result.daily_remaining,
      }
    } catch (error) {
      console.error('[TradingPolicyGuard] Unexpected error:', error)
      return {
        allowed: false,
        reason: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Record a trade in the audit log
   */
  async recordTrade(params: TradeRecordParams): Promise<{
    success: boolean
    transactionId?: string
    error?: string
  }> {
    console.log('[TradingPolicyGuard] Recording trade:', {
      txHash: params.txHash?.substring(0, 10) + '...',
      type: params.txType,
      valueUsd: params.valueUsd,
    })

    try {
      // Use the database function for atomic trade recording
      const { data, error } = await this.supabase.rpc('record_trade', {
        p_user_id: this.userId,
        p_assistant_id: this.assistantId,
        p_chain_type: params.chainType,
        p_chain_id: params.chainId || null,
        p_tx_hash: params.txHash || null,
        p_tx_type: params.txType,
        p_input_token: params.inputToken || null,
        p_input_amount: params.inputAmount || null,
        p_output_token: params.outputToken || null,
        p_output_amount: params.outputAmount || null,
        p_value_usd: params.valueUsd,
        p_slippage_bps: params.slippageBps || null,
        p_status: params.status,
        p_dex_used: params.dexUsed || null,
        p_tool_call_id: params.toolCallId || null,
        p_run_id: params.runId || null,
      })

      if (error) {
        console.error('[TradingPolicyGuard] Record trade error:', error)
        return {
          success: false,
          error: error.message,
        }
      }

      console.log('[TradingPolicyGuard] Trade recorded:', data)

      return {
        success: true,
        transactionId: data as string,
      }
    } catch (error) {
      console.error('[TradingPolicyGuard] Unexpected error recording trade:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get the trading policy for this assistant
   */
  async getPolicy(): Promise<TradingPolicy | null> {
    const { data, error } = await this.supabase
      .from('trading_policies')
      .select(TRADING_POLICY_COLUMNS)
      .eq('assistant_id', this.assistantId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[TradingPolicyGuard] Error fetching policy:', error)
      return null
    }

    return data as TradingPolicy | null
  }

  /**
   * Get daily usage for this user/assistant
   */
  async getDailyUsage(): Promise<TradingDailyUsage> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await this.supabase
      .from('trading_daily_usage')
      .select('total_volume_usd, trade_count')
      .eq('user_id', this.userId)
      .eq('assistant_id', this.assistantId)
      .eq('usage_date', today)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[TradingPolicyGuard] Error fetching daily usage:', error)
    }

    return {
      total_volume_usd: data?.total_volume_usd || 0,
      trade_count: data?.trade_count || 0,
    }
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    txId: string,
    status: 'submitted' | 'confirmed' | 'failed',
    updates?: {
      txHash?: string
      outputAmount?: string
      blockNumber?: number
      errorMessage?: string
    }
  ): Promise<boolean> {
    const updateData: Record<string, unknown> = {
      status,
    }

    if (updates?.txHash) {
      updateData.tx_hash = updates.txHash
    }
    if (updates?.outputAmount) {
      updateData.output_amount = updates.outputAmount
    }
    if (updates?.blockNumber) {
      updateData.block_number = updates.blockNumber
      updateData.confirmed_at = new Date().toISOString()
    }
    if (updates?.errorMessage) {
      updateData.error_message = updates.errorMessage
    }

    const { error } = await this.supabase
      .from('trading_transactions')
      .update(updateData)
      .eq('id', txId)

    if (error) {
      console.error('[TradingPolicyGuard] Error updating transaction:', error)
      return false
    }

    return true
  }

  /**
   * Get recent transactions for this user/assistant
   */
  async getRecentTransactions(limit: number = 10): Promise<unknown[]> {
    const { data, error } = await this.supabase
      .from('trading_transactions')
      .select(TRADING_TRANSACTION_SUMMARY_COLUMNS)
      .eq('user_id', this.userId)
      .eq('assistant_id', this.assistantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[TradingPolicyGuard] Error fetching transactions:', error)
      return []
    }

    return data || []
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Normalize chain name to chain type
   */
  private normalizeChainType(chain: string): 'ethereum' | 'solana' {
    if (chain === 'solana') {
      return 'solana'
    }
    // All other chains (ethereum, base, polygon, arbitrum) are EVM
    return 'ethereum'
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTradingPolicyGuard(
  supabase: SupabaseClient,
  assistantId: string,
  userId: string
): TradingPolicyGuard {
  return new TradingPolicyGuard(supabase, assistantId, userId)
}
