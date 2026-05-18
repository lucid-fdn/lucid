import { NextResponse } from 'next/server'
import { getDrainMetrics, xlen, xrange, isRedisAvailable } from '@/lib/redis/streams'
import { getServerSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// GET /api/internal/runtimes/ingest-health — Drain health for MC system panel
// Session-authed (called from browser), not CRON_SECRET (used by scheduled jobs)
export async function GET() {
  const session = await getServerSession()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isRedisAvailable()) {
    return NextResponse.json({
      available: false,
      message: 'Redis not configured',
    })
  }

  try {
    const [drainMetrics, eventsDepth, costsDepth] = await Promise.all([
      getDrainMetrics(),
      xlen('rt:events'),
      xlen('rt:costs'),
    ])

    // Compute oldest entry age from first stream entry
    let oldestEntryAgeMs: number | null = null
    const firstEvent = await xrange('rt:events', '-', '+', 1)
    if (firstEvent.length > 0) {
      // Stream entry ID format: <millisecondsTime>-<seq>
      const entryMs = parseInt(firstEvent[0].id.split('-')[0], 10)
      if (!isNaN(entryMs)) {
        oldestEntryAgeMs = Date.now() - entryMs
      }
    }

    // Determine health status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (eventsDepth > 20000 || costsDepth > 10000 || (oldestEntryAgeMs != null && oldestEntryAgeMs > 30000)) {
      status = 'critical'
    } else if (eventsDepth > 5000 || costsDepth > 2000 || (drainMetrics && drainMetrics.drainDurationMs > 3000)) {
      status = 'warning'
    }

    return NextResponse.json({
      available: true,
      status,
      streams: {
        eventsDepth,
        costsDepth,
        oldestEntryAgeMs,
      },
      drain: drainMetrics
        ? {
            lastDrainAt: drainMetrics.lastDrainAt,
            durationMs: drainMetrics.drainDurationMs,
            heartbeatsUpdated: drainMetrics.heartbeatsUpdated,
            eventsDrained: drainMetrics.eventsDrained,
            costsDrained: drainMetrics.costsDrained,
            fallbackCount: drainMetrics.fallbackCount,
          }
        : null,
    })
  } catch (error) {
    return NextResponse.json(
      { available: true, status: 'critical', error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}
