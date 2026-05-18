import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getActiveSubscriptionByOrgId,
  isWebhookEventProcessed,
  recordWebhookEvent,
  getPlanByName,
  recordUsage,
  getLaunchedAgentById,
  incrementAgentStats,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { syncSubscription } from '@/lib/control-plane/client'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key, { apiVersion: '2025-10-29.clover' })
}

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events with signature verification and idempotency.
 *
 * Events handled:
 * - checkout.session.completed
 * - customer.subscription.created (safety net for API/Dashboard-created subs)
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_failed
 * - invoice.paid
 * - payment_intent.succeeded (launchpad agent usage)
 */
export async function POST(request: NextRequest) {
  // Returns 200 on success, 500 on handler failure (so Stripe retries).
  // Errors are logged via ErrorService.
  let event: Stripe.Event

  try {
    const rawBody = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      ErrorService.captureException(new Error('STRIPE_WEBHOOK_SECRET is not configured'), {
        severity: 'fatal',
        context: { endpoint: '/api/webhooks/stripe' },
        tags: { layer: 'api', route: 'webhooks/stripe' },
      })
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    // Verify signature -- throws on invalid signature
    event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/stripe', step: 'signature_verification' },
      tags: { layer: 'api', route: 'webhooks/stripe' },
    })
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  // Idempotency: skip if already processed
  try {
    const alreadyProcessed = await isWebhookEventProcessed('stripe', event.id, event.type)
    if (alreadyProcessed) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch {
    // If idempotency check fails, continue processing -- better to double-process than miss
  }

  // Handle events -- failures return 500 so Stripe retries.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
    }
    // Only record if handler succeeded -- failed events must NOT be recorded
    // so Stripe can retry delivery
    try {
      await recordWebhookEvent('stripe', event.id, event.type)
    } catch {
      // Non-fatal -- next retry will re-process but that's safe
    }
  } catch (handlerError) {
    // Log but don't record -- Stripe will retry on non-200 response
    ErrorService.captureException(handlerError, {
      severity: 'error',
      context: {
        endpoint: '/api/webhooks/stripe',
        eventType: event.type,
        eventId: event.id,
      },
      tags: { layer: 'api', route: 'webhooks/stripe' },
    })
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Extract period dates from a Stripe subscription.
 * In the 2025 API (clover), current_period_start/end moved to SubscriptionItem.
 */
function extractPeriodDates(sub: Stripe.Subscription): { periodStart: string; periodEnd: string } {
  const firstItem = sub.items?.data?.[0]
  if (firstItem) {
    return {
      periodStart: new Date(firstItem.current_period_start * 1000).toISOString(),
      periodEnd: new Date(firstItem.current_period_end * 1000).toISOString(),
    }
  }
  // Fallback: use start_date + interval based on billing period
  const start = new Date(sub.start_date * 1000)
  const end = new Date(start)
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval
  if (interval === 'year') {
    end.setFullYear(end.getFullYear() + 1)
  } else {
    end.setMonth(end.getMonth() + 1)
  }
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  }
}

