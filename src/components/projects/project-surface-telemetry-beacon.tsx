"use client"

import * as React from "react"

import {
  logProjectSurfaceTelemetry,
  type ProjectSurfaceTelemetryEvent,
} from "@/lib/projects/surface-telemetry"

interface ProjectSurfaceTelemetryBeaconProps {
  event: ProjectSurfaceTelemetryEvent
  payload?: Record<string, unknown>
}

export function ProjectSurfaceTelemetryBeacon({
  event,
  payload = {},
}: ProjectSurfaceTelemetryBeaconProps) {
  React.useEffect(() => {
    logProjectSurfaceTelemetry(event, payload)
  }, [event, payload])

  return null
}
