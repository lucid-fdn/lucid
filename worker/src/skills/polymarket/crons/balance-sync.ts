/**
 * Polymarket Balance Sync — On-chain verification cron (every 5 min).
 *
 * Reads CTF ERC-1155 balances for all tracked positions and stores snapshots.
 * Follows health-scores.ts cron pattern.
 *
 * Algorithm:
 * 1. Check feature flag → bail if off
 * 2. Query distinct (agent_id, token_id, condition_id, outcome) from trade log with net position > 0
 * 3. Resolve wallet addresses from ai_assistants → agent_wallets
 * 4. For each (wallet, tokenId): readCtfBalance() → INSERT snapshot
 * 5. DELETE snapshots older than 7 days
 * 6. Rate-limit: pLimit(5) concurrent RPC calls
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import pLimit from 'p-limit'
import { getConfig } from '../../../config.js'
import { readCtfBalance } from '../services/balance-reader.js'
import { redact } from '../../../utils/pii-redactor.js'

interface TradePosition {
  agent_id: string
  token_id: string
  condition_id: string
  outcome: string
}

export async function syncPolymarketBalances(supabase: SupabaseClient): Promise<void> {
  if (!getConfig().FEATURE_POLYMARKET_POSITIONS) return

  try {
    // 1. Get distinct positions from trade log
    const { data: trades, error: tradeError } = await supabase
      .from('polymarket_trade_log')
      .select('agent_id, token_id, condition_id, outcome, side, amount')

    if (tradeError || !trades?.length) return

    // Aggregate to find positions with net > 0
    const positionMap = new Map<string, TradePosition & { net: number }>()
    for (const t of trades) {
      const key = `${t.agent_id}:${t.token_id}`
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          agent_id: t.agent_id,
          token_id: t.token_id,
          condition_id: t.condition_id,
          outcome: t.outcome,
          net: 0,
        })
      }
      const pos = positionMap.get(key)!
      const amount = parseFloat(t.amount) || 0
      pos.net += t.side === 'BUY' ? amount : -amount
    }

    const openPositions = [...positionMap.values()].filter(p => p.net > 0)
    if (openPositions.length === 0) return

    // 2. Resolve wallet addresses for each agent
    const agentIds = [...new Set(openPositions.map(p => p.agent_id))]
    const { data: agents } = await supabase
      .from('ai_assistants')
      .select('id, agent_wallets')
      .in('id', agentIds)

    const walletMap = new Map<string, string>()
    if (agents) {
      for (const agent of agents) {
        const wallets = agent.agent_wallets as Array<{ chain_type: string; address: string; status: string }> | null
        const evmWallet = wallets?.find(w => w.chain_type === 'ethereum' && w.status === 'active')
        if (evmWallet) {
          walletMap.set(agent.id, evmWallet.address)
        }
      }
    }

    // 3. Read on-chain balances with rate limiting
    const limit = pLimit(5)
    const snapshots: Array<{
      agent_id: string
      wallet_address: string
      token_id: string
      condition_id: string
      outcome: string
      balance_raw: string
      balance_tokens: number
    }> = []

    await Promise.allSettled(
      openPositions.map(pos =>
        limit(async () => {
          const wallet = walletMap.get(pos.agent_id)
          if (!wallet) return

          try {
            const balanceRaw = await readCtfBalance(wallet, pos.token_id)
            // CTF tokens use 6 decimals (same as USDC.e)
            const balanceTokens = Number(balanceRaw) / 1e6

            snapshots.push({
              agent_id: pos.agent_id,
              wallet_address: wallet,
              token_id: pos.token_id,
              condition_id: pos.condition_id,
              outcome: pos.outcome,
              balance_raw: balanceRaw,
              balance_tokens: balanceTokens,
            })
          } catch (err) {
            console.warn(`[polymarket-balance-sync] Failed to read balance for ${redact(pos.token_id)}: ${redact(err instanceof Error ? err.message : String(err))}`)
          }
        }),
      ),
    )

    // 4. Batch insert snapshots (chunked to stay under Supabase payload limits)
    if (snapshots.length > 0) {
      const CHUNK_SIZE = 500
      let insertErrors = 0
      for (let i = 0; i < snapshots.length; i += CHUNK_SIZE) {
        const chunk = snapshots.slice(i, i + CHUNK_SIZE)
        const { error: insertError } = await supabase
          .from('polymarket_balance_snapshots')
          .insert(chunk)
        if (insertError) {
          insertErrors++
          console.error(`[polymarket-balance-sync] Insert error (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${insertError.message}`)
        }
      }
      if (insertErrors === 0) {
        console.log(`[polymarket-balance-sync] Stored ${snapshots.length} balance snapshots`)
      }
    }

    // 5. Cleanup: remove snapshots older than 7 days
    await supabase
      .from('polymarket_balance_snapshots')
      .delete()
      .lt('snapshot_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  } catch (err) {
    console.error(`[polymarket-balance-sync] Error:`, err)
  }
}
