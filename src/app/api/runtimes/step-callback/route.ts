import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { stepCallbackSchema } from '@/lib/mission-control/schemas'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/runtimes/step-callback — Webhook callback from external agents.
 *
 * Auth: HMAC token (recomputed from stepId + runId + PULSE_WEBHOOK_SECRET).
 * No authenticateRuntime() — external agents don't have runtime keys.
 */
export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.PULSE_WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Step callbacks not configured' }, { status: 503 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = stepCallbackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { stepId, callbackToken, status, output, errorMessage } = parsed.data

    // Load step from DB
    const { data: step, error: stepError } = await supabase
      .from('orchestration_steps')
      .select('id, run_id, status, callback_status')
      .eq('id', stepId)
      .single()

    if (stepError || !step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    // Verify HMAC token (recomputed from stepId + runId)
    const expectedToken = createHmac('sha256', webhookSecret)
      .update(`${stepId}:${step.run_id}`)
      .digest('hex')

    try {
      const valid = timingSafeEqual(
        Buffer.from(callbackToken),
        Buffer.from(expectedToken),
      )
      if (!valid) {
        return NextResponse.json({ error: 'Invalid callback token' }, { status: 401 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid callback token' }, { status: 401 })
    }

    // Duplicate callback idempotency
    if (step.callback_status === 'received') {
      return NextResponse.json({ alreadyReceived: true })
    }

    // Verify step is in expected state
    if (step.status !== 'running' || step.callback_status !== 'pending') {
      return NextResponse.json(
        { error: 'Step not in expected state', currentStatus: step.status },
        { status: 409 },
      )
    }

    // Update step with callback result
    const { error: updateError } = await supabase
      .from('orchestration_steps')
      .update({
        status: status === 'completed' ? 'completed' : 'failed',
        callback_status: 'received',
        output: output ?? null,
        error_message: errorMessage ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', stepId)
      .eq('callback_status', 'pending') // Optimistic lock

    if (updateError) {
      ErrorService.captureException(updateError, { context: { stepId, status } })
      return NextResponse.json({ error: 'Failed to update step' }, { status: 500 })
    }

    return NextResponse.json({ received: true, stepId })
  } catch (err) {
    ErrorService.captureException(err instanceof Error ? err : new Error('Step callback error'))
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
