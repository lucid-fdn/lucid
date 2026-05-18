/**
 * POST /api/runtimes/steps/complete — Dedicated runtime reports step completion.
 *
 * Phase 4N-c, Task 50. On success, the SchedulerBridge promotes any newly
 * ready children of the node and advances the DAG header.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRuntime } from '../../_auth'
import { completeSharedStep, completeStep } from '@/lib/dag/step-claim-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  stepId: z.string().uuid(),
  output: z.string().max(102_400).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
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

    const resultPayload = {
      output: parsed.data.output,
      durationMs: parsed.data.durationMs,
      inputTokens: parsed.data.inputTokens,
      outputTokens: parsed.data.outputTokens,
      totalTokens: parsed.data.totalTokens,
      costUsd: parsed.data.costUsd,
    }
    const result = sharedWorkerAuth
      ? await completeSharedStep(parsed.data.stepId, resultPayload)
      : await completeStep(runtime!.id, runtime!.orgId, parsed.data.stepId, resultPayload)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    ErrorService.captureException(
      err instanceof Error ? err : new Error('Step complete error'),
      { context: { endpoint: '/api/runtimes/steps/complete', method: 'POST' } },
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function isSharedWorkerSecret(authHeader: string | null): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  return Boolean(secret && authHeader === `Bearer ${secret}`)
}
