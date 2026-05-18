import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSubscription, updateSubscription, getActiveSubscriptionByOrgId, isWebhookEventProcessed, recordWebhookEvent } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/coinbase
 * Handle Coinbase Commerce webhook events
 *
 * Events handled:
 * - charge:confirmed
 * - charge:failed
 * - charge:pending
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-cc-webhook-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    const webhookSecret = process.env.COINBASE_WEBHOOK_SECRET
    if (!webhookSecret) {
      ErrorService.captureException(new Error('COINBASE_WEBHOOK_SECRET is not configured'), {
        severity: 'fatal',
        context: { endpoint: '/api/webhooks/coinbase' },
        tags: { layer: 'api', route: 'webhooks/coinbase' },
      })
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    const expectedSignature = Buffer.from(computedSignature, 'hex')
    const providedSignature = Buffer.from(signature, 'hex')
    if (
      expectedSignature.length !== providedSignature.length ||
      !crypto.timingSafeEqual(expectedSignature, providedSignature)
    ) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)

    // Idempotency: skip if already processed
    try {
      const eventId = event.id || event.data?.id
      const eventType = event.type || 'unknown'
      const alreadyProcessed = await isWebhookEventProcessed('coinbase', eventId, eventType)
      if (alreadyProcessed) {
        return NextResponse.json({ received: true, duplicate: true })
      }
    } catch {
      // If idempotency check fails, continue processing -- better to double-process than miss
    }

    switch (event.type) {
      case 'charge:confirmed': {
        const charge = event.data
        const { org_id, user_id: _user_id, plan_id, billing_period } = charge.metadata

        // Get subscription dates
        const now = new Date().toISOString()
        const periodEnd = new Date()
        periodEnd.setMonth(periodEnd.getMonth() + (billing_period === 'yearly' ? 12 : 1))

        // Create subscription in database
        await createSubscription({
          org_id,
          plan_id,
          billing_period,
          payment_method: 'crypto',
          coinbase_charge_id: charge.id,
          status: 'active',
          current_period_start: now,
          current_period_end: periodEnd.toISOString(),
        })

        break
      }

      case 'charge:failed': {
        const charge = event.data
        const { org_id } = charge.metadata

        if (org_id) {
          const existingSub = await getActiveSubscriptionByOrgId(org_id)
          if (existingSub) {
            await updateSubscription(existingSub.id, {
              status: 'past_due',
            })
          }
        }
        break
      }

      case 'charge:pending': {
        // No action needed — payment is pending confirmation
        break
      }
    }

    // Record successful processing for idempotency
    try {
      const eventId = event.id || event.data?.id
      await recordWebhookEvent('coinbase', eventId, event.type)
    } catch {
      // Non-fatal -- next retry will re-process but that's safe
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/api/webhooks/coinbase',
        method: 'POST'
      },
      tags: {
        layer: 'api',
        route: 'webhooks/coinbase'
      }
    });
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
