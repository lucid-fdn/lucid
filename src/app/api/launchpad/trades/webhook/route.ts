/**
 * Trade Indexing Webhook
 *
 * POST /api/launchpad/trades/webhook
 *
 * Receives on-chain trade events from Helius webhooks (or manual pushes).
 * Stores them in the agent_trades table for real-time trade feed display.
 *
 * Expected payload (Helius enhanced transaction format):
 * [{ signature, type, tokenTransfers, ... }]
 *
 * Also accepts simplified format for manual/test pushes:
 * { trades: [{ agent_id, type, wallet, amount_tokens, amount_usdc, price, tx_signature }] }
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

interface TradeInput {
  agent_id: string
  type: 'buy' | 'sell'
  wallet: string
  amount_tokens: number
  amount_usdc: number
  price: number
  tx_signature?: string
}

export async function POST(req: Request) {
  // Verify webhook secret — require HELIUS_WEBHOOK_SECRET specifically (no fallback)
  const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ error: 'HELIUS_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await req.json()

    // Support simplified format (for testing / manual pushes)
    let trades: TradeInput[] = []
    if (body.trades && Array.isArray(body.trades)) {
      trades = body.trades
    } else if (Array.isArray(body)) {
      // Helius enhanced transaction format — parse swap events
      // This is a simplified parser; extend for your specific token mints
      for (const tx of body) {
        if (tx.type === 'SWAP' && tx.tokenTransfers?.length >= 2) {
          const transfers = tx.tokenTransfers
          // Determine buy/sell from token direction
          const trade: TradeInput = {
            agent_id: '', // Resolved below via token mint lookup
            type: transfers[0].tokenAmount > 0 ? 'buy' : 'sell',
            wallet: tx.feePayer || transfers[0].fromUserAccount || 'unknown',
            amount_tokens: Math.abs(transfers[0].tokenAmount || 0),
            amount_usdc: Math.abs(transfers[1].tokenAmount || 0),
            price: 0,
            tx_signature: tx.signature,
          }
          if (trade.amount_tokens > 0 && trade.amount_usdc > 0) {
            trade.price = trade.amount_usdc / trade.amount_tokens
          }
          // Look up agent by token mint
          const mint = transfers[0].mint
          if (mint) {
            const { data } = await supabase
              .from('launched_agents')
              .select('id')
              .eq('token_mint', mint)
              .single()
            if (data) {
              trade.agent_id = data.id
              trades.push(trade)
            }
          }
        }
      }
    }

    if (trades.length === 0) {
      return NextResponse.json({ message: 'No valid trades to index', indexed: 0 })
    }

    // Insert trades
    const { error } = await supabase.from('agent_trades').insert(
      trades.map((t) => ({
        launched_agent_id: t.agent_id,
        trade_type: t.type,
        wallet_address: t.wallet,
        amount_tokens: t.amount_tokens,
        amount_usdc: t.amount_usdc,
        price: t.price,
        tx_signature: t.tx_signature,
      })),
    )

    if (error) {
      // If agent_trades table doesn't exist yet, fail gracefully
      if (error.code === '42P01') {
        return NextResponse.json({
          message: 'agent_trades table not yet created — trades discarded',
          indexed: 0,
        })
      }
      throw error
    }

    return NextResponse.json({ message: `Indexed ${trades.length} trades`, indexed: trades.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
