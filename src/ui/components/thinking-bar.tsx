"use client"

import { TextShimmer } from "@/ui/components/text-shimmer"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

type ThinkingBarProps = {
  className?: string
  text?: string
  onStop?: () => void
  stopLabel?: string
  onClick?: () => void
  /** Optional icon src (e.g. animated GIF) shown before the text */
  icon?: string
}

export function ThinkingBar({
  className,
  text = "Thinking",
  onStop,
  stopLabel = "Answer now",
  onClick,
  icon,
}: ThinkingBarProps) {
  const iconEl = icon ? (
    <img src={icon} alt="" className="size-5 rounded-sm" />
  ) : null

  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
        >
          {iconEl}
          <TextShimmer className="font-medium">{text}</TextShimmer>
          <ChevronRight className="text-muted-foreground size-4" />
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {iconEl}
          <TextShimmer className="cursor-default font-medium">{text}</TextShimmer>
        </div>
      )}
      {onStop ? (
        <button
          onClick={onStop}
          type="button"
          className="text-muted-foreground hover:text-foreground border-muted-foreground/50 hover:border-foreground border-b border-dotted text-sm transition-colors"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  )
}
