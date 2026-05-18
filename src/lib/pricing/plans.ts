/**
 * Centralized launch pricing data.
 *
 * Internal billing plan IDs stay `starter / pro / business`.
 * Public launch labels map to:
 * - starter  -> Starter
 * - pro      -> Growth
 * - business -> Scale
 *
 * Free sandbox remains the no-subscription layer.
 * Enterprise remains sales-led and is documented separately.
 */

export interface PlanFeature {
  name: string
  starter: boolean | string | number
  pro: boolean | string | number
  business: boolean | string | number
}

export interface PlanFeatureSection {
  title: string
  features: PlanFeature[]
}

export const PLAN_PRICES = {
  starter: {
    monthly: 29,
    yearly: 288,
  },
  pro: {
    monthly: 99,
    yearly: 948,
  },
  business: {
    monthly: 299,
    yearly: null,
  },
} as const

export const PLAN_DISPLAY_NAMES = {
  starter: 'Starter',
  pro: 'Growth',
  business: 'Scale',
} as const

export type CanonicalPlanName = keyof typeof PLAN_DISPLAY_NAMES

function normalizePlanName(planName: string): CanonicalPlanName | null {
  if (planName === 'starter' || planName === 'pro' || planName === 'business') {
    return planName
  }
  if (planName === 'free') return 'starter'
  if (planName === 'enterprise') return 'business'
  return null
}

export const PLAN_DESCRIPTIONS = {
  starter: 'Managed shared runtime for solo builders shipping real agents.',
  pro: 'Production shared runtime for growing teams shipping real autonomous product use.',
  business: 'Isolated runtime with stronger continuity, headroom, and sales-led onboarding.',
} as const

export const PLAN_RUNTIME_LABELS = {
  starter: 'Shared',
  pro: 'Shared',
  business: 'Dedicated runtime',
} as const

export const PLAN_FEATURE_SECTIONS: PlanFeatureSection[] = [
  {
    title: 'Highlights',
    features: [
      { name: 'Compute model', starter: 'Managed shared', pro: 'Managed shared', business: 'Isolated runtime' },
      { name: 'Persistent platform memory', starter: true, pro: true, business: true },
      { name: 'Runtime-local continuity', starter: false, pro: false, business: 'Best fit' },
      { name: 'Isolation', starter: 'Shared', pro: 'Shared', business: 'High' },
    ],
  },
  {
    title: 'Autonomy',
    features: [
      { name: 'Multi-agent teams', starter: 'Up to 3', pro: 'Up to 10', business: '10+' },
      { name: 'Background jobs and schedules', starter: 'Yes, with limits', pro: true, business: true },
      { name: 'Long-running autonomy', starter: 'Yes, with limits', pro: true, business: 'Strong' },
      { name: 'Native/runtime-local self-improvement', starter: false, pro: false, business: 'Best fit' },
    ],
  },
  {
    title: 'Operations',
    features: [
      { name: 'Mission Control', starter: 'Core', pro: 'Full', business: 'Full' },
      { name: 'Approvals and policy rails', starter: 'Basic', pro: 'Full', business: 'Full' },
      { name: 'Noisy-neighbor protection', starter: 'Low', pro: 'Medium', business: 'High' },
      { name: 'Best fit', starter: 'Solo builders', pro: 'Production shared', business: 'Heavy autonomy' },
    ],
  },
]

export function getPlanInfo(planName: 'starter' | 'pro' | 'business') {
  return {
    name: planName,
    displayName: PLAN_DISPLAY_NAMES[planName],
    description: PLAN_DESCRIPTIONS[planName],
    pricing: PLAN_PRICES[planName],
    runtimeLabel: PLAN_RUNTIME_LABELS[planName],
  }
}

export function getAllPlans() {
  return (['starter', 'pro', 'business'] as const).map((plan) => getPlanInfo(plan))
}

type LaunchPlanPresentationInput = {
  name: string
  display_name?: string | null
  description?: string | null
  price_monthly_usd?: number | null
  price_yearly_usd?: number | null
}

export function applyLaunchPlanPresentation<T extends LaunchPlanPresentationInput>(plan: T): T {
  const canonicalPlanName = normalizePlanName(plan.name)
  if (!canonicalPlanName) return plan

  const yearlyPrice = PLAN_PRICES[canonicalPlanName].yearly

  return {
    ...plan,
    display_name: PLAN_DISPLAY_NAMES[canonicalPlanName],
    description: PLAN_DESCRIPTIONS[canonicalPlanName],
    price_monthly_usd: PLAN_PRICES[canonicalPlanName].monthly * 100,
    price_yearly_usd: yearlyPrice === null ? null : yearlyPrice * 100,
  }
}