/**
 * Extract the Stripe subscription ID from an invoice.
 * In the 2025 API (clover), invoice.subscription is replaced by invoice.parent.subscription_details.
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const subDetails = invoice.parent?.subscription_details
  if (!subDetails) return null
  const sub = subDetails.subscription
  return typeof sub === 'string' ? sub : sub?.id ?? null
}

/**
 * Handle subscriptions created outside Checkout (API, Dashboard, etc.).
 * Safety net so subscriptions always land in our DB regardless of creation path.
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata ?? {}
  const { org_id, plan_name } = metadata
  const billingPeriod = metadata.billing_period as 'monthly' | 'yearly' | undefined

  if (!org_id || !plan_name || !billingPeriod) {
    // No metadata = not created through our system, skip silently
    return
  }

  // Check if we already have a subscription for this org (checkout flow may have beaten us)
  const existingSub = await getActiveSubscriptionByOrgId(org_id)
  if (existingSub?.stripe_subscription_id === subscription.id) {
    return // Already processed via checkout.session.completed
  }

  const plan = await getPlanByName(plan_name as 'starter' | 'pro' | 'business')
  if (!plan) {
    throw new Error(`Plan not found for name: ${plan_name}`)
  }

  // Cancel old subscription if exists
  if (existingSub) {
    await cancelSubscription(existingSub.id)
  }

  const { periodStart, periodEnd } = extractPeriodDates(subscription)

  await createSubscription({
    org_id,
    plan_id: plan.id,
    billing_period: billingPeriod,
    payment_method: 'stripe_card',
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id ?? undefined,
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    current_period_start: periodStart,
    current_period_end: periodEnd,
  })

  // Sync to control-plane (fire-and-forget)
  void syncSubscription({
    tenant_id: org_id,
    tenant_name: org_id,
    plan_name,
    status: mapStripeStatus(subscription.status),
    stripe_subscription_id: subscription.id,
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id,
    billing_period: billingPeriod,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {}
  const { org_id, plan_name } = metadata
  const billingPeriod = metadata.billing_period as 'monthly' | 'yearly' | undefined

  if (!org_id || !plan_name || !billingPeriod) {
    throw new Error(
      `checkout.session.completed missing metadata: org_id=${org_id}, plan_name=${plan_name}, billing_period=${billingPeriod}`
    )
  }

  // Look up plan by name to get the plan_id
  const plan = await getPlanByName(plan_name as 'starter' | 'pro' | 'business')
  if (!plan) {
    throw new Error(`Plan not found for name: ${plan_name}`)
  }

  // Check for existing subscription -- cancel old one if it exists
  const existingSub = await getActiveSubscriptionByOrgId(org_id)
  if (existingSub) {
    await cancelSubscription(existingSub.id)
  }

  // Get period dates from the Stripe subscription object (not manual calculation)
  let periodStart: string
  let periodEnd: string

  if (session.subscription) {
    const stripeSubscription = await getStripe().subscriptions.retrieve(
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    )
    const dates = extractPeriodDates(stripeSubscription)
    periodStart = dates.periodStart
    periodEnd = dates.periodEnd
  } else {
    // Fallback if no subscription object (shouldn't happen for subscription mode)
    const now = new Date()
    periodStart = now.toISOString()
    const end = new Date(now)
    end.setMonth(end.getMonth() + (billingPeriod === 'yearly' ? 12 : 1))
    periodEnd = end.toISOString()
  }

  await createSubscription({
    org_id,
    plan_id: plan.id,
    billing_period: billingPeriod,
    payment_method: 'stripe_card',
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? undefined,
    stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? undefined,
    status: 'active',
    current_period_start: periodStart,
    current_period_end: periodEnd,
  })

  // Sync to control-plane (fire-and-forget — never blocks webhook response)
  void syncSubscription({
    tenant_id: org_id,
    tenant_name: org_id,
    plan_name,
    status: 'active',
    stripe_subscription_id:
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id,
    stripe_customer_id:
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id,
    billing_period: billingPeriod,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  })
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata ?? {}
  const orgId = metadata.org_id

  if (!orgId) {
    ErrorService.captureException(
      new Error(`subscription.updated missing org_id in metadata, stripe_sub=${subscription.id}`),
      {
        severity: 'warning',
        context: { stripeSubscriptionId: subscription.id },
        tags: { layer: 'api', route: 'webhooks/stripe' },
      }
    )
    return
  }

  const existingSub = await getActiveSubscriptionByOrgId(orgId)
  if (!existingSub) {
    ErrorService.captureException(
      new Error(`No active subscription found for org_id=${orgId} during subscription.updated`),
      {
        severity: 'warning',
        context: { orgId, stripeSubscriptionId: subscription.id },
        tags: { layer: 'api', route: 'webhooks/stripe' },
      }
    )
    return
  }

  const { periodStart, periodEnd } = extractPeriodDates(subscription)

  await updateSubscription(existingSub.id, {
    status: mapStripeStatus(subscription.status),
    current_period_start: periodStart,
    current_period_end: periodEnd,
  })

  // Sync to control-plane (fire-and-forget — never blocks webhook response)
  void syncSubscription({
    tenant_id: orgId,
    tenant_name: orgId,
    plan_name: subscription.metadata?.plan_name ?? 'unknown',
    status: mapStripeStatus(subscription.status),
    stripe_subscription_id: subscription.id,
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  })
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata ?? {}
  const orgId = metadata.org_id

  if (!orgId) {
    ErrorService.captureException(
      new Error(`subscription.deleted missing org_id in metadata, stripe_sub=${subscription.id}`),
      {
        severity: 'warning',
        context: { stripeSubscriptionId: subscription.id },
        tags: { layer: 'api', route: 'webhooks/stripe' },
      }
    )
    return
  }

  const existingSub = await getActiveSubscriptionByOrgId(orgId)
  if (!existingSub) {
    return // Already canceled or not found -- nothing to do
  }

  await updateSubscription(existingSub.id, {
    status: 'canceled',
    canceled_at: new Date().toISOString(),
  })

  // Sync to control-plane (fire-and-forget — never blocks webhook response)
  void syncSubscription({
    tenant_id: orgId,
    tenant_name: orgId,
    plan_name: 'starter',
    status: 'canceled',
    stripe_subscription_id: subscription.id,
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id,
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice)
  if (!subscriptionId) return

  // Retrieve the Stripe subscription to get org_id from metadata
  const stripeSubscription = await getStripe().subscriptions.retrieve(subscriptionId)
  const orgId = stripeSubscription.metadata?.org_id

  if (!orgId) {
    ErrorService.captureException(
      new Error(`invoice.payment_failed: no org_id in subscription metadata, stripe_sub=${subscriptionId}`),
      {
        severity: 'warning',
        context: { stripeSubscriptionId: subscriptionId, invoiceId: invoice.id },
        tags: { layer: 'api', route: 'webhooks/stripe' },
      }
    )
    return
  }

  const existingSub = await getActiveSubscriptionByOrgId(orgId)
  if (!existingSub) return

  await updateSubscription(existingSub.id, {
    status: 'past_due',
  })
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice)
  if (!subscriptionId) return

  // Retrieve the Stripe subscription to get org_id and period dates
  const stripeSubscription = await getStripe().subscriptions.retrieve(subscriptionId)
  const orgId = stripeSubscription.metadata?.org_id

  if (!orgId) return

  const existingSub = await getActiveSubscriptionByOrgId(orgId)
  if (!existingSub) return

  // Re-activate if it was past_due or trialing and payment succeeded
  if (existingSub.status === 'past_due' || existingSub.status === 'trialing') {
    const { periodStart, periodEnd } = extractPeriodDates(stripeSubscription)
    await updateSubscription(existingSub.id, {
      status: 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
    })
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata ?? {}
  if (metadata.type !== 'agent_usage') return // Not a launchpad payment

  const agentId = metadata.launched_agent_id
  const userId = metadata.user_id
  const amountUsdc = Number(metadata.price_per_request || 0)

  if (!agentId || !amountUsdc) {
    ErrorService.captureException(
      new Error(`payment_intent.succeeded missing launchpad metadata: agent=${agentId}`),
      {
        severity: 'warning',
        context: { paymentIntentId: paymentIntent.id },
        tags: { layer: 'api', route: 'webhooks/stripe' },
      }
    )
    return
  }

  // Record usage in ledger
  await recordUsage({
    launched_agent_id: agentId,
    user_id: userId || undefined,
    payment_method: 'fiat',
    amount_usdc: amountUsdc,
    tokens_used: 0,
    stripe_payment_id: paymentIntent.id,
  })

  // Update denormalized stats
  await incrementAgentStats(agentId, {
    total_requests: 1,
    total_revenue_usdc: amountUsdc,
  })
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused' {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled'
    case 'paused':
      return 'paused'
    case 'incomplete':
      return 'past_due'
    default:
      return 'active'
  }
}
