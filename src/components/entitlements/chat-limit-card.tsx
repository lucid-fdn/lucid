'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Zap, ArrowRight, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EntitlementDeny } from '@/lib/entitlements/types'
import { getEntitlementDisplay } from '@/lib/entitlements/registry'

interface ChatLimitCardProps {
  deny: EntitlementDeny
  className?: string
}

/**
 * In-chat upgrade card — shown inline where the assistant response would be.
 * ChatGPT-style: non-punitive, value-first, one-click upgrade.
 *
 * All data comes from the backend deny payload. No frontend assumptions
 * about limits, plans, or pricing.
 */
export function ChatLimitCard({ deny, className = '' }: ChatLimitCardProps) {
  const router = useRouter()
  const display = getEntitlementDisplay(deny.entitlement.metric)
  const { entitlement, action } = deny

  const current = entitlement.current ?? 0
  const max = entitlement.max ?? 0
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 100
  const upgrade = entitlement.upgradeTarget

  // Format reset date
  let resetLabel: string | null = null
  if (entitlement.resetAt) {
    const resetDate = new Date(entitlement.resetAt)
    resetLabel = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  }

  const handleUpgrade = () => {
    if (action.kind === 'contact_sales') {
      router.push('/contact')
    } else if (action.checkoutPlan) {
      router.push(`/settings/billing?upgrade=${action.checkoutPlan}`)
    } else {
      router.push('/settings/billing')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`mx-auto max-w-lg w-full ${className}`}
    >
      <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card to-card/80 shadow-lg overflow-hidden">
        {/* Gradient accent bar */}
        <div className="h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400" />

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2 shrink-0">
              <Zap className="h-5 w-5 text-purple-500" />
            </div>
            <div className="space-y-1 min-w-0">
              <h3 className="font-semibold text-sm leading-tight">
                {deny.message}
              </h3>
              {resetLabel && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Resets {resetLabel}
                </p>
              )}
            </div>
          </div>

          {/* Usage bar */}
          {max > 0 && (
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.15 }}
                  className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-500"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{current.toLocaleString()} / {max.toLocaleString()} {display.label.toLowerCase()}</span>
                <span>{Math.round(pct)}% used</span>
              </div>
            </div>
          )}

          {/* Upgrade target */}
          {upgrade && (
            <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {upgrade.displayName}
                    {upgrade.max && upgrade.max > 0 && (
                      <span className="text-muted-foreground font-normal">
                        {' · '}{upgrade.max === -1 ? 'Unlimited' : upgrade.max.toLocaleString()} {display.label.toLowerCase()}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {upgrade.valueProp}
                  </p>
                </div>
                <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 whitespace-nowrap">
                  ${upgrade.priceMonthly}/mo
                </p>
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleUpgrade}
              size="sm"
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white shadow-sm"
            >
              {action.kind === 'contact_sales' ? 'Contact Sales' : `Upgrade to ${upgrade?.displayName || 'Pro'}`}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/pricing')}
              className="text-muted-foreground"
            >
              View Plans
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
