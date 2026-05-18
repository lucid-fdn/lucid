import type { PaymentProvider, CheckoutParams, CheckoutResult } from './types'
import {
  createCheckoutAttempt,
  updateCheckoutAttemptStatus,
  expireStaleCheckoutAttempts,
} from '@/lib/db/checkout-attempts'
import { getPlanByName } from '@/lib/db'

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1'
const CHECKOUT_EXPIRY_MS = 2 * 60 * 60 * 1000 // 2 hours
const FETCH_TIMEOUT_MS = 10_000 // 10 seconds

export class NOWPaymentsProvider implements PaymentProvider {
  id = 'nowpayments' as const
  private apiKey: string

  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY!
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { orgId, userId, planName, billingPeriod, successUrl } = params

    // Opportunistic cleanup of stale attempts (non-blocking)
    await expireStaleCheckoutAttempts().catch(() => {})

    // Fetch price from plans table (single source of truth)
    // DB columns are price_monthly_usd / price_yearly_usd (stored in cents despite name)
    const plan = await getPlanByName(planName)
    if (!plan) throw new Error(`Plan not found: ${planName}`)

    const amountCents = billingPeriod === 'yearly'
      ? (plan.price_yearly_usd ?? plan.price_monthly_usd * 12)
      : plan.price_monthly_usd
    const amountUsd = amountCents / 100

    // Create checkout attempt (source of truth)
    const attempt = await createCheckoutAttempt({
      org_id: orgId,
      user_id: userId,
      plan_name: planName,
      billing_period: billingPeriod,
      provider: 'nowpayments',
      amount_cents: amountCents,
      expires_at: new Date(Date.now() + CHECKOUT_EXPIRY_MS).toISOString(),
    })

    // Call NOWPayments Invoice API
    let invoiceData: { id: string; invoice_url: string }
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      const res = await fetch(`${NOWPAYMENTS_API}/invoice`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: amountUsd,
          price_currency: 'usd',
          order_id: attempt.id,
          order_description: `Lucid ${planName.charAt(0).toUpperCase() + planName.slice(1)} — Yearly Subscription`,
          success_url: `${successUrl}?session_id=${attempt.id}&provider=nowpayments`,
          ipn_callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/nowpayments`,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`NOWPayments API returned ${res.status}: ${body}`)
      }

      invoiceData = await res.json()
    } catch (err) {
      const { ErrorService } = await import('@/lib/errors/error-service')
      ErrorService.captureException(err, {
        severity: 'error',
        context: { attemptId: attempt.id },
        tags: { layer: 'payments', provider: 'nowpayments' },
      })
      await updateCheckoutAttemptStatus(attempt.id, 'failed')
      throw new Error('Crypto checkout is temporarily unavailable, please try card payment')
    }

    // Update attempt with provider invoice ID
    await updateCheckoutAttemptStatus(attempt.id, 'pending', {
      provider_invoice_id: invoiceData.id,
    })

    return {
      url: invoiceData.invoice_url,
      sessionId: invoiceData.id,
      provider: 'nowpayments',
    }
  }
}
