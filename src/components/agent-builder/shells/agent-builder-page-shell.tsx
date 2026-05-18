"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function AgentBuilderPageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("h-full min-h-0 overflow-hidden rounded-[28px] bg-card/95 text-card-foreground shadow-md ring-1 ring-border backdrop-blur-md", className)}>
      {children}
    </div>
  )
}
