/**
 * POST /api/runtimes/steps/renew-lease — Dedicated runtime extends the
 * timeout_at lease on a claimed step.
 *
 * Phase 4N-c, Task 50. Used by long-running executions to prevent the
 * orphan detector from reaping their row mid-flight.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRuntime } from '../../_auth'
import { renewSharedStepLease, renewStepLease } from '@/lib/dag/step-claim-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  stepId: z.string().uuid(),
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
      ? await renewSharedStepLease(parsed.data.stepId)
      : await renewStepLease(runtime!.id, runtime!.orgId, parsed.data.stepId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, leaseExpiresAt: result.leaseExpiresAt })
  } catch (err) {
    ErrorService.captureException(
      err instanceof Error ? err : new Error('Step renew-lease error'),
      { context: { endpoint: '/api/runtimes/steps/renew-lease', method: 'POST' } },
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function isSharedWorkerSecret(authHeader: string | null): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  return Boolean(secret && authHeader === `Bearer ${secret}`)
}
