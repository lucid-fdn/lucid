'use client'

import { cn } from '@/lib/utils'
import { Radio, Shield } from 'lucide-react'

export type ChannelMode = 'relay' | 'native'

interface ChannelModeSelectorProps {
  value: ChannelMode
  onChange: (mode: ChannelMode) => void
  disabled?: boolean
}

const MODES = [
  {
    id: 'relay' as const,
    label: 'C1 — REST Relay',
    description: 'Control plane owns all channel credentials and delivery. Runtime only runs the agent brain. Most secure.',
    icon: Shield,
    color: 'border-blue-500/40 bg-blue-500/5',
    selectedColor: 'border-blue-500 bg-blue-500/10',
    dotColor: 'bg-blue-500',
    badge: 'Recommended',
  },
  {
    id: 'native' as const,
    label: 'C2a — Self-Sovereign',
    description: 'Runtime runs channel adapters in-process with its own bot tokens. Lower latency, full channel control.',
    icon: Radio,
    color: 'border-violet-500/40 bg-violet-500/5',
    selectedColor: 'border-violet-500 bg-violet-500/10',
    dotColor: 'bg-violet-500',
    badge: 'Advanced',
  },
]

export function ChannelModeSelector({ value, onChange, disabled }: ChannelModeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">Channel mode</label>
      <div className="grid grid-cols-1 gap-2">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const isSelected = value === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode.id)}
              className={cn(
                'rounded-lg border p-3 text-left transition-all',
                isSelected ? mode.selectedColor : 'border-border/50 hover:border-border',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-2.5">
                {/* Radio dot */}
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                  isSelected ? 'border-current' : 'border-muted-foreground/30',
                )}>
                  {isSelected && <div className={cn('h-1.5 w-1.5 rounded-full', mode.dotColor)} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium">{mode.label}</span>
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                      mode.id === 'relay'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-violet-500/10 text-violet-400',
                    )}>
                      {mode.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                    {mode.description}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
