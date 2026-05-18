'use client'

/**
 * Shared status indicator for agent activity.
 * variant="dot"  — small static green dot (for lists)
 * variant="live" — animated ping + "LIVE" text (for detail page)
 */
export function StatusIndicator({
  active,
  variant = 'dot',
}: {
  active: boolean
  variant?: 'dot' | 'live'
}) {
  if (!active) return null

  if (variant === 'dot') {
    return (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 shrink-0"
        title="Active (7d)"
      />
    )
  }

  // variant === 'live'
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span className="relative inline-flex">
        <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400/40 animate-ping" />
        <span className="relative inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
      </span>
      <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
        Live
      </span>
    </span>
  )
}
