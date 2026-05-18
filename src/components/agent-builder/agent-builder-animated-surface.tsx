"use client"

import * as React from "react"
import { motion, type HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"

export const AGENT_BUILDER_SURFACE_LAYOUT_ID = "agent-builder-surface"

export const AGENT_BUILDER_SURFACE_TRANSITION = {
  layout: { type: "spring", stiffness: 220, damping: 24 },
} as const

interface AgentBuilderAnimatedSurfaceProps extends HTMLMotionProps<"div"> {
  sharedLayout?: boolean
}

export function AgentBuilderAnimatedSurface({
  sharedLayout = false,
  className,
  transition,
  children,
  ...props
}: AgentBuilderAnimatedSurfaceProps) {
  return (
    <motion.div
      layout
      layoutId={sharedLayout ? AGENT_BUILDER_SURFACE_LAYOUT_ID : undefined}
      className={cn(
        "max-h-full overflow-hidden rounded-[28px] bg-card/95 text-card-foreground shadow-md ring-1 ring-border backdrop-blur-md",
        className,
      )}
      transition={transition ?? AGENT_BUILDER_SURFACE_TRANSITION}
      {...props}
    >
      {children}
    </motion.div>
  )
}
