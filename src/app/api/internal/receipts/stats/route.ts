/**
 * L2 Receipt Pipeline Stats
 *
 * GET /api/internal/receipts/stats?secret=<CRON_SECRET>
 *
 * Returns epoch statistics and current MMR root for observability dashboards.
 * Protected by CRON_SECRET (same as other internal endpoints).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEpochStats, getCurrentEpoch, getMmrRoot } from '@/lib/ai/receipts'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [stats, epoch, mmrRoot] = await Promise.all([
      getEpochStats(),
      getCurrentEpoch(),
      getMmrRoot(),
    ])

    return NextResponse.json({
      status: 'ok',
      stats,
      currentEpoch: epoch,
      mmrRoot,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/internal/receipts/stats' },
      tags: { layer: 'api', route: 'receipts-stats' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
