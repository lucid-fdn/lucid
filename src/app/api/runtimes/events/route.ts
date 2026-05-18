import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../_auth'
import { insertRuntimeEvents } from '@/lib/db/mission-control'
import { runtimeEventsSchema } from '@/lib/mission-control/schemas'
import { classifyEvent } from '@/lib/mission-control/event-classifier'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const FEATURE_REDIS_INGEST = process.env.FEATURE_REDIS_INGEST === 'true'

// POST /api/runtimes/events — Batch event ingestion (API key auth)
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = runtimeEventsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Classify events — noisy info events are sampled
    const classifiedEvents = parsed.data.events.map((e) => ({
      ...e,
      classification: classifyEvent(e.eventType, e.severity ?? 'info'),
    }))

    const eventsToIngest = classifiedEvents.filter(
      (e) => e.classification.shouldPersist
    )
    const droppedCount = classifiedEvents.length - eventsToIngest.length

    const timestamp = Date.now()

    // Redis ingest path: XADD to rt:events stream
    if (FEATURE_REDIS_INGEST) {
      try {
        const { xadd } = await import('@/lib/redis/streams')
        let allAdded = true

        for (let i = 0; i < eventsToIngest.length; i++) {
          const e = eventsToIngest[i]
          const ingestEventId = `${runtime.id}:${timestamp}:${i}`
          const id = await xadd('rt:events', {
            runtime_id: runtime.id,
            org_id: runtime.orgId,
            agent_id: e.agentId ?? '',
            event_type: e.eventType,
            severity: e.severity ?? 'info',
            payload: JSON.stringify(e.payload ?? {}),
            ingest_event_id: ingestEventId,
            created_at: new Date().toISOString(),
          }, 10000)

          if (!id) {
            allAdded = false
            break
          }
        }

        if (allAdded) {
          return NextResponse.json({
            inserted: eventsToIngest.length,
            sampled_out: droppedCount,
          })
        }
        // Redis XADD failed — fall through to direct Postgres with ingest_event_id
      } catch {
        // Redis unavailable — fall through to direct Postgres
      }
    }

    // Direct Postgres path (default, or Redis fallback)
    const eventsWithIds = eventsToIngest.map((e, i) => ({
      agentId: e.agentId,
      eventType: e.eventType,
      severity: e.severity,
      payload: e.payload,
      ...(FEATURE_REDIS_INGEST ? { ingestEventId: `${runtime.id}:${timestamp}:${i}` } : {}),
    }))

    const result = await insertRuntimeEvents(
      runtime.id,
      runtime.orgId,
      eventsWithIds
    )

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      inserted: result.inserted,
      sampled_out: droppedCount,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/events' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
