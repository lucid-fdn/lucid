import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RoutineDefinition } from '@/lib/routines/types'

const ROUTINE_STATUS_STYLES: Record<string, string> = {
  pending: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300',
  queued: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300',
  claimed: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  succeeded: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  paused: 'border-border bg-muted text-muted-foreground',
  skipped: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  blocked: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  stale: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  dead_letter: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  cancelled: 'border-border bg-muted text-muted-foreground',
}

export function RoutineStatusBadge({
  routine,
  className,
}: {
  routine: Pick<RoutineDefinition, 'status' | 'enabled' | 'last_run_status'>
  className?: string
}) {
  const status = !routine.enabled && routine.status !== 'cancelled' ? 'paused' : routine.status
  const label = formatRoutineStatus(status)

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-6 rounded-md px-2 text-[11px] font-medium',
        ROUTINE_STATUS_STYLES[status] ?? 'border-border bg-background text-muted-foreground',
        className,
      )}
    >
      {label}
    </Badge>
  )
}

export function formatRoutineStatus(status: string) {
  if (status === 'dead_letter') return 'Dead letter'
  if (status === 'claimed') return 'Queued'
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
