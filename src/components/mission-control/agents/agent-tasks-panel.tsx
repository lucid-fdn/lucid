'use client'

import { useEffect, useRef, useState } from 'react'
import type { ScheduleHint } from '@contracts/template'
import {
  Calendar,
  Clock,
  AlertTriangle,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Pencil,
  History,
  RotateCcw,
  Check,
  X,
  MoreHorizontal,
  Loader2,
} from 'lucide-react'
import { useScheduledTasks } from '@/hooks/use-scheduled-tasks'
import { DatePicker } from '@/components/ui/date-picker'
import {
  mapControlledTasksToScheduleHints,
  mapScheduleHintsToControlledTasks,
} from '@/components/assistant/view-models'
import { describeCronExpression } from '@/lib/scheduler/cron-utils'
import { cn } from '@/lib/utils'
import type { ScheduledTask, ScheduledTaskVersion } from '@/lib/mission-control/types'
import { PanelLayout, PanelEmptyState } from '@/components/panels/panel-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RestoreTaskVersionResult {
  ok: boolean
  conflict?: boolean
  error?: string | null
}

interface AgentTasksPanelProps {
  agentId?: string
  orgId?: string
  initialTasks?: ScheduledTask[]
  mode?: 'assistant' | 'controlled'
  controlledTasks?: ScheduledTask[]
  onControlledTasksChange?: (tasks: ScheduledTask[]) => void
  controlledSchedules?: ScheduleHint[]
  onControlledSchedulesChange?: (tasks: ScheduleHint[]) => void
  createControlledTask?: (index: number) => ScheduledTask
  /**
   * Called whenever the live tasks list changes (Realtime push, mutation, refetch).
   * Lets parents lift the tasks state so sibling components (hero "next scheduled"
   * preview, introspection stream) re-render instantly without a page refresh.
   */
  onTasksChange?: (tasks: ScheduledTask[]) => void
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:     { bg: 'bg-blue-500/15',   text: 'text-blue-400',   label: 'Pending' },
  claimed:     { bg: 'bg-yellow-500/15',  text: 'text-yellow-400', label: 'Running' },
  running:     { bg: 'bg-green-500/15',   text: 'text-green-400',  label: 'Running' },
  completed:   { bg: 'bg-green-500/15',   text: 'text-green-400',  label: 'Completed' },
  failed:      { bg: 'bg-red-500/15',     text: 'text-red-400',    label: 'Failed' },
  dead_letter: { bg: 'bg-red-500/15',     text: 'text-red-400',    label: 'Dead Letter' },
  cancelled:   { bg: 'bg-accent/50',      text: 'text-muted-foreground',   label: 'Cancelled' },
}

