'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { RoutineList } from './routine-list'
import { useRoutines } from '@/hooks/use-routines'
import type { RoutineDefinition, RoutineTargetType } from '@/lib/routines/types'

interface RoutinePanelProps {
  orgId: string
  assistantId?: string
  teamId?: string
  targetType?: RoutineTargetType
  status?: string
  detailHref?: (routine: RoutineDefinition) => string
  onChanged?: () => void
}

export function RoutinePanel({
  orgId,
  assistantId,
  teamId,
  targetType,
  status,
  detailHref,
  onChanged,
}: RoutinePanelProps) {
  const routines = useRoutines({ orgId, assistantId, teamId, targetType, status })
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...routines.routines].sort((left, right) => {
      const leftNext = left.next_run_at ? new Date(left.next_run_at).getTime() : Number.POSITIVE_INFINITY
      const rightNext = right.next_run_at ? new Date(right.next_run_at).getTime() : Number.POSITIVE_INFINITY
      return leftNext - rightNext
    })
  }, [routines.routines])

  async function withAction(action: () => Promise<void>, message: string) {
    setActionError(null)
    setNotice(null)
    try {
      await action()
      setNotice(message)
      onChanged?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Routine action failed')
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {actionError}
        </div>
      ) : null}

      <RoutineList
        routines={sorted}
        loading={routines.loading}
        error={routines.error}
        onRefresh={routines.refresh}
        onRunNow={(routine) => withAction(
          () => routines.runNow(routine.id, orgId).then(() => undefined),
          `${routine.name} was queued.`,
        )}
        onToggle={(routine, enabled) => withAction(
          () => routines.update(routine.id, orgId, { enabled }).then(() => undefined),
          `${routine.name} is ${enabled ? 'enabled' : 'paused'}.`,
        )}
        onCancel={(routine) => withAction(
          () => routines.cancel(routine.id, orgId),
          `${routine.name} was cancelled.`,
        )}
        detailHref={detailHref}
      />
    </div>
  )
}
