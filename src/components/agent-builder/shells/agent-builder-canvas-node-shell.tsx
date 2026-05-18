"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function AgentBuilderCanvasNodeShell({
  children,
  selected,
  className,
}: {
  children: React.ReactNode
  selected?: boolean
  className?: string
}) {
  return (
    <div className={cn("relative rounded-[28px] transition", selected && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background", className)}>
      {children}
    </div>
  )
}
