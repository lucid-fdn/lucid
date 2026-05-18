import { PricingClientPage } from './pricing-client'
import { getPlans as getDbPlans } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { applyLaunchPlanPresentation } from '@/lib/pricing/plans'

interface Plan {
  id: string
  name: 'starter' | 'pro' | 'business'
  display_name: string
  description: string
  price_monthly_usd: number | null
  price_yearly_usd: number | null
  price_monthly_crypto: string | null
  price_yearly_crypto: string | null
  features: Record<string, boolean>
  limits: Record<string, number>
  is_featured: boolean
}

type DbPlan = Awaited<ReturnType<typeof getDbPlans>>[number]
type PublicPricingPlan = DbPlan & { name: Plan['name'] }

function isPublicPricingPlan(plan: DbPlan): plan is PublicPricingPlan {
  return plan.name === 'starter' || plan.name === 'pro' || plan.name === 'business'
}

async function getPlans(): Promise<Plan[]> {
  try {
    const plans = await getDbPlans()
    return plans
      .filter(isPublicPricingPlan)
      .map((plan) => applyLaunchPlanPresentation({
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
        sort_order: plan.sort_order,
      }))
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: '/pricing', operation: 'loadPlans' },
      tags: { layer: 'page', route: 'pricing' },
    })
    return []
  }
}

export default async function PricingPage() {
  // Fetch plans server-side - no loader needed!
  const plans = await getPlans()
  
  return <PricingClientPage plans={plans} />
}
