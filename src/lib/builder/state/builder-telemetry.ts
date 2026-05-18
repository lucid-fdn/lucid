import type { BuilderTelemetryEvent, BuilderTelemetryPayload } from './builder-events'
import { redactLogMetadata } from '@/lib/logging/safe-log'

export function logBuilderTelemetry(event: BuilderTelemetryEvent, payload?: BuilderTelemetryPayload) {
  if (process.env.NODE_ENV !== 'development') return
  console.info('[builder:hook]', event, redactLogMetadata(payload ?? {}))
}
