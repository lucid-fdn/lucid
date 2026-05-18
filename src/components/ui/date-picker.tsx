'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: Date | null
  onChange: (value: Date) => void
  placeholder?: string
  className?: string
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => startOfMonth(value ?? new Date()))

  React.useEffect(() => {
    if (value) {
      setMonth(startOfMonth(value))
    }
  }, [value])

  const days = React.useMemo(() => buildCalendarDays(month), [month])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start rounded-lg text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          {value ? formatDateLabel(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] space-y-3 p-3">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-foreground">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
              {label}
            </div>
          ))}
          {days.map((day) => {
            const isSelected = value ? isSameDay(day.date, value) : false
            return (
              <Button
                key={day.date.toISOString()}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                className={cn(
                  'h-9 w-9 rounded-md p-0 text-sm',
                  !day.isCurrentMonth && 'text-muted-foreground/50',
                )}
                onClick={() => {
                  onChange(day.date)
                  setOpen(false)
                }}
              >
                {day.date.getDate()}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function buildCalendarDays(month: Date) {
  const first = startOfMonth(month)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      isCurrentMonth: date.getMonth() === month.getMonth(),
    }
  })
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
