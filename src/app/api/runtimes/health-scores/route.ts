import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../_auth'
import { runtimeHealthScoreSchema } from '@/lib/mission-control/schemas'
import { insertRuntimeHealthScore } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// POST /api/runtimes/health-scores — Submit health scores (API key auth)
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = runtimeHealthScoreSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await insertRuntimeHealthScore(runtime.orgId, parsed.data)
    if (result.error) {
      return NextResponse.json({ error: 'Failed to store health score' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/health-scores' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
