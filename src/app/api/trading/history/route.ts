import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ErrorService } from '@/lib/errors/error-service'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const tradingStatsRequestSchema = z.object({
  assistantId: z.string().min(1).optional(),
  period: z.enum(['day', 'week', 'month']).optional().default('day'),
})

/**
 * GET /api/trading/history
 * Get trading transaction history
 *
 * Query params:
 * - assistantId: string (optional) - filter by assistant
 * - chainType: 'ethereum' | 'solana' (optional) - filter by chain
 * - status: string (optional) - filter by status
 * - limit: number (optional, default 50, max 100)
 * - offset: number (optional, default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const { searchParams } = new URL(request.url)

    const assistantId = searchParams.get('assistantId')
    const chainType = searchParams.get('chainType')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = await createClient()

    // Build query
    let query = supabase
      .from('trading_transactions')
      .select('id, user_id, assistant_id, chain_type, chain_id, tx_hash, tx_type, input_token, input_amount, output_token, output_amount, recipient_address, perp_market, perp_side, perp_size, perp_price, value_usd, slippage_bps, status, error_message, dex_used, tool_call_id, run_id, created_at, confirmed_at, block_number, block_timestamp, ai_assistants(name)', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (assistantId) {
      query = query.eq('assistant_id', assistantId)
    }

    if (chainType) {
      query = query.eq('chain_type', chainType)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: transactions, count, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      transactions: transactions || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/trading/history', method: 'GET' },
      tags: { layer: 'api', route: 'trading-history' }
    })
    return NextResponse.json(
      { error: 'Failed to get trading history' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/trading/history/stats
 * Get trading statistics for the user
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const parsedBody = tradingStatsRequestSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { assistantId, period } = parsedBody.data

    const supabase = await createClient()

    // Get date range based on period
    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'day':
      default:
        startDate = new Date(now.toISOString().split('T')[0])
        break
    }

    // Build query for aggregated stats
    let query = supabase
      .from('trading_transactions')
      .select('tx_type, value_usd, status, chain_type')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())

    if (assistantId) {
      query = query.eq('assistant_id', assistantId)
    }

    const { data: transactions, error } = await query

    if (error) {
      throw error
    }

    // Aggregate stats
    const stats = {
      period,
      startDate: startDate.toISOString(),
      totalTrades: transactions?.length || 0,
      totalVolumeUsd: 0,
      successfulTrades: 0,
      failedTrades: 0,
      pendingTrades: 0,
      byType: {} as Record<string, { count: number; volumeUsd: number }>,
      byChain: {} as Record<string, { count: number; volumeUsd: number }>,
    }

    for (const tx of transactions || []) {
      const value = parseFloat(tx.value_usd || '0')
      stats.totalVolumeUsd += value

      // Count by status
      if (tx.status === 'confirmed') {
        stats.successfulTrades++
      } else if (tx.status === 'failed' || tx.status === 'rejected') {
        stats.failedTrades++
      } else {
        stats.pendingTrades++
      }

      // Aggregate by type
      if (!stats.byType[tx.tx_type]) {
        stats.byType[tx.tx_type] = { count: 0, volumeUsd: 0 }
      }
      stats.byType[tx.tx_type].count++
      stats.byType[tx.tx_type].volumeUsd += value

      // Aggregate by chain
      if (!stats.byChain[tx.chain_type]) {
        stats.byChain[tx.chain_type] = { count: 0, volumeUsd: 0 }
      }
      stats.byChain[tx.chain_type].count++
      stats.byChain[tx.chain_type].volumeUsd += value
    }

    // Get daily usage if assistantId provided
    let dailyUsage = null
    if (assistantId) {
      const today = new Date().toISOString().split('T')[0]
      const { data: usage } = await supabase
        .from('trading_daily_usage')
        .select('id, user_id, assistant_id, usage_date, total_volume_usd, trade_count, swap_count, swap_volume_usd, transfer_count, transfer_volume_usd, perp_count, perp_volume_usd, created_at, updated_at')
        .eq('user_id', userId)
        .eq('assistant_id', assistantId)
        .eq('usage_date', today)
        .single()

      dailyUsage = usage
    }

    return NextResponse.json({
      stats,
      dailyUsage,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/trading/history', method: 'POST' },
      tags: { layer: 'api', route: 'trading-stats' }
    })
    return NextResponse.json(
      { error: 'Failed to get trading stats' },
      { status: 500 }
    )
  }
}
