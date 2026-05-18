'use client'

import { useRef, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────

export type ActivityEventType = 'message' | 'tool' | 'error' | 'system' | 'info'

export interface ActivityEvent {
  id: string
  timestamp: Date
  type: ActivityEventType
  message: string
  metadata?: Record<string, unknown>
}

interface ActivityFeedProps {
  events: ActivityEvent[]
  /** Maximum events to display (default 200) */
  maxEvents?: number
  className?: string
}

// ── Type icons & colors ────────────────────────────────────────────

const TYPE_CONFIG: Record<ActivityEventType, { icon: string; color: string }> = {
  message: { icon: '💬', color: 'text-blue-400' },
  tool:    { icon: '🔧', color: 'text-amber-400' },
  error:   { icon: '✕',  color: 'text-red-400' },
  system:  { icon: '⚙',  color: 'text-zinc-500' },
  info:    { icon: '→',  color: 'text-zinc-400' },
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ── Component ──────────────────────────────────────────────────────

export function ActivityFeed({
  events,
  maxEvents = 200,
  className,
}: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  // Auto-scroll to bottom when new events arrive (unless user is hovering)
  useEffect(() => {
    if (!isHovering && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events.length, isHovering])

  const visibleEvents = events.slice(-maxEvents)

  if (visibleEvents.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">No activity yet</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Events will appear here in real-time
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea
      className={cn('h-full', className)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="p-2 space-y-px">
        {visibleEvents.map((event) => {
          const config = TYPE_CONFIG[event.type]
          return (
            <div
              key={event.id}
              className={cn(
                'flex items-start gap-2 px-2 py-1 rounded',
                'hover:bg-muted/50 transition-colors',
                'animate-in fade-in-0 slide-in-from-bottom-1 duration-120',
              )}
            >
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-px leading-4">
                {formatTime(event.timestamp)}
              </span>
              <span className={cn('text-[10px] shrink-0 w-4 text-center mt-px', config.color)}>
                {config.icon}
              </span>
              <span className={cn('text-[10px] font-mono leading-4 break-all', config.color)}>
                {event.message}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
