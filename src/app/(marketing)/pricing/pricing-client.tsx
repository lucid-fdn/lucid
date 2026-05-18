'use client'

import { useEffect, useState } from 'react'
import { PlanComparison } from '@/components/billing'
import { useWorkspace } from '@/contexts/workspace-context'
import { useAuth } from '@/contexts/auth-context'
import { localStorageService } from '@/lib/storage/LocalStorageService'
import { LOCAL_STORAGE } from '@/lib/cache/config'
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

interface PricingClientPageProps {
  plans: Plan[]
}

const runtimeNarratives = [
  {
    plan: 'Starter',
    runtime: 'Shared',
    summary:
      'Managed shared compute for solo builders shipping real agents with persistent platform-managed memory and workflows.',
  },
  {
    plan: 'Growth',
    runtime: 'Shared',
    summary:
      'Production shared runtime for real autonomous product use with stronger limits, observability, and policy rails.',
  },
  {
    plan: 'Scale',
    runtime: 'Isolated runtime',
    summary:
      'An isolated runtime with stronger continuity, more headroom, and sales-led annual or custom expansion paths.',
  },
] as const

const launchPricingMatrix = [
  {
    plan: 'Starter',
    price: '$29/mo or $288/yr',
    runtime: 'Shared',
    bestFor: 'Solo builders',
  },
  {
    plan: 'Growth',
    price: '$99/mo or $948/yr',
    runtime: 'Shared',
    bestFor: 'Real production use',
  },
  {
    plan: 'Scale',
    price: '$299/mo, annual via sales',
    runtime: 'Isolated runtime',
    bestFor: 'Heavy autonomy and continuity',
  },
] as const

const capabilityMatrix = [
  {
    capability: 'Persistent memory',
    starter: 'Yes',
    pro: 'Yes',
    dedicated: 'Yes',
  },
  {
    capability: 'Long-running autonomy',
    starter: 'Yes, with limits',
    pro: 'Yes',
    dedicated: 'Strong',
  },
  {
    capability: 'Native/runtime-local continuity',
    starter: 'No',
    pro: 'No',
    dedicated: 'Best fit',
  },
  {
    capability: 'Isolation',
    starter: 'Shared',
    pro: 'Shared',
    dedicated: 'High',
  },
] as const

export function PricingClientPage({ plans }: PricingClientPageProps) {
  const { ready, isAuthenticated: authenticated } = useAuth()
  const { workspace } = useWorkspace()
  
  // 🚀 OPTIMISTIC LOADING: Use centralized cache for instant display after redirects
  const CACHE_KEY = `${LOCAL_STORAGE.PREFIX}current_plan`
  const [optimisticPlan, setOptimisticPlan] = useState<string | null>(() => {
    return localStorageService.get<string>(CACHE_KEY)
  })
  
  // ✅ CRITICAL FIX: Wait for Privy ready before using workspace
  const currentPlan = (ready && workspace?.subscription) ? workspace.subscription.plan_name : null
  
  // Update cache when we get real data
  useEffect(() => {
    if (currentPlan) {
      localStorageService.set(CACHE_KEY, currentPlan)
      setOptimisticPlan(null) // Clear optimistic once we have real data
    }
  }, [currentPlan, CACHE_KEY])
  
  // Use optimistic plan if we don't have real data yet (Stripe redirect scenario)
  const displayPlan = currentPlan || optimisticPlan
  const normalizedPlanCards = plans.map((plan) => applyLaunchPlanPresentation(plan))
  
  if (process.env.NEXT_PUBLIC_DEBUG_PRICING === 'true') {
    console.debug('[PricingClientPage] Rendering with:', {
      authenticated,
      hasWorkspace: !!workspace,
      currentPlan,
      optimisticPlan,
      displayPlan,
      plansCount: plans.length
    })
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Pricing that matches the runtime you need
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4">
            Shared plans give you real autonomous agents on managed shared compute.
            Scale gives you stronger continuity, higher headroom, and isolated runtime identity.
          </p>
          <p className="text-sm text-muted-foreground">
            Upgrade when you need more continuity and isolation, not because shared is a fake product.
          </p>
        </div>
      </section>
      
      {/* Plan Comparison */}
      <section className="pb-20 px-4">
        <PlanComparison 
          plans={normalizedPlanCards}
          currentPlan={displayPlan as 'starter' | 'pro' | 'business' | undefined}
          showCrypto={true}
        />
      </section>

      <section className="pb-20 px-4">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">
              Choose the runtime model, not just the price
            </h2>
            <p className="text-muted-foreground">
              Lucid shared plans are platform-managed and persistent. Scale adds stronger runtime-local
              continuity, better isolation, and more headroom for heavy workloads.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {runtimeNarratives.map((tier) => (
              <div key={tier.plan} className="rounded-2xl border bg-card p-6">
                <p className="text-sm font-medium text-muted-foreground">{tier.plan}</p>
                <h3 className="mt-2 text-xl font-semibold">{tier.runtime}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{tier.summary}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-left">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-sm font-semibold">Plan</th>
                  <th className="px-4 py-3 text-sm font-semibold">Price</th>
                  <th className="px-4 py-3 text-sm font-semibold">Runtime</th>
                  <th className="px-4 py-3 text-sm font-semibold">Best for</th>
                </tr>
              </thead>
              <tbody>
                {launchPricingMatrix.map((row, index) => (
                  <tr
                    key={row.plan}
                    className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{row.plan}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.price}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.runtime}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.bestFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-left">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-sm font-semibold">Capability</th>
                  <th className="px-4 py-3 text-sm font-semibold">Starter</th>
                  <th className="px-4 py-3 text-sm font-semibold">Growth</th>
                  <th className="px-4 py-3 text-sm font-semibold">Scale</th>
                </tr>
              </thead>
              <tbody>
                {capabilityMatrix.map((row, index) => (
                  <tr
                    key={row.capability}
                    className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{row.capability}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.starter}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.pro}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.dedicated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      
      {/* FAQ Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                What is the difference between shared and dedicated?
              </h3>
              <p className="text-muted-foreground">
                Shared plans run your agents on Lucid-managed shared compute with persistent platform-managed state.
                Scale gives you an isolated runtime with stronger continuity, more headroom, and more predictable
                long-running behavior.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                Can I change plans later?
              </h3>
              <p className="text-muted-foreground">
                Yes! You can upgrade or downgrade your plan at any time.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Does shared still include real autonomy?
              </h3>
              <p className="text-muted-foreground">
                Yes. Shared plans support persistent memory, background work, schedules, and multi-agent coordination.
                Scale is for stronger runtime continuity and isolation, not because shared autonomy is a demo.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                What about annual pricing for Scale?
              </h3>
              <p className="text-muted-foreground">
                Scale annual pricing is sales-led at launch. That keeps provisioning, support, and runtime sizing
                explicit while the dedicated tier is still maturing operationally.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-muted-foreground">
                We accept credit cards, PayPal, and cryptocurrency.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
