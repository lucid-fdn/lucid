'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import React from 'react'

import { cn } from '@/lib/utils'

type WorkspaceMetricTone = 'default' | 'success' | 'warning' | 'danger'
type WorkspaceMetricDensity = 'compact' | 'comfortable'

interface WorkspaceMetricCardProps {
  label: string
  value: string | number
  detail?: string
  icon?: LucideIcon
  tone?: WorkspaceMetricTone
  density?: WorkspaceMetricDensity
  className?: string
  children?: ReactNode
}

const TONE_STYLES = {
  default: {
    border: 'border-border/70 bg-card/55',
    icon: 'text-muted-foreground',
    dot: 'bg-muted-foreground/30',
    value: 'text-foreground',
  },
  success: {
    border: 'border-emerald-500/25 bg-emerald-500/10',
    icon: 'text-emerald-500',
    dot: 'bg-emerald-400',
    value: 'text-emerald-500',
  },
  warning: {
    border: 'border-amber-500/25 bg-amber-500/10',
    icon: 'text-amber-500',
    dot: 'bg-amber-400',
    value: 'text-amber-500',
  },
  danger: {
    border: 'border-red-500/25 bg-red-500/10',
    icon: 'text-red-500',
    dot: 'bg-red-400',
    value: 'text-red-500',
  },
} as const

export function WorkspaceMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  density = 'comfortable',
  className,
  children,
}: WorkspaceMetricCardProps) {
  const styles = TONE_STYLES[tone]

  return (
    <React.Fragment>
      <div
        className={cn(
          'group overflow-hidden rounded-2xl border shadow-sm transition-colors hover:border-border',
          styles.border,
          density === 'compact' ? 'p-3' : 'p-4',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'font-semibold tracking-tight tabular-nums',
              density === 'compact' ? 'text-2xl' : 'font-mono text-3xl',
              tone === 'default' ? styles.value : styles.value,
            )}
          >
            {value}
          </div>
          {Icon ? (
            <Icon className={cn('mt-1 h-4 w-4 shrink-0', styles.icon)} />
          ) : (
            <div className={cn('mt-1 h-2 w-2 rounded-full', styles.dot)} />
          )}
        </div>
        <div className="mt-2 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </div>
        {detail ? (
          <div className="mt-1 text-xs leading-5 text-muted-foreground/80">
            {detail}
          </div>
        ) : null}
        {children}
      </div>
    </React.Fragment>
  )
}
