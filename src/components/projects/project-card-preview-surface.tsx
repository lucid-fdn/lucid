"use client"

import * as React from "react"
import { FolderKanban } from "lucide-react"
import { CanvasGridSurface } from "@/components/ui/canvas-grid-surface"
import { cn } from "@/lib/utils"

interface ProjectCardPreviewSurfaceProps {
  children?: React.ReactNode
  emptyState?: React.ReactNode
  footerLeft?: React.ReactNode
  footerRight?: React.ReactNode
  className?: string
  compact?: boolean
  topFade?: boolean
}

export function ProjectCardPreviewSurface({
  children,
  emptyState,
  footerLeft,
  footerRight,
  className,
  compact = false,
  topFade = false,
}: ProjectCardPreviewSurfaceProps) {
  return (
    <div
      className={cn(
        compact
          ? "relative flex min-h-[138px] items-center justify-center overflow-hidden rounded-xl bg-secondary/40 px-3 py-3"
          : "relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl bg-secondary/40 px-4 py-5",
        className,
      )}
      style={{
        boxShadow: "inset 0 0 0 0.5px color-mix(in srgb, var(--border) 80%, transparent)",
      }}
    >
      {!compact ? <CanvasGridSurface rounded /> : null}
      {topFade ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-card/95 via-card/55 to-transparent" />
      ) : null}

      <div className="relative z-10" style={{ transform: compact ? "translateY(-4px)" : "translateY(-8px)" }}>
        {children ?? emptyState ?? (
          <div className="grid w-fit grid-cols-3 gap-[10px]">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background text-muted-foreground shadow-sm dark:border-white/10"
              >
                <FolderKanban className="h-4 w-4" />
              </div>
            ))}
          </div>
        )}
      </div>

      {(footerLeft || footerRight) ? (
        <div className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 text-xs",
          compact ? "px-3 py-2.5" : "px-4 py-3",
        )}>
          <div className="min-w-0">{footerLeft}</div>
          <div className="shrink-0">{footerRight}</div>
        </div>
      ) : null}
    </div>
  )
}
