'use client'

/**
 * CronPicker — Compact, reusable cron schedule editor.
 *
 * Two modes:
 *   1. Preset: dropdown with common schedules (every 5min, hourly, daily, etc.)
 *   2. Custom: raw cron expression input with validation
 *
 * Uses the centralized cron-utils for presets, validation, and descriptions.
 * Designed for inline use (task panels, forms) — not a full-page builder.
 */

import { useState, useEffect, useCallback } from 'react'
import { Clock, ChevronDown, Pen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CRON_PRESETS,
  CRON_PRESET_LABELS,
  validateCronExpression,
  describeCronExpression,
  getNextRuns,
} from '@/lib/scheduler/cron-utils'

// ── Presets for the compact picker ──────────────────────────────────

interface PresetGroup {
  label: string
  presets: { value: string; label: string }[]
}

const PICKER_PRESET_GROUPS: PresetGroup[] = [
  {
    label: 'Minutes',
    presets: [
      { value: CRON_PRESETS.EVERY_MINUTE, label: 'Every minute' },
      { value: CRON_PRESETS.EVERY_5_MINUTES, label: 'Every 5 minutes' },
      { value: CRON_PRESETS.EVERY_10_MINUTES, label: 'Every 10 minutes' },
      { value: CRON_PRESETS.EVERY_15_MINUTES, label: 'Every 15 minutes' },
      { value: CRON_PRESETS.EVERY_30_MINUTES, label: 'Every 30 minutes' },
    ],
  },
  {
    label: 'Hours',
    presets: [
      { value: CRON_PRESETS.EVERY_HOUR, label: 'Every hour' },
      { value: CRON_PRESETS.EVERY_2_HOURS, label: 'Every 2 hours' },
      { value: CRON_PRESETS.EVERY_3_HOURS, label: 'Every 3 hours' },
      { value: CRON_PRESETS.EVERY_4_HOURS, label: 'Every 4 hours' },
      { value: CRON_PRESETS.EVERY_6_HOURS, label: 'Every 6 hours' },
      { value: CRON_PRESETS.EVERY_8_HOURS, label: 'Every 8 hours' },
      { value: CRON_PRESETS.EVERY_12_HOURS, label: 'Every 12 hours' },
    ],
  },
  {
    label: 'Daily',
    presets: [
      { value: CRON_PRESETS.DAILY_6AM, label: 'Every day at 6:00 AM' },
      { value: CRON_PRESETS.DAILY_9AM, label: 'Every day at 9:00 AM' },
      { value: CRON_PRESETS.DAILY_NOON, label: 'Every day at noon' },
      { value: CRON_PRESETS.DAILY_6PM, label: 'Every day at 6:00 PM' },
      { value: CRON_PRESETS.DAILY_MIDNIGHT, label: 'Every day at midnight' },
      { value: CRON_PRESETS.WEEKDAYS_9AM, label: 'Weekdays at 9:00 AM' },
      { value: CRON_PRESETS.WEEKENDS_10AM, label: 'Weekends at 10:00 AM' },
    ],
  },
  {
    label: 'Weekly',
    presets: [
      { value: CRON_PRESETS.WEEKLY_MONDAY_9AM, label: 'Monday at 9:00 AM' },
      { value: CRON_PRESETS.WEEKLY_FRIDAY_5PM, label: 'Friday at 5:00 PM' },
      { value: CRON_PRESETS.WEEKLY_SUNDAY_MIDNIGHT, label: 'Sunday at midnight' },
    ],
  },
  {
    label: 'Monthly & longer',
    presets: [
      { value: CRON_PRESETS.MONTHLY_FIRST_9AM, label: '1st of month at 9 AM' },
      { value: CRON_PRESETS.MONTHLY_FIRST, label: '1st of month at midnight' },
      { value: CRON_PRESETS.MONTHLY_15TH, label: '15th of month at midnight' },
      { value: CRON_PRESETS.BIWEEKLY_MONDAY_9AM, label: '1st & 15th at 9 AM' },
      { value: CRON_PRESETS.QUARTERLY_FIRST, label: 'Quarterly (Jan/Apr/Jul/Oct)' },
      { value: CRON_PRESETS.YEARLY_JAN_FIRST, label: 'Yearly — January 1st' },
    ],
  },
]

