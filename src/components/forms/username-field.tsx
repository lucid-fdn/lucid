'use client'

import { useState, useEffect, useCallback } from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, Check, X } from 'lucide-react'
import { checkHandleAvailabilityAction } from '@/lib/forms/actions'
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

interface UsernameFieldProps {
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
 * Username/handle input with real-time availability check
 * Debounced server check, inline feedback
 */
export function UsernameField({
  label = 'Username',
  name = 'handle',
  value,
  onChange,
  error: externalError,
  required,
  disabled,
  placeholder = 'your_username',
  help = 'Lowercase, 3-32 chars. a-z, 0-9, _',
  className,
  inputClassName,
}: UsernameFieldProps) {
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string>('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isInitialMount, setIsInitialMount] = useState(true)
  const [initialValue] = useState(value)

  // Debounced availability check
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const checkAvailability = useCallback(
    debounce(async (_handle: unknown) => {
      const handle = _handle as string
      if (!handle || handle.length < 3) {
          setAvailable(null)
          setMessage('')
          setChecking(false)
          return
        }

        setChecking(true)

        try {
          const result = await checkHandleAvailabilityAction(handle)
          setAvailable(result.available)
          setMessage(result.message)
          setSuggestions(result.suggestions || [])
        } catch (err) {
          console.error('[username-field] Check failed:', err)
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
      setSuggestions([])
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

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion)
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

      {/* Input with status indicator */}
      <div className="relative">
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
            isAvailable && 'border-green-500',
            inputClassName
          )}
        />

        {/* Status Icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isChecking && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {isAvailable && (
            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
          )}
          {isTaken && (
            <X className="h-4 w-4 text-destructive" />
          )}
        </div>
      </div>

      {/* Help text */}
      {help && !externalError && !message && (
        <p className="text-sm text-muted-foreground">{help}</p>
      )}

      {/* Availability message */}
      {showStatus && message && !externalError && (
        <p
          className={cn(
            'text-sm',
            isAvailable && 'text-green-600 dark:text-green-400',
            isTaken && 'text-destructive',
            checking && 'text-muted-foreground'
          )}
        >
          {message}
        </p>
      )}

      {/* Error message (overrides availability message) */}
      {externalError && (
        <p className="text-sm text-destructive">{externalError}</p>
      )}

      {/* Suggestions */}
      {isTaken && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground transition-colors duration-120"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
