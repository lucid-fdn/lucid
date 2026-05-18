import { NextResponse } from 'next/server'
import { getPlans } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { applyLaunchPlanPresentation } from '@/lib/pricing/plans'

export const dynamic = 'force-dynamic'

/**
 * GET /api/plans
 * Get all available plans (public endpoint)
 * 
 * This endpoint is public so it can be used on pricing page
 * before user authentication
 */
export async function GET() {
  try {
    const plans = await getPlans()
    
    return NextResponse.json({ 
      plans: plans.map(plan => applyLaunchPlanPresentation({
        id: plan.id,
        name: plan.name,
        display_name: plan.display_name,
        description: plan.description,
        price_monthly_usd: plan.price_monthly_usd,
        price_yearly_usd: plan.price_yearly_usd,
        price_monthly_crypto: plan.price_monthly_crypto,
        price_yearly_crypto: plan.price_yearly_crypto,
        features: plan.features,
        limits: plan.limits,
        is_featured: plan.is_featured,
        sort_order: plan.sort_order
      }))
    })
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/plans/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    )
  }
}
