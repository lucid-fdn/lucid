"use client"

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Monitor, Moon, Sun } from 'lucide-react'

const THEME_OPTIONS = [
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
    description: 'Light background with dark text',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    description: 'Dark background with light text',
  },
  {
    value: 'system',
    label: 'System',
    icon: Monitor,
    description: 'Follows your operating system setting',
  },
] as const

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Appearance</h2>
        <p className="text-muted-foreground mt-1">
          Customize how Lucid looks on your device
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">Theme</label>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const isActive = mounted && theme === option.value

            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors duration-150',
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full',
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
