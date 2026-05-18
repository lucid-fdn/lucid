'use client'

import { cn } from '@/lib/utils'

// ─── Panel Layout ────────────────────────────────────────────────────────────
// Unified structure for all collapsible panel content.
// Enforces: CONTEXT LINE → PRIMARY STATE → SECONDARY BLOCKS → PRIMARY ACTION
// ─────────────────────────────────────────────────────────────────────────────

interface PanelLayoutProps {
  /** One-line context under the section header */
  context?: React.ReactNode
  /** Primary state visualization — the "hero" of the panel */
  state?: React.ReactNode
  /** Secondary content blocks (settings, lists, details) */
  children?: React.ReactNode
  /** Bottom-pinned primary action (save, connect, provision) */
  action?: React.ReactNode
  /** Additional className */
  className?: string
}

export function PanelLayout({ context, state, children, action, className }: PanelLayoutProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {context && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">{context}</p>
      )}
      {state && (
        <div className="panel-state">{state}</div>
      )}
      {children && (
        <div className="space-y-3">{children}</div>
      )}
      {action && (
        <div className="pt-1">{action}</div>
      )}
    </div>
  )
}

// ─── Panel State Card ────────────────────────────────────────────────────────
// Consistent state block: icon + title + subtitle + optional status indicator
// Used as the PRIMARY STATE in PanelLayout.

interface PanelStateCardProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  status?: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  className?: string
  children?: React.ReactNode
}

const VARIANT_STYLES = {
  default: 'border-border bg-card/40',
  success: 'border-emerald-500/20 bg-emerald-500/[0.04]',
  warning: 'border-amber-500/20 bg-amber-500/[0.04]',
  error: 'border-red-500/20 bg-red-500/[0.04]',
  info: 'border-blue-500/20 bg-blue-500/[0.04]',
} as const

export function PanelStateCard({
  icon,
  title,
  subtitle,
  status,
  variant = 'default',
  className,
  children,
}: PanelStateCardProps) {
  return (
    <div className={cn('rounded-lg border px-3.5 py-2.5', VARIANT_STYLES[variant], className)}>
      <div className="flex items-center gap-2.5">
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {children && <div className="mt-2 pt-2 border-t border-border">{children}</div>}
    </div>
  )
}

// ─── Panel Info Row ──────────────────────────────────────────────────────────
// Key-value row for secondary detail blocks. Consistent across all panels.

interface PanelInfoRowProps {
  label: string
  value: React.ReactNode
  className?: string
}

export function PanelInfoRow({ label, value, className }: PanelInfoRowProps) {
  return (
    <div className={cn('flex items-center justify-between text-[11px]', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

// ─── Panel Empty State ───────────────────────────────────────────────────────
// Consistent empty state: icon + title + description + optional action hint.
// Fulfills 3 jobs: explain current state, explain why empty, suggest next action.

interface PanelEmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  hint?: string
  children?: React.ReactNode
}

export function PanelEmptyState({ icon, title, description, hint, children }: PanelEmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-6 px-4">
      <div className="h-10 w-10 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-sm text-foreground font-medium">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[260px]">{description}</p>
      {children && <div className="mt-4 w-full max-w-[260px]">{children}</div>}
      {hint && <p className="text-[10px] text-muted-foreground/50 mt-4">{hint}</p>}
    </div>
  )
}

// ─── Panel Detail Block ──────────────────────────────────────────────────────
// Bordered info card with multiple PanelInfoRows. Used for grouped details.

interface PanelDetailBlockProps {
  children: React.ReactNode
  className?: string
}

export function PanelDetailBlock({ children, className }: PanelDetailBlockProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3.5 py-2.5 space-y-1.5', className)}>
      {children}
    </div>
  )
}
