import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getUserId } from '@/lib/auth/server-utils'
import { getLaunchedAgentById } from '@/lib/db'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' })
  : null

/**
 * POST /api/launchpad/payment-intent
 * Create a Stripe Payment Intent for one-time agent usage (fiat rail).
 *
 * Body: { launched_agent_id: string }
 * Returns: { clientSecret: string, paymentIntentId: string, amountUsdc: number }
 */
export const POST = withCSRF(async (req: NextRequest) => {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe not configured (STRIPE_SECRET_KEY missing)' },
      { status: 503 },
    )
  }

  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { launched_agent_id } = body

    if (!launched_agent_id) {
      return NextResponse.json({ error: 'launched_agent_id required' }, { status: 400 })
    }

    const agent = await getLaunchedAgentById(launched_agent_id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    if (agent.status !== 'trading') {
      return NextResponse.json({ error: 'Agent is not active' }, { status: 400 })
    }

    const amountUsdc = Number(agent.price_per_request)
    const amountCents = Math.max(50, Math.round(amountUsdc * 100)) // Stripe minimum is $0.50

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        type: 'agent_usage',
        launched_agent_id: agent.id,
        agent_slug: agent.slug,
        user_id: userId,
        price_per_request: amountUsdc.toString(),
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountUsdc,
      amountCents,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/payment-intent', method: 'POST' },
      tags: { layer: 'api', route: 'launchpad-payment-intent' },
    })
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 })
  }
})
