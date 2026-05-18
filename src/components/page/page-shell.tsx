import React, { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function PageShell({
  children,
  className,
  contentClassName,
  constrained = true,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  constrained?: boolean
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          constrained && 'mx-auto w-full max-w-7xl',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
