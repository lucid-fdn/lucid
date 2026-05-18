"use client"

import * as React from "react"
import { Bot, CalendarClock, PlugZap } from "lucide-react"

import { CanvasGridSurface } from "@/components/ui/canvas-grid-surface"
import { cn } from "@/lib/utils"

interface ProjectCanvasStageShellProps {
  children: React.ReactNode
  draftName?: string | null
  showDraftGhost?: boolean
  className?: string
  style?: React.CSSProperties
}

export function ProjectCanvasStageShell({
  children,
  draftName,
  showDraftGhost = false,
  className,
  style,
}: ProjectCanvasStageShellProps) {
  return (
    <div className={cn("relative overflow-hidden bg-background", className)} style={style}>
      <CanvasGridSurface gap={24} lineOpacity={0.08} />
      {showDraftGhost ? <DraftAgentGhost name={draftName} /> : null}
      {children}
    </div>
  )
}

function DraftAgentGhost({ name }: { name?: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-[8%] top-[14%] hidden w-[280px] rotate-[-2deg] rounded-3xl border border-border/70 bg-card/35 p-4 opacity-50 shadow-2xl blur-[0.2px] backdrop-blur-md lg:block"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
          <Bot className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground/80">
            {name?.trim() || "Draft agent"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Preparing canvas node</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/55 px-2 py-1">
          <PlugZap className="h-3 w-3" />
          Apps
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/55 px-2 py-1">
          <CalendarClock className="h-3 w-3" />
          Tasks
        </div>
      </div>
    </div>
  )
}
