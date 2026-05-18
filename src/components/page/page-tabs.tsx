'use client'

import React from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type PageTabOption<T extends string> = {
  value: T
  label: ReactNode
  badge?: ReactNode
}

export function PageTabs<T extends string>({
  value,
  options,
  onValueChange,
  className,
}: {
  value: T
  options: Array<PageTabOption<T>>
  onValueChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-xl border border-border/70 bg-background/80 p-1 backdrop-blur', className)}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
              selected
                ? 'bg-accent text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
            )}
            aria-pressed={selected}
          >
            <span>{option.label}</span>
            {option.badge ? <span className="text-xs text-muted-foreground">{option.badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
