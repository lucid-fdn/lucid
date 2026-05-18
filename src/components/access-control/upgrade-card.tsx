/**
 * Upgrade Card - Full page/section upgrade prompts
 * For blocking entire features/pages that require plan upgrade
 */

'use client'

import * as React from "react"
import { Crown, Check, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/primitives/radix/tooltip'
import { UpgradeButton } from "./upgrade-badge"
import { useWorkspacePlan } from "@/lib/access-control/hooks"

interface UpgradeCardProps {
  feature: string
  requiredPlan?: 'pro' | 'business'
  benefits?: string[]
  className?: string
  disabled?: boolean
  disabledMessage?: string
}

/**
 * UpgradeCard - Large card for blocking entire features
 * 
 * Shows when user tries to access a feature they don't have access to
 * Prominently displays benefits and upgrade CTA
 * 
 * @example
 * <UpgradeCard 
 *   feature="Advanced Analytics"
 *   requiredPlan="pro"
 *   benefits={[
 *     "Custom dashboards",
 *     "Export data",
 *     "API access"
 *   ]}
 * />
 */
export function UpgradeCard({ 
  feature, 
  requiredPlan = 'pro',
  benefits = [],
  className,
  disabled = false,
  disabledMessage = "Coming Soon"
}: UpgradeCardProps) {
  const { plan } = useWorkspacePlan()
  
  const defaultBenefits = {
    pro: [
      "Advanced analytics & insights",
      "API access",
      "Custom branding",
      "Up to 25 team members",
      "Priority support"
    ],
    business: [
      "Unlimited everything",
      "SSO & advanced security",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantees"
    ]
  }
  
  const displayBenefits = benefits.length > 0 ? benefits : defaultBenefits[requiredPlan]
  
  return (
    <Card className={className}>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 p-3 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 w-fit">
          <Crown className="h-8 w-8 text-purple-600 dark:text-purple-400" />
        </div>
        <CardTitle className="text-2xl">Upgrade to unlock {feature}</CardTitle>
        <CardDescription>
          Your current plan: <span className="font-semibold capitalize">{plan}</span>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Benefits list */}
        <div className="space-y-2">
          {displayBenefits.map((benefit, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="mt-0.5">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm text-muted-foreground">{benefit}</p>
            </div>
          ))}
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-3">
        {disabled ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="inline-flex w-full"
                  aria-describedby="upgrade-disabled-tip"
                  aria-disabled="true"
                >
                  <Button 
                    size="lg" 
                    disabled
                    className="w-full pointer-events-none"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Upgrade to {requiredPlan}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent id="upgrade-disabled-tip" className="z-[100]">
                <p>{disabledMessage}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <UpgradeButton requiredPlan={requiredPlan} size="lg" />
        )}
        <p className="text-xs text-center text-muted-foreground">
          Cancel anytime • 14-day money-back guarantee
        </p>
      </CardFooter>
    </Card>
  )
}

/**
 * Inline Upgrade Prompt - Smaller inline version
 * For subtle prompts within existing interfaces
 */
export function InlineUpgradePrompt({
  feature,
  requiredPlan = 'pro',
  className
}: {
  feature: string
  requiredPlan?: 'pro' | 'business'
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 ${className}`}>
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        <div>
          <p className="text-sm font-medium">{feature} requires {requiredPlan} plan</p>
          <p className="text-xs text-muted-foreground">Upgrade to unlock this feature</p>
        </div>
      </div>
      <UpgradeButton requiredPlan={requiredPlan} size="sm">
        Upgrade
      </UpgradeButton>
    </div>
  )
}
