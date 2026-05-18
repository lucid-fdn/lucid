'use client'

/**
 * StatusSwitch — Switch with inline loading + success feedback.
 *
 * Wraps the shadcn Switch primitive and manages three visual states:
 *   idle     → normal switch
 *   loading  → spinner overlay, switch disabled
 *   success  → brief green tick (auto-resets after 1.4s)
 *
 * Usage:
 *   <StatusSwitch
 *     checked={item.is_active}
 *     onCheckedChange={async (checked) => { await toggle(item, checked) }}
 *     disabled={someOtherBusy}
 *   />
 *
 * onCheckedChange may be sync or async. Throws → stays at current value
 * (parent is responsible for reverting optimistic state on error).
 */

import { useState, useCallback } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

type Status = 'idle' | 'loading' | 'success'

interface StatusSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void | Promise<void>
  disabled?: boolean
  className?: string
}

export function StatusSwitch({ checked, onCheckedChange, disabled, className }: StatusSwitchProps) {
  const [status, setStatus] = useState<Status>('idle')

  const handleChange = useCallback(async (next: boolean) => {
    if (status === 'loading') return
    setStatus('loading')
    try {
      await onCheckedChange(next)
      setStatus('success')
      setTimeout(() => setStatus('idle'), 1400)
    } catch {
      setStatus('idle')
    }
  }, [status, onCheckedChange])

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <Switch
        checked={checked}
        onCheckedChange={handleChange}
        disabled={disabled || status === 'loading'}
        className={cn(
          'scale-75 transition-opacity',
          status === 'success' && 'data-[state=checked]:bg-emerald-500',
          status === 'loading' && 'opacity-0',
        )}
      />

      {/* Loading spinner — sits in place of the switch */}
      {status === 'loading' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </span>
      )}

      {/* Success tick — overlays briefly */}
      {status === 'success' && checked && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Check className="h-3 w-3 text-emerald-500" strokeWidth={3} />
        </span>
      )}
    </span>
  )
}
