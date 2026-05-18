import { NextRequest, NextResponse } from 'next/server'
import { requireUserId, requireOrgContext } from '@/lib/auth/server-utils'
import { ensureProviders, getProvider } from '@/lib/payments'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId()
    const orgId = await requireOrgContext()

    const body = await req.json()
    const { planName, billingPeriod, provider = 'stripe', cancelUrl } = body

    // Validate input
    if (!planName || !billingPeriod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!['starter', 'pro', 'business'].includes(planName)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return NextResponse.json({ error: 'Invalid billing period' }, { status: 400 })
    }
    if (!['stripe', 'nowpayments'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Crypto is yearly-only
    if (provider === 'nowpayments' && billingPeriod !== 'yearly') {
      return NextResponse.json(
        { error: 'Crypto payments are available for yearly plans only' },
        { status: 400 },
      )
    }

    // Initialize providers and delegate
    await ensureProviders()

    const paymentProvider = getProvider(provider)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const result = await paymentProvider.createCheckout({
      orgId,
      userId,
      planName,
      billingPeriod,
      successUrl: `${appUrl}/settings/billing`,
      cancelUrl: cancelUrl || `${appUrl}/pricing`,
    })

    return NextResponse.json(result)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/create-checkout-session' },
      tags: { layer: 'api', route: 'create-checkout-session' },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
