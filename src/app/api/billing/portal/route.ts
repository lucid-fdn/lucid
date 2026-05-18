/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session for subscription management.
 */

import 'server-only'
import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { getServerAuth } from '@/lib/auth/server-utils'
import { isUserOrgMember, getActiveSubscriptionByOrgId } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key, { apiVersion: '2025-10-29.clover' })
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await getServerAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = await request.json()
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(auth.userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subscription = await getActiveSubscriptionByOrgId(orgId)

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found. Please subscribe first.' },
        { status: 404 }
      )
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/settings/billing`

    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/billing/portal', method: 'POST' },
      tags: { layer: 'api', route: 'billing-portal' },
    })

    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
