'use client'

/**
 * DecisionFork — Mini SVG showing routing decision.
 * Chosen path highlighted, unchosen dimmed.
 */

import { cn } from '@/lib/utils'

interface DecisionForkProps {
  lane: string
  className?: string
}

export function DecisionFork({ lane, className }: DecisionForkProps) {
  const isFast = lane === 'fast'

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <svg className="h-4 w-8" viewBox="0 0 32 16">
        {/* Trunk */}
        <line x1="0" y1="8" x2="10" y2="8" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        {/* Fast path (top) */}
        <line
          x1="10" y1="8" x2="32" y2="2"
          stroke={isFast ? '#60a5fa' : 'rgba(255,255,255,0.08)'}
          strokeWidth={isFast ? 1.5 : 1}
          strokeDasharray={isFast ? undefined : '2 2'}
        />
        {/* Strong path (bottom) */}
        <line
          x1="10" y1="8" x2="32" y2="14"
          stroke={!isFast ? '#a78bfa' : 'rgba(255,255,255,0.08)'}
          strokeWidth={!isFast ? 1.5 : 1}
          strokeDasharray={!isFast ? undefined : '2 2'}
        />
        {/* Fork point */}
        <circle cx="10" cy="8" r="2" fill="rgba(255,255,255,0.3)" />
      </svg>
      <span className={cn(
        'text-[10px] font-medium px-1 py-0.5 rounded',
        isFast ? 'bg-blue-500/10 text-blue-400' : 'bg-violet-500/10 text-violet-400',
      )}>
        {lane}
      </span>
    </div>
  )
}
