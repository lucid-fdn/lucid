"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface CanvasGridSurfaceProps {
  className?: string
  gap?: number
  lineOpacity?: number
  rounded?: boolean
}

export function CanvasGridSurface({
  className,
  gap = 24,
  lineOpacity = 0.08,
  rounded = false,
}: CanvasGridSurfaceProps) {
  const borderRadius = rounded ? "inherit" : undefined

  return (
    <>
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", className)}
        style={{
          borderRadius,
          backgroundImage: [
            `linear-gradient(to right, color-mix(in srgb, var(--foreground) ${lineOpacity * 100}%, transparent) 1px, transparent 1px)`,
            `linear-gradient(to bottom, color-mix(in srgb, var(--foreground) ${lineOpacity * 100}%, transparent) 1px, transparent 1px)`,
          ].join(", "),
          backgroundSize: `${gap}px ${gap}px`,
        }}
      />
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", className)}
        style={{
          borderRadius,
          background: "radial-gradient(circle at center, rgba(128,128,128,0.04), transparent 60%)",
        }}
      />
    </>
  )
}
