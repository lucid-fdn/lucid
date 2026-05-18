import { type ComponentPropsWithoutRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function PageSection({
  title,
  description,
  actions,
  action,
  children,
  className,
  contentClassName,
  ...props
}: ComponentPropsWithoutRef<'section'> & {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  action?: ReactNode
  children: ReactNode
  contentClassName?: string
}) {
  const headerActions = actions ?? action

  return (
    <section
      className={cn(
        'rounded-2xl border border-border/70 bg-card/45',
        className,
      )}
      {...props}
    >
      {title || description || headerActions ? (
        <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-3xl text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {headerActions ? (
            <div className="shrink-0">{headerActions}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn('p-5', contentClassName)}>{children}</div>
    </section>
  )
}
