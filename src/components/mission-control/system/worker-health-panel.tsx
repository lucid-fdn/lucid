'use client'
import { KPICard } from '@/components/mission-control/kpi-card'
import { Inbox, AlertTriangle, Clock, Activity } from 'lucide-react'

interface WorkerHealthPanelProps {
  pendingEvents: number
  deadLetters: number
  oldestPendingAge: number | null
  errorsLastHour: number
}

export function WorkerHealthPanel({
  pendingEvents,
  deadLetters,
  oldestPendingAge,
  errorsLastHour,
}: WorkerHealthPanelProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPICard
        label="Pending Events"
        value={pendingEvents}
        icon={Inbox}
        variant={pendingEvents > 100 ? 'warning' : 'default'}
      />
      <KPICard
        label="Dead Letters"
        value={deadLetters}
        icon={AlertTriangle}
        variant={deadLetters > 0 ? 'error' : 'default'}
      />
      <KPICard
        label="Oldest Pending"
        value={
          oldestPendingAge != null
            ? `${Math.round(oldestPendingAge)}s`
            : '--'
        }
        icon={Clock}
        variant={
          oldestPendingAge != null && oldestPendingAge > 300 ? 'warning' : 'default'
        }
      />
      <KPICard
        label="Errors (1h)"
        value={errorsLastHour}
        icon={Activity}
        variant={errorsLastHour > 5 ? 'error' : 'default'}
      />
    </div>
  )
}
