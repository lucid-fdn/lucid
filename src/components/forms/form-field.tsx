'use client'

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { HTMLInputTypeAttribute } from 'react'

interface FormFieldProps {
  label: string
  name: string
  type?: HTMLInputTypeAttribute | 'textarea' | 'select'
  placeholder?: string
  help?: string
  error?: string
  required?: boolean
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
  register?: Record<string, unknown> // react-hook-form register
  value?: string
  onChange?: (value: string) => void
  className?: string
  rows?: number
}

/**
 * Universal form field component
 * Wraps label, input/textarea/select, error, and help text
 * Integrates with react-hook-form
 */
export function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  help,
  error,
  required,
  disabled,
  options,
  register,
  value,
  onChange,
  className,
  rows = 4,
}: FormFieldProps) {
  const isTextarea = type === 'textarea'
  const isSelect = type === 'select'

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      <Label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {/* Input/Textarea/Select */}
      {isSelect ? (
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          {...register}
        >
          <SelectTrigger
            id={name}
            className={cn(
              'w-full',
              error && 'border-destructive focus:ring-destructive'
            )}
          >
            <SelectValue placeholder={placeholder || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : isTextarea ? (
        <Textarea
          id={name}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            'resize-none',
            error && 'border-destructive focus:ring-destructive'
          )}
          {...register}
        />
      ) : (
        <Input
          id={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(error && 'border-destructive focus:ring-destructive')}
          {...register}
        />
      )}

      {/* Help text */}
      {help && !error && (
        <p className="text-sm text-muted-foreground">{help}</p>
      )}

      {/* Error message */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