export function AgentTasksPanel({
  agentId,
  orgId,
  initialTasks,
  mode = 'assistant',
  controlledTasks,
  onControlledTasksChange,
  controlledSchedules,
  onControlledSchedulesChange,
  createControlledTask,
  onTasksChange,
}: AgentTasksPanelProps) {
  const isControlled = mode === 'controlled'
  const scheduled = useScheduledTasks({
    orgId: orgId ?? '',
    agentId: agentId ?? '',
    initialTasks,
    enabled: !isControlled && Boolean(orgId),
  })
  const [localTasks, setLocalTasks] = useState<ScheduledTask[]>(
    controlledTasks ?? mapScheduleHintsToControlledTasks(controlledSchedules ?? []) ?? initialTasks ?? [],
  )
  const tasks = isControlled ? localTasks : scheduled.tasks
  const isLoading = isControlled ? false : scheduled.isLoading
  const hasMountedControlledRef = useRef(false)
  const skipNextControlledNotifyRef = useRef(false)
  const onControlledTasksChangeRef = useRef(onControlledTasksChange)
  useEffect(() => { onControlledTasksChangeRef.current = onControlledTasksChange }, [onControlledTasksChange])
  const onControlledSchedulesChangeRef = useRef(onControlledSchedulesChange)
  useEffect(() => { onControlledSchedulesChangeRef.current = onControlledSchedulesChange }, [onControlledSchedulesChange])
  useEffect(() => {
    if (!isControlled) return
    const nextTasks = controlledTasks ?? mapScheduleHintsToControlledTasks(controlledSchedules ?? [])
    setLocalTasks((current) => {
      if (areScheduledTasksEquivalent(current, nextTasks)) return current
      skipNextControlledNotifyRef.current = true
      return nextTasks
    })
  }, [controlledSchedules, controlledTasks, isControlled])

  const notifyControlledChange = (next: ScheduledTask[]) => {
    onControlledTasksChangeRef.current?.(next)
    onControlledSchedulesChangeRef.current?.(mapControlledTasksToScheduleHints(next))
  }

  useEffect(() => {
    if (!isControlled) return
    if (!hasMountedControlledRef.current) {
      hasMountedControlledRef.current = true
      return
    }
    if (skipNextControlledNotifyRef.current) {
      skipNextControlledNotifyRef.current = false
      return
    }
    notifyControlledChange(localTasks)
  }, [isControlled, localTasks])

  const addTask = () => {
    if (!isControlled) return
    setLocalTasks((prev) => [...prev, (createControlledTask ?? createControlledDraftTask)(prev.length)])
  }

  const cancelTask = async (taskId: string) => {
    if (!isControlled) {
      await scheduled.cancelTask(taskId)
      return
    }
    setLocalTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, status: 'cancelled' as const, enabled: false } : task))
  }

  const toggleTask = async (taskId: string, enabled: boolean) => {
    if (!isControlled) {
      await scheduled.toggleTask(taskId, enabled)
      return
    }
    setLocalTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, enabled } : task))
  }

  const deleteTask = async (taskId: string) => {
    if (!isControlled) {
      await scheduled.deleteTask(taskId)
      return
    }
    setLocalTasks((prev) => prev.filter((task) => task.id !== taskId))
  }

  const updateTask = async (taskId: string, updates: { name?: string; task_prompt?: string; cron_expression?: string | null }) => {
    if (!isControlled) {
      await scheduled.updateTask(taskId, updates)
      return
    }
    setLocalTasks((prev) => prev.map((task) => task.id === taskId ? {
        ...task,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.task_prompt !== undefined ? { task_prompt: updates.task_prompt } : {}),
        ...(updates.cron_expression !== undefined ? { cron_expression: updates.cron_expression } : {}),
      } : task))
  }

  // Notify parent whenever the live tasks list changes — Realtime push,
  // mutations, or polling refetch — so siblings (hero preview, introspection
  // stream) stay in sync without a page refresh.
  const onTasksChangeRef = useRef(onTasksChange)
  useEffect(() => { onTasksChangeRef.current = onTasksChange }, [onTasksChange])
  useEffect(() => {
    onTasksChangeRef.current?.(tasks)
  }, [tasks])

  if (isLoading && tasks.length === 0) {
    return <AgentTasksPanelSkeleton />
  }

  if (tasks.length === 0) {
    return (
      <PanelLayout
        context="Automate this agent with Routines."
        action={isControlled ? (
          <Button type="button" size="sm" variant="outline" onClick={addTask}>
            Add routine
          </Button>
        ) : undefined}
      >
        <PanelEmptyState
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          title={isControlled ? "No routines yet" : "Runs only when triggered"}
          description="Add routines to make this agent proactive: check prices, sync data, prepare reviews, or send reports on a clear cadence."
          hint="Ask the agent to create a routine in chat"
        >
          <div className="space-y-1.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Examples</p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[11px] text-muted-foreground bg-muted border border-border rounded-md px-2 py-1">Every hour</span>
              <span className="text-[11px] text-muted-foreground bg-muted border border-border rounded-md px-2 py-1">Daily sync</span>
              <span className="text-[11px] text-muted-foreground bg-muted border border-border rounded-md px-2 py-1">Morning summary</span>
            </div>
          </div>
        </PanelEmptyState>
      </PanelLayout>
    )
  }

  const sorted = [...tasks].sort((a, b) => {
    const aActive = a.enabled && !['cancelled', 'dead_letter', 'completed'].includes(a.status)
    const bActive = b.enabled && !['cancelled', 'dead_letter', 'completed'].includes(b.status)
    if (aActive !== bActive) return aActive ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <PanelLayout
      context={`${tasks.length} routine${tasks.length !== 1 ? 's' : ''} configured for this agent.`}
      action={isControlled ? (
        <Button type="button" size="sm" variant="outline" onClick={addTask}>
          Add routine
        </Button>
      ) : undefined}
    >
      <div className="divide-y divide-border -mx-0.5">
        {sorted.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onCancel={() => cancelTask(task.id)}
            onToggle={(enabled) => toggleTask(task.id, enabled)}
            onDelete={() => deleteTask(task.id)}
            onUpdate={(updates) => updateTask(task.id, updates)}
            onListVersions={isControlled ? undefined : () => scheduled.listTaskVersions(task.id)}
            onRestoreVersion={isControlled
              ? undefined
              : (versionId, expectedCurrentSnapshotHash) => scheduled.restoreTaskVersion(
                  task.id,
                  versionId,
                  expectedCurrentSnapshotHash,
                )
            }
          />
        ))}
      </div>
    </PanelLayout>
  )
}

