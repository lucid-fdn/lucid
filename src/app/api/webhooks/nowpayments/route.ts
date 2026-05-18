import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  createSubscription,
  getActiveSubscriptionByOrgId,
  cancelSubscription,
  getPlanByName,
  createPayment,
  getPaymentByProviderPaymentId,
  isWebhookEventProcessed,
  recordWebhookEvent,
} from '@/lib/db'
import {
  getCheckoutAttempt,
  updateCheckoutAttemptStatus,
  claimCheckoutAttempt,
} from '@/lib/db/checkout-attempts'
import { syncSubscription } from '@/lib/control-plane/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj).sort().reduce<Record<string, unknown>>((result, key) => {
    const val = obj[key]
    result[key] = val && typeof val === 'object' && !Array.isArray(val)
      ? sortObject(val as Record<string, unknown>)
      : val
    return result
  }, {})
}

function verifySignature(body: Record<string, unknown>, signature: string, secret: string): boolean {
  const sorted = JSON.stringify(sortObject(body))
  const hmac = crypto.createHmac('sha512', secret).update(sorted).digest('hex')
  const hmacBuf = Buffer.from(hmac)
  const sigBuf = Buffer.from(signature)
  if (hmacBuf.length !== sigBuf.length) return false
  return crypto.timingSafeEqual(hmacBuf, sigBuf)
}

export async function POST(req: NextRequest) {
  const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const signature = req.headers.get('x-nowpayments-sig')
  if (!signature || !IPN_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
  }

  if (!verifySignature(body, signature, IPN_SECRET)) {
    ErrorService.captureException(new Error('NOWPayments HMAC verification failed'), {
      severity: 'error',
      context: { endpoint: '/api/webhooks/nowpayments', paymentId: body.payment_id },
      tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
    })
    return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 })
  }

  const paymentId = String(body.payment_id || '')
  const paymentStatus = String(body.payment_status || '')
  const orderId = String(body.order_id || '')

  try {
    // Dedupe by (provider, payment_id, payment_status). We must NOT collapse
    // distinct status transitions (`partially_paid` → `finished`) to the same
    // dedupe key, or the terminal success event for an in-progress payment
    // will be silently dropped and the subscription never activates.
    if (await isWebhookEventProcessed('nowpayments', paymentId, paymentStatus)) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch {
    // Continue — better to double-process than miss
  }

  const attempt = await getCheckoutAttempt(orderId)
  if (!attempt) {
    ErrorService.captureException(new Error(`Checkout attempt not found: ${orderId}`), {
      severity: 'error',
      context: { orderId, paymentId, paymentStatus, endpoint: '/api/webhooks/nowpayments' },
      tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
    })
    return NextResponse.json({ received: true, error: 'attempt_not_found' })
  }

  if (new Date(attempt.expires_at) < new Date() && paymentStatus !== 'finished') {
    await updateCheckoutAttemptStatus(attempt.id, 'expired')
    return NextResponse.json({ received: true, expired: true })
  }

  const { org_id: orgId, plan_name: planName } = attempt

  try {
    switch (paymentStatus) {
      case 'finished': {
        const claimed = await claimCheckoutAttempt(attempt.id)
        if (!claimed) {
          return NextResponse.json({ received: true, duplicate: true })
        }

        const existingPayment = await getPaymentByProviderPaymentId('nowpayments', paymentId)
        if (existingPayment) {
          return NextResponse.json({ received: true, duplicate: true })
        }

        const plan = await getPlanByName(planName as 'pro' | 'business')
        if (!plan) throw new Error(`Plan not found: ${planName}`)

        const existing = await getActiveSubscriptionByOrgId(orgId)
        if (existing) await cancelSubscription(existing.id)

        const now = new Date()
        const yearFromNow = new Date(now)
        yearFromNow.setFullYear(yearFromNow.getFullYear() + 1)

        const subscription = await createSubscription({
          org_id: orgId,
          plan_id: plan.id,
          status: 'active',
          billing_period: 'yearly',
          payment_method: 'crypto',
          current_period_start: now.toISOString(),
          current_period_end: yearFromNow.toISOString(),
        })

        await createPayment({
          subscription_id: subscription.id,
          org_id: orgId,
          amount: attempt.amount_cents,
          currency: 'usd',
          payment_method: 'crypto',
          status: 'succeeded',
          provider: 'nowpayments',
          provider_payment_id: paymentId,
          transaction_hash: body.transaction_hash ? String(body.transaction_hash) : undefined,
        })

        void syncSubscription({
          tenant_id: orgId,
          tenant_name: orgId,
          plan_name: planName,
          status: 'active',
          billing_period: 'yearly',
          current_period_start: now.toISOString(),
          current_period_end: yearFromNow.toISOString(),
          provider: 'nowpayments',
          provider_payment_id: paymentId,
        })
        break
      }

      case 'partially_paid': {
        ErrorService.captureException(
          new Error(`Partial payment received for checkout ${attempt.id}`),
          {
            severity: 'warning',
            context: { orgId, planName, paymentId, paymentStatus, body },
            tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
          },
        )
        await updateCheckoutAttemptStatus(attempt.id, 'partial')
        break
      }

      case 'expired': {
        await updateCheckoutAttemptStatus(attempt.id, 'expired')
        break
      }

      case 'failed':
      case 'refunded': {
        await updateCheckoutAttemptStatus(attempt.id, 'failed')
        break
      }

      default: {
        break
      }
    }
  } catch (handlerError) {
    ErrorService.captureException(handlerError, {
      severity: 'fatal',
      context: { endpoint: '/api/webhooks/nowpayments', paymentId, paymentStatus, orgId, planName },
      tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
    })

    // CRITICAL: do NOT record the webhook as processed on handler failure.
    // If we did, NOWPayments' retry for the same (payment_id, payment_status)
    // would be deduped and silently dropped — a transient DB blip on the
    // terminal `finished` event would permanently suppress subscription
    // creation. We return 500 so NOWPayments retries; only the success path
    // records the dedupe marker.
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }

  try {
    await recordWebhookEvent('nowpayments', paymentId, paymentStatus)
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ received: true })
}
