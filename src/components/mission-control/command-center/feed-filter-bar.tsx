'use client'

/**
 * FeedFilterBar — Event type and severity filters for the Command Center live feed.
 *
 * Client-side filtering of already-loaded events. Compact chip-style toggles
 * that sit in the feed header bar.
 */

import { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Filter,
  X,
  Wrench,
  AlertTriangle,
  ArrowRightLeft,
  Shield,
  Clock,
  GitBranch,
  MessageSquare,
  FileCheck,
  PlugZap,
} from 'lucide-react'
import type { FeedEvent, FeedEventType, FeedSeverity } from '@/lib/mission-control/types'

// ─── Filter Groups ───────────────────────────────────────────────────────────

interface FilterGroup {
  label: string
  icon: typeof Filter
  types: FeedEventType[]
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    label: 'Tools',
    icon: Wrench,
    types: ['tool_call', 'tool_result', 'native_mutation_candidate'],
  },
  {
    label: 'Errors',
    icon: AlertTriangle,
    types: ['error'],
  },
  {
    label: 'Transactions',
    icon: ArrowRightLeft,
    types: ['transaction_submitted', 'transaction_confirmed', 'transaction_failed'],
  },
  {
    label: 'Approvals',
    icon: Shield,
    types: ['approval_requested', 'approval_resolved'],
  },
  {
    label: 'Tasks',
    icon: Clock,
    types: ['task_scheduled', 'task_completed', 'task_failed', 'task_cancelled'],
  },
  {
    label: 'Agents',
    icon: GitBranch,
    types: ['subagent_spawned', 'subagent_completed', 'subagent_failed', 'agent_message_sent'],
  },
  {
    label: 'Channels',
    icon: PlugZap,
    types: ['channel_connected', 'channel_disconnected', 'channel_deactivated'],
  },
  {
    label: 'Messages',
    icon: MessageSquare,
    types: ['message_received', 'message_sent', 'inbound', 'outbound'],
  },
  {
    label: 'Proofs',
    icon: FileCheck,
    types: ['receipt_created', 'receipt_verified', 'passport_provisioned', 'epoch_anchored'],
  },
]

const SEVERITY_OPTIONS: { value: FeedSeverity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { value: 'error', label: 'Error', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  { value: 'warning', label: 'Warning', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { value: 'info', label: 'Info', color: 'bg-muted text-muted-foreground border-border' },
]

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface FeedFilters {
  groups: Set<string>
  severities: Set<FeedSeverity>
}

export function useFeedFilters() {
  const [filters, setFilters] = useState<FeedFilters>({
    groups: new Set(),
    severities: new Set(),
  })

  const toggleGroup = useCallback((label: string) => {
    setFilters((prev) => {
      const next = new Set(prev.groups)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return { ...prev, groups: next }
    })
  }, [])

  const toggleSeverity = useCallback((severity: FeedSeverity) => {
    setFilters((prev) => {
      const next = new Set(prev.severities)
      if (next.has(severity)) next.delete(severity)
      else next.add(severity)
      return { ...prev, severities: next }
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters({ groups: new Set(), severities: new Set() })
  }, [])

  const hasFilters = filters.groups.size > 0 || filters.severities.size > 0

  const filterEvents = useCallback((events: FeedEvent[]): FeedEvent[] => {
    if (!hasFilters) return events

    // Build allowed type set from active groups
    const allowedTypes = new Set<FeedEventType>()
    if (filters.groups.size > 0) {
      for (const group of FILTER_GROUPS) {
        if (filters.groups.has(group.label)) {
          for (const t of group.types) allowedTypes.add(t)
        }
      }
    }

    return events.filter((event) => {
      // Type filter (if any groups selected)
      if (allowedTypes.size > 0 && !allowedTypes.has(event.event_type)) return false
      // Severity filter (if any severities selected)
      if (filters.severities.size > 0) {
        const normalizedSeverity = event.severity === 'warn' ? 'warning' : event.severity
        if (!filters.severities.has(normalizedSeverity)) return false
      }
      return true
    })
  }, [filters, hasFilters])

  return { filters, toggleGroup, toggleSeverity, clearAll, hasFilters, filterEvents }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface FeedFilterBarProps {
  filters: FeedFilters
  onToggleGroup: (label: string) => void
  onToggleSeverity: (severity: FeedSeverity) => void
  onClearAll: () => void
  hasFilters: boolean
  /** Total event count (unfiltered) */
  totalEvents: number
  /** Filtered event count */
  filteredEvents: number
  className?: string
}

export function FeedFilterBar({
  filters,
  onToggleGroup,
  onToggleSeverity,
  onClearAll,
  hasFilters,
  totalEvents,
  filteredEvents,
  className,
}: FeedFilterBarProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('border-b border-border/60', className)}>
      {/* Toggle row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors duration-120',
            hasFilters
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
          )}
        >
          <Filter className="h-2.5 w-2.5" />
          Filter
          {hasFilters && (
            <span className="ml-0.5 text-[10px] text-muted-foreground">
              {filteredEvents}/{totalEvents}
            </span>
          )}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors duration-120"
          >
            <X className="h-2.5 w-2.5" />
            Clear
          </button>
        )}
      </div>

      {/* Expanded filter chips */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Type groups */}
          <div className="flex flex-wrap gap-1">
            {FILTER_GROUPS.map((group) => {
              const active = filters.groups.has(group.label)
              const GroupIcon = group.icon
              return (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => onToggleGroup(group.label)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] transition-colors duration-120',
                    active
                      ? 'bg-accent text-foreground border-border'
                      : 'text-muted-foreground border-border hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <GroupIcon className="h-2.5 w-2.5" />
                  {group.label}
                </button>
              )
            })}
          </div>
          {/* Severity chips */}
          <div className="flex flex-wrap gap-1">
            {SEVERITY_OPTIONS.map((sev) => {
              const active = filters.severities.has(sev.value)
              return (
                <button
                  key={sev.value}
                  type="button"
                  onClick={() => onToggleSeverity(sev.value)}
                  className={cn(
                    'px-2 py-0.5 rounded-full border text-[10px] transition-colors duration-120',
                    active ? sev.color : 'text-muted-foreground border-border hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {sev.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
