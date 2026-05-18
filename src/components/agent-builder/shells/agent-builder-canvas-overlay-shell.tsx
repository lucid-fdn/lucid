"use client"

import * as React from "react"
import { AgentBuilderAnimatedSurface } from "@/components/agent-builder/agent-builder-animated-surface"

export function AgentBuilderCanvasOverlayShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-4 z-40 flex items-center justify-center px-6">
      <AgentBuilderAnimatedSurface sharedLayout className="h-full w-full max-w-[1120px]">
        {children}
      </AgentBuilderAnimatedSurface>
    </div>
  )
}
