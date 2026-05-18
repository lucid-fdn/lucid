/**
 * Internal Trading Execute API — Confused-Deputy Protected
 *
 * P0-6: Worker sends ONLY { assistantId, transactionRequest }.
 * This API derives userId, walletAddress, privyWalletId from DB.
 * Never trusts worker-supplied identity params.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'
import { runPreTradeGuards } from '@/lib/trading/guards'
import { executeAutonomousTransaction, executeAgentWalletTransaction } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'
import { createClient } from '@supabase/supabase-js'
import {
  validateDestinationAddress,
  buildTransactionRequest,
  recordAndExecuteTransaction,
} from '@/lib/trading/execute-service'

export const dynamic = 'force-dynamic'

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

interface ExecuteRequest {
  assistantId: string
  useAgentWallet?: boolean
  transactionRequest: {
    chainType: 'ethereum' | 'solana'
    chainId?: string
    to?: string
    value?: string
    data?: string
    serializedTransaction?: string
    gasLimit?: string
    maxFeePerGas?: string
    maxPriorityFeePerGas?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify HMAC + replay protection
    const auth = await verifyInternalAuth(request)
    if (!auth.valid || !auth.body) {
      return NextResponse.json(
        { error: auth.error || 'Authentication failed' },
        { status: 401 }
      )
    }

    const body: ExecuteRequest = JSON.parse(auth.body)
    const { assistantId, transactionRequest } = body

    if (!assistantId || !transactionRequest) {
      return NextResponse.json(
        { error: 'Missing required fields: assistantId, transactionRequest' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // 2. DERIVE user from assistant (confused-deputy protection)
    const { data: assistant, error: assistantError } = await supabase
      .from('ai_assistants')
      .select('id, created_by, org_id, name')
      .eq('id', assistantId)
      .single()

    if (assistantError || !assistant) {
      console.error('[trading-execute] Assistant lookup failed', {
        assistantId,
        error: assistantError?.message,
        code: assistantError?.code,
        details: assistantError?.details,
      })
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const userId = assistant.created_by

    // 3. Run pre-trade guards (feature flag, kill switch, suspension, rate limit)
    const guardResult = await runPreTradeGuards(userId)
    if (!guardResult.allowed) {
      return NextResponse.json(
        { error: guardResult.reason, code: 'GUARD_REJECTED' },
        { status: 403 }
      )
    }

    // 3b. Check org trading freeze
    const { data: org } = await supabase
      .from('organizations')
      .select('trading_frozen')
      .eq('id', assistant.org_id)
      .single()

    if (org?.trading_frozen) {
      return NextResponse.json(
        { error: 'Trading is frozen for this organization', code: 'ORG_FROZEN' },
        { status: 403 }
      )
    }

    // ========================================================================
    // Agent wallet branch — early return before session_signer_permissions
    // ========================================================================
    if (body.useAgentWallet) {
      const chainType = transactionRequest.chainType === 'solana' ? 'solana' : 'ethereum'

      // Look up the agent wallet for this assistant + chain
      const { data: agentWallet, error: awError } = await supabase
        .from('agent_wallets')
        .select('id, assistant_id, chain_type, status, address, privy_wallet_id, withdrawal_address, created_at, updated_at')
        .eq('assistant_id', assistantId)
        .eq('chain_type', chainType)
        .eq('status', 'active')
        .single()

      if (awError || !agentWallet) {
        return NextResponse.json(
          { error: 'No active agent wallet for this chain' },
          { status: 403 }
        )
      }

      // Validate to_address against transfer_mode
      const { data: tradingPolicy } = await supabase
        .from('trading_policies')
        .select('transfer_mode, max_trade_value_usd, daily_limit_usd')
        .eq('assistant_id', assistantId)
        .single()

      const transferMode = tradingPolicy?.transfer_mode || 'defi_only'
      const toAddress = transactionRequest.to?.toLowerCase()

      if (toAddress) {
        const addrResult = await validateDestinationAddress(
          supabase,
          toAddress,
          transactionRequest.chainId || '1',
          transferMode,
          agentWallet.withdrawal_address
        )
        if (!addrResult.allowed) {
          return NextResponse.json(
            { error: addrResult.reason, code: 'ADDRESS_BLOCKED' },
            { status: 403 }
          )
        }
      }

      // Validate trade value against trading policy limits
      if (tradingPolicy) {
        const maxTradeUsd = tradingPolicy.max_trade_value_usd
        const dailyLimitUsd = tradingPolicy.daily_limit_usd

        if (maxTradeUsd && transactionRequest.value) {
          try {
            const { getExecutionPrice } = await import('@/lib/trading/price-oracle')
            const nativeSymbol = chainType === 'solana' ? 'SOL' : 'ETH'
            const chainName = chainType === 'solana' ? 'solana' : 'ethereum'
            const priceResult = await getExecutionPrice(nativeSymbol, chainName)

            // Convert wei/lamports to token units
            const decimals = chainType === 'solana' ? 9 : 18
            const valueInTokens = Number(BigInt(transactionRequest.value || '0')) / (10 ** decimals)
            const valueUsd = valueInTokens * priceResult.price

            if (valueUsd > maxTradeUsd) {
              return NextResponse.json(
                { error: `Trade value $${valueUsd.toFixed(2)} exceeds per-trade limit of $${maxTradeUsd}`, code: 'VALUE_LIMIT_EXCEEDED' },
                { status: 403 }
              )
            }

            // Check daily limit
            if (dailyLimitUsd) {
              const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
              const { data: dailyTxs } = await supabase
                .from('trading_transactions')
                .select('request_data')
                .eq('assistant_id', assistantId)
                .eq('status', 'submitted')
                .gte('created_at', dayAgo)

              // Sum up daily volume (best-effort — only counts native token value)
              let dailyVolumeUsd = 0
              for (const tx of dailyTxs || []) {
                const reqData = tx.request_data as Record<string, unknown> | null
                if (reqData?.value) {
                  const txValue = Number(BigInt(String(reqData.value))) / (10 ** decimals)
                  dailyVolumeUsd += txValue * priceResult.price
                }
              }

              if (dailyVolumeUsd + valueUsd > dailyLimitUsd) {
                return NextResponse.json(
                  { error: `Daily trading volume would exceed $${dailyLimitUsd} limit`, code: 'DAILY_LIMIT_EXCEEDED' },
                  { status: 403 }
                )
              }
            }
          } catch (priceErr) {
            // Price oracle failure — fail closed (block the trade)
            console.error('[trading-execute] Price check failed:', priceErr)
            return NextResponse.json(
              { error: 'Unable to verify trade value — price oracle unavailable', code: 'PRICE_CHECK_FAILED' },
              { status: 503 }
            )
          }
        }
      }

      // Build, record, execute, and update transaction
      const txReq = buildTransactionRequest(chainType, transactionRequest)

      const txResult = await recordAndExecuteTransaction(supabase, {
        userId,
        assistantId,
        orgId: assistant.org_id,
        walletAddress: agentWallet.address,
        privyWalletId: agentWallet.privy_wallet_id,
        chainType,
        chainId: transactionRequest.chainId,
        requestData: transactionRequest as unknown as Record<string, unknown>,
        executeFn: () =>
          executeAgentWalletTransaction(agentWallet.privy_wallet_id, agentWallet.address, txReq),
      })

      if (!txResult.success) {
        return NextResponse.json(
          { error: txResult.error, code: 'EXECUTION_FAILED', transactionId: txResult.transactionId },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        txHash: txResult.txHash,
        transactionId: txResult.transactionId,
        chain: chainType,
        chainId: transactionRequest.chainId,
        walletKind: 'agent',
      })
    }

    // 4. DERIVE trading policy from assistant (not from request)
    const { data: policy, error: policyError } = await supabase
      .from('trading_policies')
      .select('id, assistant_id, enabled, max_trade_value_usd, daily_limit_usd, allowed_chains, allowed_tokens, max_slippage_bps, require_confirmation_above_usd, blocked_protocols, onchain_capabilities, quorum_threshold_usd, transfer_mode, created_at, updated_at')
      .eq('assistant_id', assistantId)
      .eq('enabled', true)
      .single()

    if (policyError || !policy) {
      return NextResponse.json(
        { error: 'No active trading policy for this assistant' },
        { status: 403 }
      )
    }

    // 5. DERIVE authorized wallet from policy -> session_signer_permissions
    const { data: permission, error: permError } = await supabase
      .from('session_signer_permissions')
      .select('id, user_id, wallet_address, enabled, enabled_at, revoked_at, created_at, updated_at, chain_type, chain_id, privy_wallet_id, privy_user_id, wallet_owner_id, wallet_owner_kind, can_autotrade_computed, eligibility_reason, wallet_type, expires_at')
      .eq('user_id', userId)
      .eq('chain_type', transactionRequest.chainType)
      .eq('enabled', true)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (permError || !permission) {
      return NextResponse.json(
        { error: 'No authorized wallet for this chain type' },
        { status: 403 }
      )
    }

    // Check eligibility (can_autotrade_computed)
    if (permission.can_autotrade_computed === false) {
      return NextResponse.json(
        {
          error: 'Wallet not eligible for autonomous trading',
          reason: permission.eligibility_reason || 'Not a server-controlled wallet',
        },
        { status: 403 }
      )
    }

    // Check permission expiry
    if (permission.expires_at && new Date(permission.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Session signer permission expired. Please re-authorize.' },
        { status: 403 }
      )
    }

    const walletAddress = permission.wallet_address

    // 6-8. Build, record, execute, and update transaction
    const txReq = buildTransactionRequest(transactionRequest.chainType, transactionRequest)

    const txResult = await recordAndExecuteTransaction(supabase, {
      userId,
      assistantId,
      orgId: assistant.org_id,
      walletAddress,
      privyWalletId: permission.privy_wallet_id,
      chainType: transactionRequest.chainType,
      chainId: transactionRequest.chainId,
      requestData: transactionRequest as unknown as Record<string, unknown>,
      executeFn: () => executeAutonomousTransaction(userId, walletAddress, txReq),
    })

    if (!txResult.success) {
      return NextResponse.json(
        { error: txResult.error, code: 'EXECUTION_FAILED', transactionId: txResult.transactionId },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      txHash: txResult.txHash,
      transactionId: txResult.transactionId,
      chain: transactionRequest.chainType,
      chainId: transactionRequest.chainId,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'internalTradingExecute' },
      tags: { layer: 'trading-execute' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
