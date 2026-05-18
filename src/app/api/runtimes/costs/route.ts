import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../_auth'
import { runtimeCostSchema } from '@/lib/mission-control/schemas'
import { upsertRuntimeCosts } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const FEATURE_REDIS_INGEST = process.env.FEATURE_REDIS_INGEST === 'true'

// POST /api/runtimes/costs — Submit per-run cost data (API key auth)
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = runtimeCostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Redis ingest path: XADD to rt:costs stream with window dedupe fields
    if (FEATURE_REDIS_INGEST) {
      try {
        const { xadd } = await import('@/lib/redis/streams')
        const now = Date.now()
        const windowStart = new Date(Math.floor(now / 60000) * 60000).toISOString()
        const windowEnd = new Date(Math.floor(now / 60000) * 60000 + 60000).toISOString()
        // Use timestamp as seq — monotonic within a window
        const seq = now % 60000

        const id = await xadd('rt:costs', {
          runtime_id: runtime.id,
          org_id: runtime.orgId,
          agent_id: parsed.data.agentId,
          run_id: parsed.data.runId,
          input_tokens: String(parsed.data.inputTokens),
          output_tokens: String(parsed.data.outputTokens),
          estimated_cost_usd: String(parsed.data.estimatedCostUsd),
          window_start: windowStart,
          window_end: windowEnd,
          cost_seq: String(seq),
        }, 5000)

        if (id) {
          return NextResponse.json({ success: true })
        }
        // Redis XADD failed — fall through to direct Postgres
      } catch {
        // Redis unavailable — fall through to direct Postgres
      }
    }

    // Direct Postgres path (default, or Redis fallback)
    const result = await upsertRuntimeCosts(runtime.orgId, parsed.data)
    if (result.error) {
      return NextResponse.json({ error: 'Failed to store cost data' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/costs' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
