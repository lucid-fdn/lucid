'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface PlanFeature {
  name: string
  included: boolean
  limit?: string | number
}

export interface PlanCardProps {
  name: string
  displayName: string
  description: string
  priceMonthly?: number | null
  priceYearly?: number | null
  features: PlanFeature[]
  isFeatured?: boolean
  isCurrentPlan?: boolean
  billingPeriod?: 'monthly' | 'yearly'
  onSelect?: () => void
  buttonText?: string
  buttonVariant?: 'default' | 'outline' | 'secondary'
  className?: string
  showCrypto?: boolean
  cryptoPriceMonthly?: string | null
  cryptoPriceYearly?: string | null
}

/**
 * PlanCard - Reusable pricing card component
 * 
 * Can be used on:
 * - Pricing page
 * - Settings billing page
 * - Upgrade modals
 * - Marketing pages
 * 
 * @example
 * ```tsx
 * <PlanCard
 *   name="pro"
 *   displayName="Professional"
 *   description="For power users"
 *   priceMonthly={2900}
 *   features={[
 *     { name: 'AI Agents', included: true },
 *     { name: 'API Access', included: true, limit: '100K calls/month' }
 *   ]}
 *   onSelect={() => handleUpgrade('pro')}
 * />
 * ```
 */
export function PlanCard({
  name,
  displayName,
  description,
  priceMonthly,
  priceYearly,
  features,
  isFeatured = false,
  isCurrentPlan = false,
  billingPeriod = 'monthly',
  onSelect,
  buttonText,
  buttonVariant = 'default',
  className,
  showCrypto = false,
  cryptoPriceMonthly,
  cryptoPriceYearly,
}: PlanCardProps) {
  const isBusiness = name === 'business'
  const isStarter = name === 'starter'
  
  // Calculate prices
  const price = billingPeriod === 'monthly' ? priceMonthly : priceYearly
  const cryptoPrice = billingPeriod === 'monthly' ? cryptoPriceMonthly : cryptoPriceYearly
  const displayPrice = price !== null && price !== undefined ? price / 100 : null
  
  // Calculate savings for yearly
  const yearlySavings = priceMonthly && priceYearly 
    ? ((priceMonthly * 12 - priceYearly) / 100).toFixed(0)
    : null
  
  // Dynamic button text based on context
  const getButtonText = (): string => {
    if (isCurrentPlan) return 'Current Plan'
    if (isBusiness) return 'Contact Sales'
    
    // Not logged in (no current plan)
    if (!isCurrentPlan && buttonText) return buttonText
    
    // Logged in with a plan
    if (isStarter) {
      return 'Get Started'
    }
    
    return name === 'pro' ? 'Upgrade to Growth' : 'Contact Sales'
  }
  
  const defaultButtonText = getButtonText()
  
  // Disable button if it's current plan
  const _isButtonDisabled = isCurrentPlan

  return (
    <Card 
      className={cn(
        'relative flex flex-col',
        isFeatured && 'border-primary shadow-lg scale-105',
        isCurrentPlan && 'border-primary/50',
        className
      )}
    >
      {/* Featured Badge */}
      {isFeatured && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge variant="default" className="px-4 py-1">
            Most Popular
          </Badge>
        </div>
      )}
      
      {/* Current Plan Badge */}
      {isCurrentPlan && (
        <div className="absolute -top-3 right-4">
          <Badge variant="outline" className="bg-background">
            Current
          </Badge>
        </div>
      )}
      
      <CardHeader>
        <CardTitle className="text-2xl">{displayName}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1">
        {/* Pricing */}
        <div className="mb-6">
          {isBusiness && displayPrice !== null ? (
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">${displayPrice}</span>
                <span className="text-muted-foreground">
                  /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Starting price. Final dedicated quote depends on workload and runtime shape.
              </p>
            </div>
          ) : isBusiness ? (
            <div className="text-3xl font-bold">Custom</div>
          ) : displayPrice !== null ? (
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">${displayPrice}</span>
                <span className="text-muted-foreground">
                  /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                </span>
              </div>
              
              {/* Yearly savings */}
              {billingPeriod === 'yearly' && yearlySavings && (
                <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                  Save ${yearlySavings}/year
                </p>
              )}
              
              {/* Crypto price */}
              {showCrypto && cryptoPrice && (
                <p className="mt-2 text-sm text-muted-foreground">
                  or {cryptoPrice} USDC
                </p>
              )}
            </div>
          ) : (
            <div className="text-4xl font-bold">Free</div>
          )}
        </div>
        
        {/* Features */}
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li 
              key={index}
              className={cn(
                'flex items-start gap-3',
                !feature.included && 'text-muted-foreground'
              )}
            >
              <Check 
                className={cn(
                  'h-5 w-5 shrink-0 mt-0.5',
                  feature.included 
                    ? 'text-primary' 
                    : 'text-muted-foreground/50'
                )} 
              />
              <div className="flex-1">
                <span>{feature.name}</span>
                {feature.limit && (
                  <span className="block text-sm text-muted-foreground">
                    {feature.limit}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      
      <CardFooter>
        <Button
          onClick={onSelect}
          disabled={isCurrentPlan}
          variant={isFeatured ? 'default' : buttonVariant}
          className="w-full"
          size="lg"
        >
          {buttonText || defaultButtonText}
        </Button>
      </CardFooter>
    </Card>
  )
}
