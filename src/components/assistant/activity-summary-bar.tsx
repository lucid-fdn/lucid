'use client'

import { DollarSign, MessageSquare, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedEvent } from '@/lib/mission-control/types'

interface ActivitySummaryBarProps {
  events: FeedEvent[]
  className?: string
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function ActivitySummaryBar({ events, className }: ActivitySummaryBarProps) {
  const todayEvents = events.filter(
    (e) => e.created_at && isToday(e.created_at),
  )

  const costToday = todayEvents.reduce((sum, e) => {
    const cost = e.payload?.cost_usd ?? e.payload?.cost ?? 0
    return sum + (typeof cost === 'number' ? cost : 0)
  }, 0)

  const messagesCount = todayEvents.filter(
    (e) =>
      e.event_type === 'message_received' ||
      e.event_type === 'message_sent' ||
      e.event_type === 'inbound' ||
      e.event_type === 'outbound',
  ).length

  const errorsCount = todayEvents.filter(
    (e) =>
      e.event_type === 'error' ||
      e.severity === 'error',
  ).length

  const chips = [
    {
      label: 'Cost',
      value: `$${costToday.toFixed(2)}`,
      icon: DollarSign,
      alert: false,
    },
    {
      label: 'Messages',
      value: `${messagesCount}`,
      icon: MessageSquare,
      alert: false,
    },
    {
      label: 'Errors',
      value: `${errorsCount}`,
      icon: AlertTriangle,
      alert: errorsCount > 0,
    },
  ]

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b border-border',
        className,
      )}
    >
      {chips.map((chip) => (
        <div
          key={chip.label}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
            'bg-card border border-border',
            chip.alert && 'border-red-500/30 bg-red-950/20',
          )}
        >
          <chip.icon
            className={cn(
              'h-3 w-3',
              chip.alert ? 'text-red-400' : 'text-muted-foreground',
            )}
          />
          <span className={cn('font-mono font-medium', chip.alert ? 'text-red-400' : 'text-foreground')}>
            {chip.value}
          </span>
        </div>
      ))}
    </div>
  )
}
