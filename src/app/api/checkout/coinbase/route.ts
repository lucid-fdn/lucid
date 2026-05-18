import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgSubscription } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/checkout/coinbase
 * Create Coinbase Commerce checkout
 * 
 * Body:
 * - org_id: Organization ID
 * - plan_name: 'starter' | 'pro' | 'business'
 * - billing_period: 'monthly' | 'yearly'
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const body = await request.json()
    const { org_id, plan_name, billing_period } = body
    
    if (!org_id || !plan_name || !billing_period) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Validate plan
    if (!['starter', 'pro', 'business'].includes(plan_name)) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      )
    }
    
    // Check if already has active subscription
    const currentSub = await getOrgSubscription(org_id)
    if (currentSub && currentSub.status === 'active' && currentSub.plan_name === plan_name) {
      return NextResponse.json(
        { error: 'Already subscribed to this plan' },
        { status: 400 }
      )
    }
    
    // Crypto pricing (in USDC)
    const cryptoPrices = {
      starter: {
        monthly: '29',
        yearly: '288',
      },
      pro: {
        monthly: '99',
        yearly: '948',
      },
      business: {
        monthly: '299',
        yearly: null,
      },
      enterprise: {
        monthly: null,
        yearly: null,
      }
    }
    
    const price = cryptoPrices[plan_name as keyof typeof cryptoPrices][billing_period as 'monthly' | 'yearly']
    
    if (!price) {
      return NextResponse.json(
        { error: 'This plan requires contacting sales' },
        { status: 400 }
      )
    }
    
    // TODO: Initialize Coinbase Commerce
    // const coinbase = new CoinbaseCommerce({
    //   apiKey: process.env.COINBASE_API_KEY!,
    // })
    
    // TODO: Create charge
    // const charge = await coinbase.charges.create({
    //   name: `${plan_name} Plan`,
    //   description: `${billing_period} subscription`,
    //   pricing_type: 'fixed_price',
    //   local_price: {
    //     amount: price,
    //     currency: 'USD',
    //   },
    //   metadata: {
    //     org_id,
    //     user_id: userId,
    //     plan_name,
    //     billing_period,
    //   },
    //   redirect_url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings/billing?success=true`,
    //   cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings/billing?canceled=true`,
    // })
    
    // For now, return mock charge
    return NextResponse.json({
      chargeId: 'mock_charge_id',
      hostedUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/settings/billing?mock=true`,
      message: 'Coinbase Commerce integration pending - add COINBASE_API_KEY to .env',
      price: `${price} USDC`
    })
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/checkout/coinbase/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to create crypto checkout' },
      { status: 500 }
    )
  }
}
