/**
 * POST /api/runtimes/steps/claim — Dedicated runtime claims the next pending
 * DAG step bound to its runtime. Returns a StepRunPacket or 204 if empty.
 *
 * Phase 4N-c, Task 50. Part of the StepRunPacket protocol that lets a
 * dedicated runtime operate on orchestration_steps rows without needing
 * direct DB access or Pulse Redis credentials.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { claimNextSharedStep, claimNextStep } from '@/lib/dag/step-claim-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (isSharedWorkerSecret(authHeader)) {
      const packet = await claimNextSharedStep()
      if (!packet) {
        return new NextResponse(null, { status: 204 })
      }
      return NextResponse.json(packet)
    }

    const runtime = await authenticateRuntime(authHeader)
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const packet = await claimNextStep(runtime.id, runtime.orgId)
    if (!packet) {
      return new NextResponse(null, { status: 204 })
    }

    return NextResponse.json(packet)
  } catch (err) {
    ErrorService.captureException(
      err instanceof Error ? err : new Error('Step claim error'),
      { context: { endpoint: '/api/runtimes/steps/claim', method: 'POST' } },
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function isSharedWorkerSecret(authHeader: string | null): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  return Boolean(secret && authHeader === `Bearer ${secret}`)
}