// Flat list for isPreset check
const ALL_PRESET_VALUES = PICKER_PRESET_GROUPS.flatMap(g => g.presets.map(p => p.value))

// ── Component ────────────────────────────────────────────────────────

interface CronPickerProps {
  /** Current cron expression */
  value: string
  /** Called when the expression changes (only valid expressions) */
  onChange: (expression: string) => void
  /** Show next run preview (default: true) */
  showNextRun?: boolean
  /** Additional className for the root */
  className?: string
}

export function CronPicker({
  value,
  onChange,
  showNextRun = true,
  className,
}: CronPickerProps) {
  const isPreset = ALL_PRESET_VALUES.includes(value)
  const [mode, setMode] = useState<'preset' | 'custom'>(isPreset || !value ? 'preset' : 'custom')
  const [customValue, setCustomValue] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync external value changes
  useEffect(() => {
    const nowPreset = ALL_PRESET_VALUES.includes(value)
    if (nowPreset) {
      setMode('preset')
      setError(null)
    }
    setCustomValue(value || '')
  }, [value])

  const handlePresetSelect = useCallback((preset: string) => {
    setError(null)
    setCustomValue(preset)
    onChange(preset)
    setOpen(false)
  }, [onChange])

  const handleCustomChange = useCallback((input: string) => {
    setCustomValue(input)
    const result = validateCronExpression(input)
    if (result.valid) {
      setError(null)
      onChange(input)
    } else {
      setError(result.error || 'Invalid expression')
    }
  }, [onChange])

  const switchToCustom = useCallback(() => {
    setMode('custom')
    setOpen(false)
  }, [])

  // Description + next run
  const description = value ? describeCronExpression(value) : null
  const nextRun = showNextRun && value ? getNextRuns(value, 1)[0] : null
  const nextRunLabel = nextRun
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(nextRun)
    : null

  return (
    <div className={cn('space-y-1.5', className)}>
      {mode === 'preset' ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn(
              'flex items-center justify-between w-full text-xs',
              'bg-muted/50 border border-border rounded px-2.5 py-1.5',
              'hover:bg-muted transition-colors text-left',
            )}
          >
            <span className="truncate">
              {CRON_PRESET_LABELS[value] || description || 'Select schedule'}
            </span>
            <ChevronDown className={cn('h-3 w-3 ml-1.5 text-muted-foreground flex-shrink-0 transition-transform', open && 'rotate-180')} />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 w-full min-w-[220px] max-h-[320px] overflow-y-auto rounded-lg border bg-popover shadow-md py-1">
                {PICKER_PRESET_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <div className="border-t my-1" />}
                    <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.presets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => handlePresetSelect(preset.value)}
                        className={cn(
                          'flex items-center w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors',
                          value === preset.value && 'bg-muted font-medium',
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="border-t my-1" />
                <button
                  type="button"
                  onClick={switchToCustom}
                  className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-muted-foreground"
                >
                  <Pen className="h-3 w-3" />
                  Custom expression
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="*/5 * * * *"
              className={cn(
                'flex-1 text-xs font-mono bg-muted/50 border rounded px-2.5 py-1.5',
                error ? 'border-red-500/50' : 'border-border',
              )}
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => { setMode('preset'); setError(null) }}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover:bg-muted transition-colors whitespace-nowrap"
            >
              Presets
            </button>
          </div>
          {error && (
            <p className="text-[10px] text-red-400">{error}</p>
          )}
        </div>
      )}

      {/* Description + next run */}
      {description && !error && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
          <span>{description}</span>
          {nextRunLabel && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                Next: {nextRunLabel}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
