'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface WorkspaceActionRowProps {
  href?: string
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  meta?: ReactNode
  icon?: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
  children?: ReactNode
}

const ROW_TONE_STYLES = {
  default: 'border-border/55 bg-background/35',
  success: 'border-emerald-500/25 bg-emerald-500/10',
  warning: 'border-amber-500/25 bg-amber-500/10',
  danger: 'border-red-500/25 bg-red-500/10',
} as const

const ICON_TONE_STYLES = {
  default: 'text-muted-foreground',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  danger: 'text-red-500',
} as const

export function WorkspaceActionRow({
  href,
  title,
  description,
  eyebrow,
  meta,
  icon: Icon,
  tone = 'default',
  className,
  children,
}: WorkspaceActionRowProps) {
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70',
              ICON_TONE_STYLES[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <div className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {eyebrow}
            </div>
          ) : null}
          <div className="truncate text-sm font-medium text-foreground">
            {title}
          </div>
          {description ? (
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      </div>
      {meta ? (
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </>
  )

  const rowClassName = cn(
    'flex items-start justify-between gap-3 rounded-xl border px-3 py-3 transition-colors',
    ROW_TONE_STYLES[tone],
    href && 'hover:bg-accent/30',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={rowClassName}>
        {content}
      </Link>
    )
  }

  return <div className={rowClassName}>{content}</div>
}
