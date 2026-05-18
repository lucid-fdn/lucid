'use client'

import { useState, KeyboardEvent } from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X } from 'lucide-react'
import { cn } from "@/lib/utils"

interface TagInputProps {
  label?: string
  name?: string
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  help?: string
  error?: string
  maxTags?: number
  maxLength?: number
  className?: string
}

/**
 * Tag/chip input component
 * For interests, skills, categories, etc.
 * Enter or comma to add tags
 */
export function TagInput({
  label = 'Tags',
  name = 'tags',
  value = [],
  onChange,
  placeholder = 'Type and press Enter',
  help,
  error,
  maxTags = 10,
  maxLength = 32,
  className,
}: TagInputProps) {
  const [input, setInput] = useState('')
  const [localError, setLocalError] = useState<string>()

  const addTag = (tag: string) => {
    const trimmed = tag.trim()

    // Reset local error
    setLocalError(undefined)

    // Validation
    if (!trimmed) return

    if (trimmed.length > maxLength) {
      setLocalError(`Tag must be ${maxLength} characters or less`)
      return
    }

    if (value.includes(trimmed)) {
      setLocalError('Tag already added')
      return
    }

    if (value.length >= maxTags) {
      setLocalError(`Maximum ${maxTags} tags allowed`)
      return
    }

    // Add tag
    onChange([...value, trimmed])
    setInput('')
  }

  const removeTag = (indexToRemove: number) => {
    onChange(value.filter((_, index) => index !== indexToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      // Remove last tag on backspace if input is empty
      removeTag(value.length - 1)
    }
  }

  const handleBlur = () => {
    // Add tag on blur if there's input
    if (input.trim()) {
      addTag(input)
    }
  }

  const displayError = error || localError

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      <Label htmlFor={name} className="text-sm font-medium">
        {label}
        <span className="ml-2 text-xs text-muted-foreground font-normal">
          ({value.length}/{maxTags})
        </span>
      </Label>

      {/* Tags Display + Input */}
      <div
        className={cn(
          'min-h-[2.5rem] w-full rounded-md border border-input bg-background px-3 py-2',
          'flex flex-wrap gap-2 items-center',
          displayError && 'border-destructive',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'
        )}
      >
        {/* Existing Tags */}
        {value.map((tag, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="gap-1 pl-2 pr-1 py-1"
          >
            <span className="text-xs">{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="ml-1 rounded-full hover:bg-background/50 p-0.5"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        {/* Input */}
        {value.length < maxTags && (
          <Input
            id={name}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] border-0 bg-transparent px-0 py-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        )}
      </div>

      {/* Help text */}
      {help && !displayError && (
        <p className="text-sm text-muted-foreground">{help}</p>
      )}

      {/* Error message */}
      {displayError && (
        <p className="text-sm text-destructive">{displayError}</p>
      )}

      {/* Keyboard hints */}
      {!displayError && value.length < maxTags && (
        <p className="text-xs text-muted-foreground">
          Press Enter or comma to add a tag
        </p>
      )}
    </div>
  )
}
