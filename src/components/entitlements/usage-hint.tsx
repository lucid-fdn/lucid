'use client'

import { motion, AnimatePresence } from 'motion/react'
import { AlertTriangle, Zap } from 'lucide-react'
import type { EntitlementStatusItem } from '@/lib/entitlements/types'

interface UsageHintProps {
  /** The AI queries metric status item from useEntitlementStatus */
  item: EntitlementStatusItem | null
}

/**
 * Subtle proactive usage hint shown near the chat input.
 * Only renders at warning_80, warning_95, or blocked thresholds.
 * All data comes from the server — frontend is pure presentation.
 */
export function UsageHint({ item }: UsageHintProps) {
  if (!item || item.status === 'normal' || item.isUnlimited) return null

  const remaining = Math.max(0, item.max - item.current)
  const isBlocked = item.status === 'blocked'
  const isGrace = item.status === 'grace'
  const isCritical = item.status === 'warning_95' || isGrace

  const resetLabel = item.resetAt
    ? `Resets ${formatResetDate(item.resetAt)}`
    : null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
        className="px-4"
      >
        <div
          className={`
            flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs
            ${isBlocked
              ? 'bg-destructive/10 text-destructive'
              : isCritical
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
            }
          `}
        >
          {isBlocked ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Zap className="h-3.5 w-3.5 shrink-0" />
          )}

          <span>
            {isBlocked
              ? 'Query limit reached'
              : isGrace
                ? 'Over limit — grace period active'
                : `${remaining} ${remaining === 1 ? 'query' : 'queries'} remaining`}
            {resetLabel && (
              <span className="text-muted-foreground ml-1">· {resetLabel}</span>
            )}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function formatResetDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'soon'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 7) return `in ${diffDays} days`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
