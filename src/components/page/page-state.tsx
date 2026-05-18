import React, { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/40 p-8 text-center', className)}>
      {icon ? <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">{icon}</div> : null}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function LoadingState({
  label = 'Loading...',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-[240px] items-center justify-center', className)}>
      <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {label}
      </div>
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-destructive/30 bg-destructive/5 p-6', className)}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
