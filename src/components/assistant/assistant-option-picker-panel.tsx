'use client'

import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface AssistantOptionPickerItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
  badge?: string
}

interface AssistantOptionPickerPanelProps {
  title: string
  description?: string
  items: AssistantOptionPickerItem[]
  selectedId?: string | null
  onSelect: (id: string) => void
}

export function AssistantOptionPickerPanel({
  title,
  description,
  items,
  selectedId = null,
  onSelect,
}: AssistantOptionPickerPanelProps) {
  return (
    <>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const selected = item.id === selectedId
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return
                onSelect(item.id)
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-150 text-left group',
                item.disabled && 'cursor-not-allowed opacity-50',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-border/40 hover:border-border hover:bg-card/40',
              )}
            >
              {item.icon ? (
                <div className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  {item.icon}
                </div>
              ) : null}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-xs font-medium transition-colors',
                  selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                )}>
                  {item.label}
                </p>
                {item.description ? (
                  <p className="text-[10px] text-muted-foreground">{item.description}</p>
                ) : null}
              </div>
              {item.badge ? (
                <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {item.badge}
                </span>
              ) : null}
              {selected ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : null}
            </button>
          )
        })}
      </div>
    </>
  )
}
