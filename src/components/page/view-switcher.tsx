'use client'

import React from 'react'
import type { ComponentType } from 'react'

import { cn } from '@/lib/utils'

export type ViewSwitcherOption<T extends string> = {
  value: T
  label?: string
  icon?: ComponentType<{ className?: string }>
}

export function ViewSwitcher<T extends string>({
  value,
  options,
  onValueChange,
  className,
}: {
  value: T
  options: Array<ViewSwitcherOption<T>>
  onValueChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 p-1 backdrop-blur', className)}>
      {options.map((option) => {
        const Icon = option.icon
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
              selected
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
            )}
            aria-pressed={selected}
            aria-label={option.label ?? option.value}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {option.label ? <span>{option.label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
