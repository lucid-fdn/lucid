/**
 * Runtime Offline Check
 *
 * POST /api/internal/runtimes/check-offline?secret=<CRON_SECRET>
 *
 * Checks for runtimes that have gone stale (>5 min) or offline (>1 hour).
 * Updates runtime status and emits feed events for offline runtimes.
 * Should be called every 5 minutes by Vercel Cron or external scheduler.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkRuntimeOfflineEvents } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await checkRuntimeOfflineEvents()

    return NextResponse.json({
      status: 'ok',
      updated: result.updated,
      eventsInserted: result.eventsInserted,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/internal/runtimes/check-offline' },
      tags: { layer: 'api', route: 'runtimes-cron' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
