import { redactLogMetadata } from '@/lib/logging/safe-log'

export type ProjectSurfaceTelemetryEvent =
  | 'project:overview:view'
  | 'project:canvas:view'
  | 'project:canvas:handoff-focus'
  | 'project:canvas:builder-created-agent'
  | 'project:builder:create-handoff'

export interface ProjectSurfaceTelemetryPayload {
  [key: string]: unknown
}

export function logProjectSurfaceTelemetry(
  event: ProjectSurfaceTelemetryEvent,
  payload: ProjectSurfaceTelemetryPayload = {},
) {
  const safePayload = redactLogMetadata(payload)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lucid:project-surface-telemetry', {
      detail: { event, payload: safePayload },
    }))
  }

  if (process.env.NODE_ENV !== 'development') return
  console.info('[project:surface]', event, safePayload)
}
