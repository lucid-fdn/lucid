'use client'

import { useState, useEffect, useCallback } from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, Check, X } from 'lucide-react'
import { checkWorkspaceSlugAvailabilityAction } from '@/lib/forms/actions'
import { cn } from "@/lib/utils"

// Simple debounce helper
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null

  const debounced = ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }) as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout)
  }

  return debounced
}

interface WorkspaceSlugFieldProps {
  label?: string
  name?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  help?: string
  className?: string
  inputClassName?: string
}

/**
 * Workspace slug input with real-time availability check
 * Debounced server check, inline feedback
 */
export function WorkspaceSlugField({
  label = 'Workspace URL',
  name = 'slug',
  value,
  onChange,
  error: externalError,
  required,
  disabled,
  placeholder = 'my-workspace',
  help: _help,
  className,
  inputClassName,
}: WorkspaceSlugFieldProps) {
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string>('')
  const [isInitialMount, setIsInitialMount] = useState(true)
  const [initialValue] = useState(value)

  // Debounced availability check
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const checkAvailability = useCallback(
    debounce(async (_slug: unknown) => {
      const slug = _slug as string
      if (!slug || slug.length < 3) {
        setAvailable(null)
        setMessage('')
        setChecking(false)
        return
      }

      setChecking(true)
      
      try {
        const result = await checkWorkspaceSlugAvailabilityAction(slug)
        setAvailable(result.available)
        setMessage(result.message)
      } catch (err) {
        console.error('[workspace-slug-field] Check failed:', err)
        setAvailable(null)
        setMessage('Error checking availability')
      } finally {
        setChecking(false)
      }
    }, 400),
    []
  )

  // Trigger check when value changes (but not on initial mount)
  useEffect(() => {
    // Skip check on initial mount
    if (isInitialMount) {
      setIsInitialMount(false)
      return
    }

    // Only check if value has changed from initial
    if (value && value !== initialValue) {
      checkAvailability(value)
    } else {
      setAvailable(null)
      setMessage('')
    }
  }, [value, checkAvailability, isInitialMount, initialValue])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      checkAvailability.cancel()
    }
  }, [checkAvailability])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Ensure lowercase
    const newValue = e.target.value.toLowerCase()
    onChange(newValue)
  }

  // Determine status
  const showStatus = !externalError && value.length >= 3
  const isAvailable = showStatus && available === true
  const isTaken = showStatus && available === false
  const isChecking = showStatus && checking

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      <Label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {/* Input with status indicator and prefix */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            lucid.foundation/
          </span>
          <div className="relative flex-1">
            <Input
              id={name}
              type="text"
              value={value}
              onChange={handleInputChange}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                'pr-10',
                externalError && 'border-destructive',
                isTaken && 'border-destructive',
                inputClassName
              )}
            />
            {/* Status Icon */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isChecking && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {isTaken && (
                <X className="h-4 w-4 text-destructive" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Availability message — only show when taken */}
      {isTaken && message && !externalError && (
        <p className="text-sm text-destructive">
          {message}
        </p>
      )}

      {/* Error message (overrides availability message) */}
      {externalError && (
        <p className="text-sm text-destructive">{externalError}</p>
      )}
    </div>
  )
}
