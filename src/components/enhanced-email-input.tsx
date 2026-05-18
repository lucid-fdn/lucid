'use client'

import { useState, useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
// import { validateEmail } from '@/lib/email-validation'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

// Simple email validation function
const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isValid = emailRegex.test(email)
  return {
    isValid,
    message: isValid ? 'Valid email' : 'Invalid email format',
    error: isValid ? undefined : 'Invalid email format',
    suggestions: isValid ? [] : ['Check for typos', 'Try common domains like gmail.com']
  }
}

interface EnhancedEmailInputProps {
  name: string
  placeholder?: string
  className?: string
  showSuggestions?: boolean
  onValidationChange?: (isValid: boolean) => void
}

export default function EnhancedEmailInput({
  name,
  placeholder = "Enter your email",
  className = "",
  showSuggestions = true,
  onValidationChange
}: EnhancedEmailInputProps) {
  const { register, formState: { errors }, watch, setValue } = useFormContext()
  const [validationResult, setValidationResult] = useState<ReturnType<typeof validateEmail> | null>(null)
  const [showSuggestionsList, setShowSuggestionsList] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  
  const emailValue = watch(name)
  const fieldError = errors[name]

  // Validate email on change
  useEffect(() => {
    if (emailValue && emailValue.length > 0) {
      const result = validateEmail(emailValue)
      setValidationResult(result)
      onValidationChange?.(result.isValid)
      
      if (showSuggestions && !result.isValid && result.suggestions) {
        setSuggestions(result.suggestions)
        setShowSuggestionsList(true)
      } else {
        setSuggestions([])
        setShowSuggestionsList(false)
      }
    } else {
      setValidationResult(null)
      onValidationChange?.(false)
      setSuggestions([])
      setShowSuggestionsList(false)
    }
  }, [emailValue, showSuggestions, onValidationChange])

  const handleSuggestionClick = (suggestion: string) => {
    setValue(name, suggestion)
    setShowSuggestionsList(false)
  }

  const getInputStyles = () => {
    if (fieldError || (validationResult && !validationResult.isValid)) {
      return 'border-red-500 focus:outline-red-500 focus:ring-red-500'
    }
    if (validationResult && validationResult.isValid) {
      return 'border-green-500 focus:outline-green-500 focus:ring-green-500'
    }
    return 'border-border focus:outline-indigo-500 focus:ring-indigo-500'
  }

  const getStatusIcon = () => {
    if (fieldError || (validationResult && !validationResult.isValid)) {
      return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
    }
    if (validationResult && validationResult.isValid) {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />
    }
    return null
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          {...register(name, {
            required: 'Email is required',
            validate: (value) => {
              const result = validateEmail(value)
              return result.isValid || result.error || 'Invalid email'
            }
          })}
          type="email"
          placeholder={placeholder}
          autoComplete="email"
          className={`w-full rounded-md px-3 py-2 pr-10 text-sm border transition-colors duration-200 ${getInputStyles()} ${className}`}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestionsList(true)
            }
          }}
          onBlur={() => {
            // Delay hiding suggestions to allow clicking
            setTimeout(() => setShowSuggestionsList(false), 200)
          }}
        />
        
        {/* Status Icon */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {getStatusIcon()}
        </div>
      </div>

      {/* Error Message */}
      {(fieldError || (validationResult && !validationResult.isValid)) && (
        <p className="mt-1 text-sm text-red-600">
          {String(fieldError?.message || validationResult?.error || '')}
        </p>
      )}

      {/* Suggestions */}
      {showSuggestionsList && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md bg-popover text-popover-foreground shadow-lg border border-border max-h-32 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent focus:bg-accent focus:outline-none"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Help Text */}
      {!fieldError && !validationResult && (
        <p className="mt-1 text-xs text-muted-foreground">
          Enter a valid email like: user@example.com
        </p>
      )}

      {/* Warning for disposable emails */}
      {validationResult && validationResult.isValid && validationResult.error?.includes('Warning') && (
        <p className="mt-1 text-xs text-yellow-600 flex items-center">
          <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
          {validationResult.error}
        </p>
      )}
    </div>
  )
}
