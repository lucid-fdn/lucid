'use client'

/**
 * Breathing Dot — Reusable animated status indicator.
 *
 * A small dot with optional "breathing" animation (scale+fade pulse).
 * Used across agent presence, activity pulse, status indicators, etc.
 *
 * @example
 * <BreathingDot color="bg-emerald-400" animate />
 * <BreathingDot color="bg-red-500" />
 */

import { cn } from "@/lib/utils"

interface BreathingDotProps {
  /** Tailwind bg color class (e.g. "bg-emerald-400") */
  color: string
  /** Whether to show the breathing animation */
  animate?: boolean
  /** Dot size — default "sm" (w-2 h-2) */
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

const SIZE_MAP = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
} as const

export function BreathingDot({
  color,
  animate = false,
  size = 'sm',
  className,
}: BreathingDotProps) {
  const sizeClass = SIZE_MAP[size]

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {animate && (
        <span
          className={cn(
            'absolute inline-flex rounded-full opacity-40',
            sizeClass,
            color,
            'animate-agent-breathe',
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-block rounded-full transition-colors duration-300',
          sizeClass,
          color,
          animate && 'animate-agent-presence-pulse',
        )}
      />
    </span>
  )
}
