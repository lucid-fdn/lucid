'use client'

import type { ReactNode } from 'react'

import { Tabs } from '@/components/ui/tabs'

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
    <Tabs
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
      tabs={options.map((option) => ({
        value: option.value,
        title: option.label,
        content: null,
      }))}
      containerClassName={className}
      activeTabClassName="bg-accent"
      tabClassName="text-sm font-medium text-muted-foreground"
      contentClassName="hidden"
    />
  )
}
