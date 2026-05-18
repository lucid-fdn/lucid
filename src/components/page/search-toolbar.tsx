'use client'

import React from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'

export function SearchToolbar({
  value,
  onValueChange,
  placeholder = 'Search...',
  leading,
  trailing,
  className,
  inputProps,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
  inputProps?: Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'placeholder'>
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/80 p-1.5 backdrop-blur', className)}>
      {leading}
      <label className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          {...inputProps}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            'h-8 w-full rounded-lg border-0 bg-transparent pl-8 pr-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:bg-muted/50',
            inputProps?.className,
          )}
        />
      </label>
      {trailing}
    </div>
  )
}
