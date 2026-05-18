/**
 * Cron endpoint for TX status polling.
 * Call via QStash schedule or Vercel cron every 15-30 seconds.
 * Protected by CRON_SECRET header check.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { pollPendingTransactions } from '@/lib/trading/tx-poller'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel cron or QStash)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await pollPendingTransactions()
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[TxPollCron] Error:', error)
    return NextResponse.json(
      { error: 'Poll failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
