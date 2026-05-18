'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarClock, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CronPicker } from '@/components/shared/cron-picker'
import { cn } from '@/lib/utils'
import { describeCronExpression, getNextRuns } from '@/lib/scheduler/cron-utils'
import type { RoutineTriggerKind } from '@/lib/routines/types'

type ScheduleMode = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'

const TRIGGER_LABELS: Record<RoutineTriggerKind, string> = {
  cron: 'Recurring',
  one_shot: 'Once',
  manual: 'Manual',
  event: 'Event',
  webhook: 'Webhook',
  pm_sync: 'PM sync',
}

export interface RoutineScheduleEditorProps {
  triggerKind: RoutineTriggerKind
  onTriggerKindChange: (value: RoutineTriggerKind) => void
  cronExpression: string
  onCronExpressionChange: (value: string) => void
  runAt: string
  onRunAtChange: (value: string) => void
  timezone: string
  onTimezoneChange: (value: string) => void
  className?: string
}

export function RoutineScheduleEditor({
  triggerKind,
  onTriggerKindChange,
  cronExpression,
  onCronExpressionChange,
  runAt,
  onRunAtChange,
  timezone,
  onTimezoneChange,
  className,
}: RoutineScheduleEditorProps) {
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() => inferScheduleMode(cronExpression))
  const [scheduleDate, setScheduleDate] = useState(() => toDateInputValue(new Date()))
  const [scheduleTime, setScheduleTime] = useState(() => inferScheduleTime(cronExpression))

  useEffect(() => {
    setScheduleMode(inferScheduleMode(cronExpression))
    setScheduleTime(inferScheduleTime(cronExpression))
  }, [cronExpression])

  const preview = useMemo(() => {
    if (triggerKind === 'cron' && cronExpression) {
      const next = getNextRuns(cronExpression, 1)[0]
      return {
        label: describeCronExpression(cronExpression),
        next: next ? formatDateTime(next, timezone) : null,
      }
    }

    if (triggerKind === 'one_shot' && runAt) {
      const date = new Date(runAt)
      return {
        label: 'Runs once',
        next: Number.isNaN(date.getTime()) ? null : formatDateTime(date, timezone),
      }
    }

    return {
      label: TRIGGER_LABELS[triggerKind],
      next: null,
    }
  }, [cronExpression, runAt, timezone, triggerKind])

  return (
    <div className={cn('rounded-lg border bg-muted/20 p-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">Schedule</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose plain-language timing. Lucid stores the durable schedule underneath.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-md">{TRIGGER_LABELS[triggerKind]}</Badge>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="When">
          <Select value={triggerKind} onValueChange={(value) => onTriggerKindChange(value as RoutineTriggerKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cron">Recurring</SelectItem>
              <SelectItem value="one_shot">Once</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="pm_sync">PM sync</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timezone">
          <Input value={timezone} onChange={(event) => onTimezoneChange(event.target.value)} placeholder="UTC" />
        </Field>

        {triggerKind === 'cron' ? (
          <>
            <Field label="Repeat">
              <Select value={scheduleMode} onValueChange={(value) => {
                const nextMode = value as ScheduleMode
                setScheduleMode(nextMode)
                commitCron(nextMode, scheduleDate, scheduleTime)
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {scheduleMode === 'custom' ? (
              <Field label="Custom schedule" className="md:col-span-2">
                <CronPicker value={cronExpression} onChange={onCronExpressionChange} />
              </Field>
            ) : (
              <>
                <Field label="Time">
                  <Input type="time" value={scheduleTime} onChange={(event) => {
                    const nextTime = event.target.value
                    setScheduleTime(nextTime)
                    commitCron(scheduleMode, scheduleDate, nextTime)
                  }} />
                </Field>
                <Field
                  label={scheduleMode === 'monthly' ? 'Day of month' : scheduleMode === 'weekly' ? 'Day of week' : 'Reference date'}
                  className="md:col-span-2"
                >
                  <Input type="date" value={scheduleDate} onChange={(event) => {
                    const nextDate = event.target.value
                    setScheduleDate(nextDate)
                    commitCron(scheduleMode, nextDate, scheduleTime)
                  }} />
                </Field>
              </>
            )}
          </>
        ) : null}

        {triggerKind === 'one_shot' ? (
          <Field label="Run once at" className="md:col-span-2">
            <Input type="datetime-local" value={runAt} onChange={(event) => onRunAtChange(event.target.value)} />
          </Field>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{preview.label}</span>
          {preview.next ? (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Next: {preview.next}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )

  function commitCron(mode: ScheduleMode, dateValue: string, timeValue: string) {
    if (triggerKind !== 'cron' || mode === 'custom') return
    const nextCron = buildCronExpression(mode, dateValue, timeValue)
    if (nextCron && nextCron !== cronExpression) {
      onCronExpressionChange(nextCron)
    }
  }
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function inferScheduleMode(cronExpression: string): ScheduleMode {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.trim().split(/\s+/)
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return 'daily'
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'daily'
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') return 'weekdays'
  if (dayOfMonth === '*' && month === '*' && /^\d$/.test(dayOfWeek)) return 'weekly'
  if (/^\d+$/.test(dayOfMonth) && month === '*' && dayOfWeek === '*') return 'monthly'
  return 'custom'
}

function inferScheduleTime(cronExpression: string): string {
  const [minute = '0', hour = '9'] = cronExpression.trim().split(/\s+/)
  return `${String(normalizeNumber(hour, 9)).padStart(2, '0')}:${String(normalizeNumber(minute, 0)).padStart(2, '0')}`
}

function buildCronExpression(mode: Exclude<ScheduleMode, 'custom'>, dateValue: string, time: string): string | null {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date()
  const [rawHour = '09', rawMinute = '00'] = time.split(':')
  const hour = normalizeNumber(rawHour, 9)
  const minute = normalizeNumber(rawMinute, 0)

  switch (mode) {
    case 'daily':
      return `${minute} ${hour} * * *`
    case 'weekdays':
      return `${minute} ${hour} * * 1-5`
    case 'weekly':
      return `${minute} ${hour} * * ${date.getDay()}`
    case 'monthly':
      return `${minute} ${hour} ${date.getDate()} * *`
  }
}

function normalizeNumber(value: string | number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toDateInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10)
}

function formatDateTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || undefined,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
}
