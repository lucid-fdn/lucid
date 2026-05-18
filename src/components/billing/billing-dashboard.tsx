'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UsageMeter } from './usage-meter'
import { PricingTable } from './pricing-table'
import { PaymentMethodModal } from './payment-method-modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreditCard, Coins, TrendingUp, Calendar, AlertCircle, ArrowUp } from 'lucide-react'
import { ErrorService } from '@/lib/errors/error-service'
import { PLAN_PRICES, PLAN_DISPLAY_NAMES } from '@/lib/pricing/plans'
import { useEntitlementStatus } from '@/hooks/use-entitlement-status'
import { getEntitlementDisplay } from '@/lib/entitlements/registry'

interface WorkspaceWithBilling {
  org: { id: string }
  subscription?: {
    plan_name: string
    plan_display_name: string
    status: string
    current_period_end?: string
  } | null
}

interface BillingDashboardProps {
  workspace: WorkspaceWithBilling
  /** Pre-selected plan from upgrade deep-link (e.g. from ChatLimitCard) */
  upgradePlan?: string
}

export function BillingDashboard({ workspace, upgradePlan }: BillingDashboardProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'business'>('pro')
  const [availableProviders, setAvailableProviders] = useState<string[]>([])
  const pricingRef = useRef<HTMLDivElement>(null)

  const subscription = workspace.subscription
  const orgId = workspace.org.id

  // Entitlement-based usage data (server-computed thresholds)
  const { data: entitlementData, isLoading: entitlementLoading } = useEntitlementStatus({ orgId })

  // Auto-scroll to pricing section when redirected from upgrade flow
  useEffect(() => {
    if (upgradePlan && pricingRef.current) {
      pricingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [upgradePlan])

  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch('/api/payment-providers')
        if (res.ok) {
          const data = await res.json()
          setAvailableProviders(data.providers ?? [])
        }
      } catch (error) {
        ErrorService.captureException(error, { context: { component: 'billing-dashboard', action: 'fetchProviders' } })
      }
    }

    fetchProviders()
  }, [])
  
  const goToCheckout = async (plan: 'starter' | 'pro' | 'business', provider: 'stripe' | 'nowpayments' = 'stripe') => {
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: plan,
          billingPeriod: billingPeriod,
          provider,
          cancelUrl: `${window.location.origin}/dashboard`,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        ErrorService.captureException(new Error(data.error || 'Checkout failed'), { context: { component: 'billing-dashboard', action: 'checkout' } })
        alert(data.error || 'Failed to create checkout session. Please try again.')
        return
      }

      if (data.url) {
        window.location.href = data.url
      } else {
        ErrorService.captureException(new Error('No checkout URL returned'), { context: { component: 'billing-dashboard', action: 'checkout' } })
        alert('Failed to create checkout session. Please try again.')
      }
    } catch (error) {
      ErrorService.captureException(error, { context: { component: 'billing-dashboard', action: 'checkout' } })
      alert('Something went wrong. Please try again.')
    }
  }

  const handleUpgrade = async (plan: 'starter' | 'pro' | 'business' = 'pro', provider?: 'stripe' | 'nowpayments') => {
    // Handle business - contact sales
    if (plan === 'business') {
      window.location.href = '/contact'
      return
    }

    // If provider is explicitly given, go directly to checkout
    if (provider) {
      await goToCheckout(plan, provider)
      return
    }

    // If yearly and crypto is available, show payment method modal
    if (billingPeriod === 'yearly' && availableProviders.includes('nowpayments')) {
      setSelectedPlan(plan)
      setShowPaymentModal(true)
      return
    }

    // Default: go directly to Stripe
    await goToCheckout(plan, 'stripe')
  }
  
  const handleManageSubscription = async () => {
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Failed to open subscription management.')
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      ErrorService.captureException(error, {
        context: { component: 'billing-dashboard', action: 'manageSubscription' },
      })
      alert('Something went wrong. Please try again.')
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Upgrade Banner — shown when redirected from entitlement deny */}
      {upgradePlan && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
          <ArrowUp className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Upgrade recommended
            </p>
            <p className="text-xs text-muted-foreground">
              You&apos;ve reached a usage limit. Upgrade to {PLAN_DISPLAY_NAMES[upgradePlan as keyof typeof PLAN_DISPLAY_NAMES] || upgradePlan} for higher limits.
            </p>
          </div>
          <Button size="sm" onClick={() => handleUpgrade(upgradePlan as 'pro' | 'business')}>
            Upgrade Now
          </Button>
        </div>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                {subscription ? 'Manage your subscription and billing' : 'You are on the free plan'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={subscription?.status === 'active' ? 'default' : 'secondary'}>
                {subscription?.plan_name
                  ? PLAN_DISPLAY_NAMES[subscription.plan_name as keyof typeof PLAN_DISPLAY_NAMES]
                  : 'Free'}
              </Badge>
              {availableProviders.includes('nowpayments') && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Coins className="h-3 w-3" />
                  Crypto available
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Plan Details */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-2xl font-bold capitalize">
                  {subscription?.status || 'Active'}
                </p>
              </div>
              
              {/* Only show billing date for paid plans */}
              {subscription?.current_period_end && (
                <div>
                  <p className="text-sm font-medium">Next Billing Date</p>
                  <p className="text-2xl font-bold">
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              )}
              
              {/* Show upgrade message for free plan */}
              {!subscription && (
                <div>
                  <p className="text-sm font-medium">Upgrade Available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Unlock more headroom with Starter, Growth, or Scale
                  </p>
                </div>
              )}
            </div>
            
            {/* Billing Period Toggle */}
            <div className="flex items-center gap-2 pt-2">
              <span className={`text-sm ${billingPeriod === 'monthly' ? 'font-medium' : 'text-muted-foreground'}`}>Monthly</span>
              <button
                type="button"
                role="switch"
                aria-checked={billingPeriod === 'yearly'}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${billingPeriod === 'yearly' ? 'bg-primary' : 'bg-muted'}`}
                onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${billingPeriod === 'yearly' ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className={`text-sm ${billingPeriod === 'yearly' ? 'font-medium' : 'text-muted-foreground'}`}>Yearly</span>
              {billingPeriod === 'yearly' && (
                <Badge variant="secondary" className="text-xs">Save ~17%</Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              {!subscription ? (
                <Button onClick={() => handleUpgrade('starter')} size="lg">
                  Get Starter
                </Button>
              ) : (
                <>
                  <Button onClick={handleManageSubscription} variant="outline">
                    Manage Subscription
                  </Button>
                  <Button onClick={() => handleUpgrade()} variant="outline">
                    Change Plan
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* All Plans Comparison - Notion Style */}
      <div ref={pricingRef} />
      <PricingTable
        currentPlan={subscription?.plan_name as 'starter' | 'pro' | 'business' | undefined}
        billingPeriod={billingPeriod}
        cryptoAvailable={availableProviders.includes('nowpayments')}
        onUpgrade={(plan) => {
          handleUpgrade(plan)
        }}
      />
      
      {/* Usage Overview — powered by entitlement status (server-computed thresholds) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Usage Overview
          </CardTitle>
          <CardDescription>
            {entitlementData
              ? `Current usage on ${entitlementData.planDisplayName} plan`
              : 'Current usage for this billing period'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entitlementLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading usage data...
            </div>
          ) : entitlementData?.items.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {entitlementData.items.map((item) => {
                const display = getEntitlementDisplay(item.metric)
                const unitMap: Record<string, string> = {
                  ai_queries_monthly: 'queries',
                  api_calls_monthly: 'calls',
                  storage_gb: 'GB',
                }
                return (
                  <UsageMeter
                    key={item.metric}
                    title={display.label}
                    description={item.kind === 'quota' ? 'Monthly limit' : undefined}
                    current={item.current}
                    limit={item.max}
                    unit={unitMap[item.metric] || 'units'}
                    isUnlimited={item.isUnlimited}
                    showUpgradePrompt={true}
                    onUpgrade={() => handleUpgrade()}
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No usage data available</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Billing History
          </CardTitle>
          <CardDescription>
            View your past invoices and payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>
            
            <TabsContent value="invoices" className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                <p>No invoices yet</p>
                <p className="text-sm mt-1">
                  Invoices will appear here after your first payment
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="payments" className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                <p>No payments yet</p>
                <p className="text-sm mt-1">
                  Payment history will appear here
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Payment Method Modal (card vs crypto) */}
      <PaymentMethodModal
        open={showPaymentModal}
        onOpenChange={setShowPaymentModal}
        onSelect={async (provider) => {
          setShowPaymentModal(false)
          await goToCheckout(selectedPlan, provider)
        }}
        planName={PLAN_DISPLAY_NAMES[selectedPlan]}
        yearlyPrice={`$${PLAN_PRICES[selectedPlan].yearly}`}
      />
    </div>
  )
}
