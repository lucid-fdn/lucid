'use client'

import { useState } from 'react'
import { Check, X, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/primitives/radix/tooltip'
import {
  PLAN_PRICES,
  PLAN_DISPLAY_NAMES,
  PLAN_FEATURE_SECTIONS,
} from '@/lib/pricing/plans'
import { ErrorService } from '@/lib/errors/error-service'

interface PricingTableProps {
  currentPlan?: 'starter' | 'pro' | 'business'
  onUpgrade?: (plan: 'starter' | 'pro' | 'business') => void
  billingPeriod?: 'monthly' | 'yearly'
  cryptoAvailable?: boolean
  className?: string
}

function formatPrice(price: number | null, yearly?: boolean) {
  if (price === null) return 'Custom'
  if (price === 0) return '$0'

  const monthlyPrice = yearly ? price / 12 : price
  return `$${monthlyPrice.toFixed(0)}`
}

function FeatureValue({ value }: { value: boolean | string | number }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
    ) : (
      <X className="h-5 w-5 text-muted-foreground/30" />
    )
  }

  if (typeof value === 'number') {
    return <span className="text-sm font-medium">{value}</span>
  }

  return <span className="text-sm">{value}</span>
}

export function PricingTable({
  currentPlan,
  onUpgrade,
  billingPeriod = 'monthly',
  cryptoAvailable = false,
  className,
}: PricingTableProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const isYearly = billingPeriod === 'yearly'

  const handleUpgrade = async (plan: 'starter' | 'pro' | 'business') => {
    if (onUpgrade) {
      onUpgrade(plan)
      return
    }

    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: plan,
          billingPeriod,
          provider: 'stripe',
          cancelUrl: `${window.location.origin}/dashboard`,
        }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        ErrorService.captureException(new Error('No checkout URL returned'), { context: { component: 'pricing-table', action: 'checkout' } })
        alert(data.error || 'Failed to create checkout session. Please try again.')
      }
    } catch (error) {
      ErrorService.captureException(error, { context: { component: 'pricing-table', action: 'checkout' } })
      alert('Something went wrong. Please try again.')
    }
  }

  const [highlightsSection, ...otherSections] = PLAN_FEATURE_SECTIONS

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold">All plans</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Compare all available plans and features</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Sticky Header with Plans */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="grid grid-cols-4 gap-4 py-4">
          {/* Empty cell for feature names column */}
          <div className="col-span-1" />

          {/* Plan columns */}
          {(['starter', 'pro', 'business'] as const).map((plan) => {
            const yearlyPrice = PLAN_PRICES[plan].yearly
            const activePrice = isYearly ? yearlyPrice : PLAN_PRICES[plan].monthly

            return (
              <div key={plan} className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <h4 className="font-semibold">{PLAN_DISPLAY_NAMES[plan]}</h4>
                {plan === 'pro' && (
                  <Badge variant="secondary" className="text-xs">Popular</Badge>
                )}
                {currentPlan === plan && (
                  <Badge variant="outline" className="text-xs">Current</Badge>
                )}
              </div>

              <div>
                <div className="text-2xl font-bold">
                  {formatPrice(
                    activePrice,
                    isYearly,
                  )}
                  {activePrice !== null && activePrice > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  )}
                </div>
                {isYearly && yearlyPrice === null ? (
                  <p className="text-xs text-muted-foreground">
                    annual via sales
                  </p>
                ) : isYearly && yearlyPrice !== null && yearlyPrice > 0 && (
                  <p className="text-xs text-muted-foreground">
                    billed yearly
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant={currentPlan === plan ? 'outline' : plan === 'pro' ? 'default' : 'outline'}
                disabled={currentPlan === plan}
                onClick={() => handleUpgrade(plan)}
                className="w-full"
              >
                {currentPlan === plan ? 'Current Plan' : plan === 'business' ? 'Contact Sales' : 'Upgrade'}
              </Button>

              {cryptoAvailable && isYearly && currentPlan !== plan && (
                <p className="text-[10px] text-muted-foreground">
                  or pay with crypto
                </p>
              )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Highlights Section - Always Visible */}
      {highlightsSection && (
        <div className="py-4 border-b">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-1">
              <h4 className="font-semibold text-sm px-2">{highlightsSection.title}</h4>
            </div>

            {(['starter', 'pro', 'business'] as const).map((plan) => (
              <div key={plan} className="space-y-2">
                {highlightsSection.features.map((feature) => (
                  <div key={feature.name} className="flex items-start gap-2 text-sm">
                    <FeatureValue value={feature[plan]} />
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Other Sections */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex justify-center py-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {isExpanded ? (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 mr-2" />
                  Show all features
                </>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="space-y-6 pb-4">
            {otherSections.map((section) => (
              <div key={section.title}>
                <h4 className="font-semibold text-sm mb-3 px-2">{section.title}</h4>
                <div className="space-y-2">
                  {section.features.map((feature) => (
                    <div
                      key={feature.name}
                      className="grid grid-cols-4 gap-4 py-2 px-2 hover:bg-muted/30 transition-colors rounded-md"
                    >
                      <div className="col-span-1 text-sm pl-4">
                        {feature.name}
                      </div>
                      <div className="flex items-center justify-center">
                        <FeatureValue value={feature.starter} />
                      </div>
                      <div className="flex items-center justify-center">
                        <FeatureValue value={feature.pro} />
                      </div>
                      <div className="flex items-center justify-center">
                        <FeatureValue value={feature.business} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
