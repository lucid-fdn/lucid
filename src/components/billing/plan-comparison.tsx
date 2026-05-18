'use client'

import { useState } from 'react'
import { PlanCard, PlanFeature } from './plan-card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/auth-context'
import { storePendingUpgrade } from '@/lib/upgrade-flow'
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context'
import { PLAN_FEATURE_SECTIONS } from '@/lib/pricing/plans'
import { summarizeError } from '@/lib/logging/safe-log'

export interface Plan {
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

export interface PlanComparisonProps {
  plans: Plan[]
  currentPlan?: 'starter' | 'pro' | 'business'
  onSelectPlan?: (planName: string, billingPeriod: 'monthly' | 'yearly') => void
  showCrypto?: boolean
  className?: string
}

/**
 * PlanComparison - Display multiple pricing plans side-by-side
 * 
 * Features:
 * - Monthly/Yearly toggle
 * - Highlights current plan
 * - Responsive grid layout
 * - Reuses PlanCard component
 * 
 * @example
 * ```tsx
 * <PlanComparison
 *   plans={plans}
 *   currentPlan="free"
 *   onSelectPlan={(plan, period) => handleUpgrade(plan, period)}
 * />
 * ```
 */
export function PlanComparison({
  plans,
  currentPlan,
  onSelectPlan,
  showCrypto = false,
  className,
}: PlanComparisonProps) {
  const { isAuthenticated: authenticated } = useAuth()
  const flags = useResolvedFeatureFlags()
  
  // Determine available billing periods based on feature flags
  const hasMonthly = flags.monthlySubscriptions
  const hasYearly = flags.yearlySubscriptions
  const showToggle = flags.billingPeriodToggle && hasMonthly && hasYearly
  
  // Default to available period
  const defaultPeriod = hasMonthly ? 'monthly' : hasYearly ? 'yearly' : 'monthly'
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(defaultPeriod)
  
  if (process.env.NEXT_PUBLIC_DEBUG_PRICING === 'true') {
    console.debug('[PlanComparison] Props:', {
      authenticated,
      currentPlan,
      plansCount: plans.length,
      planNames: plans.map(p => p.name),
      featureFlags: {
        hasMonthly,
        hasYearly,
        showToggle
      }
    })
  }
  
  // Convert plan data to PlanCard features format
  const getPlanFeatures = (plan: Plan): PlanFeature[] => {
    const sections = PLAN_FEATURE_SECTIONS.slice(0, 2)

    return sections.flatMap((section) =>
      section.features.map((feature) => {
        const value = feature[plan.name]
        return {
          name: feature.name,
          included: value !== false,
          limit: typeof value === 'boolean' ? undefined : value,
        }
      }),
    )
  }
  
  return (
    <div className={className}>
      {/* Billing Period Toggle - Only show if both periods enabled */}
      {showToggle && (
        <div className="flex justify-center mb-8">
          <Tabs value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as 'monthly' | 'yearly')}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              {hasMonthly && (
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              )}
              {hasYearly && (
                <TabsTrigger value="yearly">
                  Yearly
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                    Best value
                  </span>
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        </div>
      )}
      
      {/* Plans Grid */}
      <div className="grid gap-8 lg:grid-cols-3 lg:gap-6 max-w-7xl mx-auto">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            name={plan.name}
            displayName={plan.display_name}
            description={plan.description}
            priceMonthly={plan.price_monthly_usd}
            priceYearly={plan.price_yearly_usd}
            features={getPlanFeatures(plan)}
            isFeatured={plan.is_featured}
            isCurrentPlan={currentPlan === plan.name}
            billingPeriod={billingPeriod}
            onSelect={async () => {
              if (onSelectPlan) {
                onSelectPlan(plan.name, billingPeriod)
              } else {
                // Industry-standard: Direct Stripe Checkout (supports card + crypto!)
                if (plan.name === 'business') {
                  window.location.href = '/contact'
                } else if (authenticated) {
                  // Create Stripe Checkout session
                  // User chooses card or crypto in Stripe UI
                  try {
                    const res = await fetch('/api/create-checkout-session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        planName: plan.name,
                        billingPeriod: billingPeriod
                      })
                    })
                    
                    const data = await res.json()
                    
                    if (data.url) {
                      // Redirect to Stripe Checkout
                      // Stripe will show: Card, Bank Transfer, AND Crypto options!
                      window.location.href = data.url
                    } else {
                      console.error('Checkout redirect missing', {
                        hasUrl: Boolean(data?.url),
                        status: res.status,
                      })
                      alert('Failed to create checkout session. Please try again.')
                    }
                  } catch (error) {
                    console.error('Checkout failed:', summarizeError(error))
                    alert('Something went wrong. Please try again.')
                  }
                } else {
                  // Not logged in - store plan selection and redirect to login
                  storePendingUpgrade(plan.name, billingPeriod)
                  window.location.href = '/login'
                }
              }
            }}
            showCrypto={showCrypto}
            cryptoPriceMonthly={plan.price_monthly_crypto}
            cryptoPriceYearly={plan.price_yearly_crypto}
          />
        ))}
      </div>
    </div>
  )
}