// ── Task Row ──────────────────────────────────────────────────────────

interface TaskRowProps {
  task: ScheduledTask
  onCancel: () => void
  onToggle: (enabled: boolean) => void
  onDelete: () => void
  onUpdate: (updates: { name?: string; task_prompt?: string; cron_expression?: string | null }) => void
  onListVersions?: () => Promise<ScheduledTaskVersion[]>
  onRestoreVersion?: (versionId: string, expectedCurrentSnapshotHash?: string | null) => Promise<RestoreTaskVersionResult>
}

function TaskRow({
  task,
  onCancel,
  onToggle,
  onDelete,
  onUpdate,
  onListVersions,
  onRestoreVersion,
}: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(task.name)
  const [editPrompt, setEditPrompt] = useState(task.task_prompt)
  const [scheduleMode, setScheduleMode] = useState<ScheduleEditorMode>(() => getInitialScheduleMode(task))
  const [scheduleDate, setScheduleDate] = useState<Date>(() => getInitialScheduleDate(task))
  const [scheduleTime, setScheduleTime] = useState<string>(() => getInitialScheduleTime(task))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<ScheduledTaskVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)

  const handleDelete = async () => {
    setIsDeleting(true)
    await onDelete()
  }

  const handleOpenHistory = async () => {
    if (!onListVersions) return
    setMenuOpen(false)
    const nextOpen = !historyOpen
    setHistoryOpen(nextOpen)
    setRestoreMessage(null)
    if (!nextOpen || versions.length > 0) return
    setVersionsLoading(true)
    try {
      setVersions(await onListVersions())
    } finally {
      setVersionsLoading(false)
    }
  }

  const handleRestoreVersion = async (versionId: string) => {
    if (!onRestoreVersion) return
    setRestoringVersionId(versionId)
    setRestoreMessage(null)
    try {
      const result = await onRestoreVersion(versionId, versions[0]?.snapshot_hash ?? null)
      if (result.ok && onListVersions) {
        setVersions(await onListVersions())
      } else if (result.conflict) {
        setRestoreMessage('This routine changed since you opened history. Refresh history before restoring.')
      } else {
        setRestoreMessage(result.error ?? 'Unable to restore this routine version.')
      }
    } finally {
      setRestoringVersionId(null)
    }
  }

  const style = STATUS_STYLES[task.status] ?? STATUS_STYLES.pending
  const isTerminal = ['cancelled', 'dead_letter', 'completed'].includes(task.status)
  const isActive = task.enabled && !isTerminal
  const isCron = !!task.cron_expression
  const hasEditableRecurringPattern = !task.cron_expression || inferScheduleMode(task.cron_expression) !== 'custom'

  const handleSave = () => {
    const updates: Record<string, string | null> = {}
    if (editName !== task.name) updates.name = editName
    if (editPrompt !== task.task_prompt) updates.task_prompt = editPrompt
    if (isCron) {
      const nextCron = buildCronExpression(scheduleMode, scheduleDate, scheduleTime)
      if (nextCron !== task.cron_expression) updates.cron_expression = nextCron
    }
    if (Object.keys(updates).length > 0) onUpdate(updates)
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditName(task.name)
    setEditPrompt(task.task_prompt)
    setScheduleMode(getInitialScheduleMode(task))
    setScheduleDate(getInitialScheduleDate(task))
    setScheduleTime(getInitialScheduleTime(task))
    setEditing(false)
  }

  return (
    <div className={cn(
      'px-2 py-3 transition-all duration-200',
      !isActive && !isDeleting && 'opacity-60',
      isDeleting && 'opacity-40 pointer-events-none',
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isCron ? (
            <RefreshCw className={cn('h-3.5 w-3.5 flex-shrink-0', isActive ? 'text-blue-400' : 'text-muted-foreground')} />
          ) : (
            <Calendar className={cn('h-3.5 w-3.5 flex-shrink-0', isActive ? 'text-blue-400' : 'text-muted-foreground')} />
          )}

          {editing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-sm font-medium bg-accent/50 border border-border rounded px-2 py-0.5 flex-1 min-w-0 text-foreground"
              autoFocus
            />
          ) : (
            <span className="text-sm font-medium truncate text-foreground">{task.name}</span>
          )}

          <span className={cn('text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap', style.bg, style.text)}>
            {style.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 relative">
          {editing ? (
            <>
              <button onClick={handleSave} className="p-1 hover:bg-green-500/10 rounded transition-colors" title="Save">
                <Check className="h-3.5 w-3.5 text-green-400" />
              </button>
              <button onClick={handleCancelEdit} className="p-1 hover:bg-accent rounded transition-colors" title="Cancel edit">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                disabled={isDeleting}
                onClick={() => { if (confirmDelete) { handleDelete() } else { setConfirmDelete(true) } }}
                className={cn('p-1 rounded transition-colors', confirmDelete ? 'bg-red-500/10' : 'hover:bg-red-500/10')}
                title={confirmDelete ? 'Click again to confirm delete' : 'Delete task'}
              >
                {isDeleting
                  ? <Loader2 className="h-3.5 w-3.5 text-red-400 animate-spin" />
                  : <Trash2 className={cn('h-3.5 w-3.5', confirmDelete ? 'text-red-400 animate-pulse' : 'text-red-400/60')} />
                }
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1 hover:bg-accent rounded transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setMenuOpen(false); setConfirmDelete(false) }} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-border bg-background shadow-md py-1 text-xs">
                    {!isTerminal && (
                      <button
                        onClick={() => { setEditing(true); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    {!isTerminal && (
                      <button
                        onClick={() => { onToggle(!task.enabled); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-foreground"
                      >
                        {task.enabled
                          ? <><PowerOff className="h-3 w-3" /> Pause</>
                          : <><Power className="h-3 w-3 text-green-400" /> Resume</>
                        }
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => { onCancel(); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-yellow-400"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                    )}
                    {onListVersions && (
                      <button
                        onClick={handleOpenHistory}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-foreground"
                      >
                        <History className="h-3 w-3" /> History
                      </button>
                    )}
                    <div className="border-t border-border my-1" />
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-red-500/10 transition-colors text-red-400"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    ) : (
                      <button
                        disabled={isDeleting}
                        onClick={() => { handleDelete(); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 bg-red-500/10 text-red-400 font-medium"
                      >
                        {isDeleting
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Deleting...</>
                          : <><Trash2 className="h-3 w-3" /> Confirm delete</>
                        }
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Prompt */}
      <div className="mt-1.5 ml-5.5 pl-0.5">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              className="text-xs bg-accent/50 border border-border rounded px-2 py-1.5 w-full min-h-[48px] resize-y text-foreground"
              rows={2}
            />
            {isCron && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background/70 p-3">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Routine timing
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Pick when this should run. Lucid stores the durable routine policy underneath.
                  </p>
                </div>

                {!hasEditableRecurringPattern ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-muted-foreground">
                    This routine uses a complex recurring pattern. Choose a simpler cadence below to replace it.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Repeat</Label>
                    <Select
                      value={scheduleMode === 'custom' ? 'weekly' : scheduleMode}
                      onValueChange={(value) => setScheduleMode(value as ScheduleEditorMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Every day</SelectItem>
                        <SelectItem value="weekdays">Weekdays</SelectItem>
                        <SelectItem value="weekly">Every week</SelectItem>
                        <SelectItem value="monthly">Every month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Time</Label>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {scheduleMode === 'monthly'
                      ? 'Day of month'
                      : scheduleMode === 'weekly' || scheduleMode === 'custom'
                        ? 'Day of week'
                        : 'Reference date'}
                  </Label>
                  <DatePicker value={scheduleDate} onChange={setScheduleDate} />
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                  {describeScheduleMode(scheduleMode === 'custom' ? 'weekly' : scheduleMode, scheduleDate, scheduleTime)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.task_prompt}</p>
        )}
      </div>

      {/* Meta row */}
      <div className="mt-2 ml-5.5 pl-0.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        {task.cron_expression && (
          <span className="bg-muted border border-border px-1.5 py-0.5 rounded" title={task.cron_expression}>
            {describeCronExpression(task.cron_expression)}
          </span>
        )}
        {!task.cron_expression && (
          <span className="bg-muted border border-border px-1.5 py-0.5 rounded">One-shot</span>
        )}
        {task.next_run_at && isActive && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelative(task.next_run_at)}
          </span>
        )}
        {task.run_count > 0 && (
          <span>{task.run_count} run{task.run_count !== 1 ? 's' : ''}</span>
        )}
        {task.last_run_at && (
          <span>Last: {formatRelative(task.last_run_at)}</span>
        )}
        {!task.enabled && !isTerminal && (
          <span className="text-yellow-400/70">Paused</span>
        )}
      </div>

      {historyOpen && (
        <div className="mt-2 ml-5.5 pl-0.5 rounded-lg border border-border/60 bg-muted/20 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Routine history
              </p>
              <p className="text-[11px] text-muted-foreground">
                Restore rewinds the routine definition, not past run evidence.
              </p>
            </div>
            {versionsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          {!versionsLoading && versions.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No versions recorded yet. Future edits will appear here.
            </p>
          )}

          {restoreMessage && (
            <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
              {restoreMessage}
            </p>
          )}

          {versions.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/80 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        v{version.version}
                      </span>
                      <span className="text-[11px] text-foreground capitalize">
                        {version.change_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelative(version.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {version.summary ?? version.snapshot.name}
                    </p>
                  </div>
                  {onRestoreVersion && (
                    <button
                      type="button"
                      disabled={restoringVersionId === version.id}
                      onClick={() => handleRestoreVersion(version.id)}
                      className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {restoringVersionId === version.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RotateCcw className="h-3 w-3" />
                      }
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {task.last_error && (
        <div className="mt-1.5 ml-5.5 pl-0.5 flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-400/80 line-clamp-2">{task.last_error}</p>
        </div>
      )}
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────

export function AgentTasksPanelSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="px-2 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 rounded bg-accent/50 animate-pulse" />
            <div className="h-4 w-32 rounded bg-accent/50 animate-pulse" />
            <div className="h-4 w-14 rounded bg-accent/50 animate-pulse" />
          </div>
          <div className="ml-5.5 pl-0.5">
            <div className="h-3 w-3/4 rounded bg-accent/50 animate-pulse" />
          </div>
          <div className="ml-5.5 pl-0.5 flex items-center gap-3">
            <div className="h-3 w-20 rounded bg-accent/50 animate-pulse" />
            <div className="h-3 w-16 rounded bg-accent/50 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

type ScheduleEditorMode = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'

function getInitialScheduleMode(task: ScheduledTask): ScheduleEditorMode {
  if (!task.cron_expression) return 'daily'
  return inferScheduleMode(task.cron_expression)
}

function getInitialScheduleDate(task: ScheduledTask): Date {
  const fromTask = task.next_run_at ?? task.run_at ?? task.created_at
  const parsed = fromTask ? new Date(fromTask) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getInitialScheduleTime(task: ScheduledTask): string {
  if (!task.cron_expression) return '09:00'
  const parts = task.cron_expression.trim().split(/\s+/)
  if (parts.length < 2) return '09:00'
  const minute = normalizeCronNumber(parts[0], 0)
  const hour = normalizeCronNumber(parts[1], 9)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function inferScheduleMode(cronExpression: string): ScheduleEditorMode {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.trim().split(/\s+/)
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return 'custom'
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'daily'
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') return 'weekdays'
  if (dayOfMonth === '*' && month === '*' && /^\d$/.test(dayOfWeek)) return 'weekly'
  if (/^\d+$/.test(dayOfMonth) && month === '*' && dayOfWeek === '*') return 'monthly'
  return 'custom'
}

function buildCronExpression(mode: ScheduleEditorMode, date: Date, time: string): string | null {
  const [rawHour = '09', rawMinute = '00'] = time.split(':')
  const hour = normalizeCronNumber(rawHour, 9)
  const minute = normalizeCronNumber(rawMinute, 0)

  switch (mode) {
    case 'daily':
      return `${minute} ${hour} * * *`
    case 'weekdays':
      return `${minute} ${hour} * * 1-5`
    case 'weekly':
    case 'custom':
      return `${minute} ${hour} * * ${date.getDay()}`
    case 'monthly':
      return `${minute} ${hour} ${date.getDate()} * *`
    default:
      return null
  }
}

function describeScheduleMode(mode: Exclude<ScheduleEditorMode, 'custom'>, date: Date, time: string): string {
  switch (mode) {
    case 'daily':
      return `Runs every day at ${time}.`
    case 'weekdays':
      return `Runs every weekday at ${time}.`
    case 'weekly':
      return `Runs every ${date.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}.`
    case 'monthly':
      return `Runs on day ${date.getDate()} of every month at ${time}.`
  }
}

function normalizeCronNumber(value: string, fallback: number) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) ? numeric : fallback
}

function formatRelative(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const abs = Math.abs(diff)
  const future = diff < 0

  const seconds = Math.floor(abs / 1000)
  if (seconds < 60) return future ? `in ${seconds}s` : `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function createControlledDraftTask(index: number): ScheduledTask {
  const now = new Date().toISOString()
  return {
    id: `builder-task:new:${crypto.randomUUID()}`,
    assistant_id: 'builder-draft',
    org_id: 'builder-draft',
    name: `Routine ${index + 1}`,
    description: `Routine ${index + 1}`,
    task_prompt: 'Run a recurring check-in and report the result.',
    cron_expression: '0 9 * * 1-5',
    timezone: 'UTC',
    run_at: null,
    status: 'pending',
    last_run_at: null,
    last_error: null,
    next_run_at: null,
    run_count: 0,
    retry_count: 0,
    max_retries: 0,
    enabled: true,
    webhook_url: null,
    created_at: now,
    updated_at: now,
  }
}

function areScheduledTasksEquivalent(left: ScheduledTask[], right: ScheduledTask[]): boolean {
  if (left.length !== right.length) return false
  return left.every((task, index) => {
    const other = right[index]
    if (!other) return false
    return (
      task.id === other.id &&
      task.name === other.name &&
      task.description === other.description &&
      task.task_prompt === other.task_prompt &&
      task.cron_expression === other.cron_expression &&
      task.status === other.status &&
      task.enabled === other.enabled
    )
  })
}
