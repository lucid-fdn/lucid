import Stripe from 'stripe'
import type { PaymentProvider, CheckoutParams, CheckoutResult } from './types'
import { ErrorService } from '@/lib/errors/error-service'
import { getPlanByName } from '@/lib/db'

export class StripeProvider implements PaymentProvider {
  id = 'stripe' as const
  private stripe: Stripe

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-10-29.clover',
    })
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { orgId, userId, planName, billingPeriod, successUrl, cancelUrl } = params

    const plan = await getPlanByName(planName)
    if (!plan) {
      throw new Error(`Plan not found: ${planName}`)
    }

    const priceId = (billingPeriod === 'monthly'
      ? plan.stripe_price_monthly_id
      : plan.stripe_price_yearly_id) as string | undefined

    if (!priceId) {
      throw new Error(`Stripe price not configured for ${planName} ${billingPeriod}`)
    }

    const stripeSuccessUrl = `${successUrl}?session_id={CHECKOUT_SESSION_ID}&provider=stripe`

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card', 'us_bank_account'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: stripeSuccessUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        metadata: {
          user_id: userId,
          org_id: orgId,
          plan_id: String(plan.id || ''),
          plan_name: planName,
          billing_period: billingPeriod,
        },
        subscription_data: {
          metadata: {
            org_id: orgId,
            plan_name: planName,
            billing_period: billingPeriod,
          },
        },
      })

      return {
        url: session.url!,
        sessionId: session.id,
        provider: 'stripe',
      }
    } catch (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: {
          userId,
          orgId,
          planName,
          billingPeriod,
          layer: 'stripe-provider',
        },
        tags: {
          layer: 'payments',
          provider: 'stripe',
        },
      })
      throw error
    }
  }
}
