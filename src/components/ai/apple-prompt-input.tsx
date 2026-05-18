'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tokens } from '@/lib/design/tokens'

interface ApplePromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  className?: string
}

/**
 * Apple-Inspired Prompt Input
 * Large breathing textarea with Apple aesthetics
 * 
 * Features:
 * - Breathing animation on hover (scale 1.02)
 * - Auto-resize based on content
 * - Character counter
 * - Submit on Enter, newline on Shift+Enter
 * - Voice input button (mobile placeholder)
 * - Design token compliant
 */
export function ApplePromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Describe the workflow you want to create...",
  disabled = false,
  maxLength = 2000,
  className,
}: ApplePromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to recalculate
    textarea.style.height = 'auto'
    // Set to scrollHeight, with min/max constraints
    const newHeight = Math.max(140, Math.min(textarea.scrollHeight, 400))
    textarea.style.height = `${newHeight}px`
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSubmit()
      }
    }
  }

  const charCount = value.length
  const charLimit = maxLength
  const _isNearLimit = charCount > charLimit * 0.9

  return (
    <div className={cn("relative group", className)}>
      <div className="relative">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          className={cn(
            // Base styles
            "w-full resize-none font-sans text-base leading-relaxed",
            // Spacing (8pt grid) - extra padding right for button
            "px-6 py-5 pr-14",  // 56px right padding for button
            // Border & background
            "rounded-xl border-1",
            "bg-porcelain/50 dark:bg-muted/50 backdrop-blur-sm",
            // Focus state
            isFocused
              ? "border-white/20"
              : "border-mist dark:border-border",
            // Hover state
            !disabled && !isFocused && "hover:shadow-md",
            // Transitions
            "transition-all duration-120 ease-apple",
            // Disabled state
            disabled && "opacity-50 cursor-not-allowed",
            // Remove default outline
            "focus:outline-none",
            // Placeholder
            "placeholder:text-graphite-400 dark:placeholder:text-muted-foreground"
          )}
          style={{
            minHeight: '140px',
            fontFamily: tokens.font.family.sans,
          }}
        />

        {/* Submit Button - Inside textarea, bottom right */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            "absolute bottom-0 right-0 m-2",
            "w-8 h-8 rounded-full",
            "flex items-center justify-center",
            "transition-all duration-120",
            // Enabled state
            value.trim() && !disabled
              ? "bg-lucid text-white hover:bg-lucid/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
          aria-label="Submit"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>

      {/* Voice Input Button - Bottom Left (Mobile Only, Placeholder) */}
      <button
        type="button"
        className={cn(
          "absolute bottom-3 left-4",
          "md:hidden", // Only show on mobile
          "w-8 h-8 rounded-full",
          "flex items-center justify-center",
          "bg-muted hover:bg-muted/80",
          "text-muted-foreground hover:text-foreground",
          "transition-all duration-120",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        disabled={disabled}
        onClick={() => {
          // TODO: Implement voice input
          alert('Voice input coming soon!')
        }}
        aria-label="Voice input"
      >
        <Mic className="w-4 h-4" />
      </button>

      {/* Helper Text - Below Input */}
      <p className={cn(
        "mt-2 text-xs",
        "transition-colors duration-200",
        isFocused ? "text-foreground" : "text-muted-foreground"
      )}>
        Press <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">Enter</kbd> to submit
        · <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">Shift+Enter</kbd> for new line
      </p>
    </div>
  )
}
