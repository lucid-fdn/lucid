/**
 * Agent Trading Activity Feed
 *
 * GET /api/launchpad/agents/[slug]/trades
 *
 * Returns recent buy/sell activity for the agent token.
 * Currently generates realistic mock data.
 * In production, this will pull from DEX transaction indexer.
 */

import { NextResponse } from 'next/server'
import { getLaunchedAgentBySlug } from '@/lib/db/launchpad'
import { supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

function generateTrades(
  price: number,
  holderCount: number,
  totalRequests: number,
  launchedAt: string | null,
) {
  const now = Date.now()
  let seed = totalRequests * 13 + holderCount * 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const walletChars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const randWallet = () => {
    let w = ''
    for (let i = 0; i < 44; i++) w += walletChars[Math.floor(rand() * walletChars.length)]
    return w
  }

  const tradeCount = Math.min(50, Math.max(8, Math.floor(holderCount * 0.1)))
  const trades = []

  for (let i = 0; i < tradeCount; i++) {
    const isBuy = rand() > 0.45 // slight buy bias
    const timeAgo = Math.floor(rand() * 86400_000 * 3) // last 3 days
    const timestamp = new Date(now - timeAgo).toISOString()

    // Random trade sizes — power law distribution (many small, few large)
    const sizeFactor = Math.pow(rand(), 2.5) // skew toward smaller
    const amountTokens = Math.floor(100 + sizeFactor * 500_000)
    const tradePrice = price * (0.95 + rand() * 0.1) // slight price variation
    const amountUsdc = amountTokens * tradePrice

    trades.push({
      id: `trade-${i}-${seed}`,
      type: isBuy ? 'buy' : 'sell',
      wallet: randWallet(),
      amount_tokens: amountTokens,
      amount_usdc: Number(amountUsdc.toFixed(2)),
      price: Number(tradePrice.toFixed(6)),
      timestamp,
    })
  }

  // Sort by timestamp descending (most recent first)
  trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return trades
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const agent = await getLaunchedAgentBySlug(slug)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Try real trades from agent_trades table first
  try {
    const { data: realTrades, error } = await supabase
      .from('agent_trades')
      .select('id, launched_agent_id, trade_type, wallet_address, amount_tokens, amount_usdc, price, tx_signature, created_at')
      .eq('launched_agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && realTrades && realTrades.length > 0) {
      const trades = realTrades.map((t) => ({
        id: t.id,
        type: t.trade_type as 'buy' | 'sell',
        wallet: t.wallet_address,
        amount_tokens: Number(t.amount_tokens),
        amount_usdc: Number(t.amount_usdc),
        price: Number(t.price),
        timestamp: t.created_at,
        tx_signature: t.tx_signature,
      }))

      return NextResponse.json(
        { trades, source: 'indexed' },
        { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
      )
    }
  } catch {
    // Table may not exist yet — fall through to mock
  }

  // Fallback: generate mock trades
  const trades = generateTrades(
    Number(agent.price_per_request),
    agent.holder_count,
    agent.total_requests,
    agent.launched_at,
  )

  return NextResponse.json(
    { trades, source: 'mock' },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      },
    }
  )
}
