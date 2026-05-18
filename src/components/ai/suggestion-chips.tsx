'use client'

import { cn } from '@/lib/utils'

interface SuggestionChipsProps {
  suggestions?: string[]
  onSelect: (suggestion: string) => void
  disabled?: boolean
  className?: string
}

const DEFAULT_SUGGESTIONS = [
  "Send Telegram alerts on Hyperliquid liquidations",
  "Post Polymarket odds changes to X (Twitter)",
  "Monitor whale wallet movements on-chain",
  "Send Slack alert when wallet balance drops"
]

/**
 * Suggestion Chips Component
 * Clickable suggestion pills with breathing hover animation
 * 
 * Features:
 * - Apple-style rounded pills
 * - Breathing animation on hover
 * - One-click populate
 * - Horizontal scroll on mobile
 * - Wrap on desktop
 */
export function SuggestionChips({
  suggestions = DEFAULT_SUGGESTIONS,
  onSelect,
  disabled = false,
  className,
}: SuggestionChipsProps) {
  return (
    <div className={cn("space-y-3 m-auto", className)}>
      {/* Chips Container */}
      <div className={cn(
        // Mobile: horizontal scroll
        "flex gap-2 overflow-x-auto pb-2",
        // Desktop: wrap and center
        "md:flex-wrap md:overflow-x-visible md:justify-center",
        // Hide scrollbar
        "scrollbar-hide",
        // Smooth scroll
        "scroll-smooth"
      )}>
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => !disabled && onSelect(suggestion)}
            disabled={disabled}
            className={cn(
              // v0-style base
              "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5",
              "whitespace-nowrap text-nowrap",
              // v0-style sizing
              "h-8 px-3",
              // v0-style border & shape
              "rounded-full border-none shadow-sm",
              // v0-style background
              "bg-muted",
              // v0-style typography
              "text-[13px]",
              "text-white/50",
              // v0-style hover
              !disabled && "hover:bg-muted/80 hover:text-foreground",
              // v0-style focus
              !disabled && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              // v0-style transition
              "transition-all",
              // v0-style disabled
              disabled && "cursor-not-allowed bg-muted/50 text-muted-foreground ring-0",
              // Icon support
              "[&>svg]:pointer-events-none [&>svg]:size-4 [&_svg]:shrink-0"
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
