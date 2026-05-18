/**
 * POST /api/runtimes/steps/fail — Dedicated runtime reports step failure.
 *
 * Phase 4N-c, Task 50. `retryable=false` drives SchedulerBridge to cancel
 * the subtree; `retryable=true` leaves the node failed but does not
 * propagate to descendants.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRuntime } from '../../_auth'
import { failSharedStep, failStep } from '@/lib/dag/step-claim-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  stepId: z.string().uuid(),
  errorMessage: z.string().min(1).max(4_096),
  retryable: z.boolean(),
})

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const sharedWorkerAuth = isSharedWorkerSecret(authHeader)
    const runtime = sharedWorkerAuth ? null : await authenticateRuntime(authHeader)
    if (!sharedWorkerAuth && !runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = sharedWorkerAuth
      ? await failSharedStep(parsed.data.stepId, parsed.data.errorMessage, parsed.data.retryable)
      : await failStep(
          runtime!.id,
          runtime!.orgId,
          parsed.data.stepId,
          parsed.data.errorMessage,
          parsed.data.retryable,
        )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    ErrorService.captureException(
      err instanceof Error ? err : new Error('Step fail error'),
      { context: { endpoint: '/api/runtimes/steps/fail', method: 'POST' } },
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function isSharedWorkerSecret(authHeader: string | null): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  return Boolean(secret && authHeader === `Bearer ${secret}`)
}
