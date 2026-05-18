import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgSubscription } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/checkout/stripe
 * Create Stripe checkout session
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
    
    // TODO: Initialize Stripe
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    
    // Get plan pricing
    const prices = {
      starter: {
        monthly: 2900, // $29.00
        yearly: 28800, // $288.00
      },
      pro: {
        monthly: 9900, // $99.00
        yearly: 94800, // $948.00
      },
      business: {
        monthly: 29900, // $299.00 starting price
        yearly: null, // annual via sales
      },
      enterprise: {
        monthly: null, // Sales-led
        yearly: null,
      }
    }
    
    const price = prices[plan_name as keyof typeof prices][billing_period as 'monthly' | 'yearly']
    
    if (!price) {
      return NextResponse.json(
        { error: 'This plan requires contacting sales' },
        { status: 400 }
      )
    }
    
    // TODO: Create Stripe checkout session
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   payment_method_types: ['card'],
    //   line_items: [
    //     {
    //       price_data: {
    //         currency: 'usd',
    //         product_data: {
    //           name: `${plan_name} Plan`,
    //           description: `${billing_period} billing`,
    //         },
    //         unit_amount: price,
    //         recurring: {
    //           interval: billing_period === 'monthly' ? 'month' : 'year',
    //         },
    //       },
    //       quantity: 1,
    //     },
    //   ],
    //   success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings/billing?success=true`,
    //   cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings/billing?canceled=true`,
    //   metadata: {
    //     org_id,
    //     user_id: userId,
    //     plan_name,
    //     billing_period,
    //   },
    // })
    
    // For now, return mock session
    return NextResponse.json({
      sessionId: 'mock_session_id',
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings/billing?mock=true`,
      message: 'Stripe integration pending - add STRIPE_SECRET_KEY to .env'
    })
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/checkout/stripe/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
