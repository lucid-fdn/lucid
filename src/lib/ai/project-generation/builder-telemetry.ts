import 'server-only'

import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log'

type BuilderTelemetryLevel = 'debug' | 'info' | 'warn' | 'error'

function consoleForLevel(level: BuilderTelemetryLevel) {
  if (level === 'debug') return console.debug
  if (level === 'warn') return console.warn
  if (level === 'error') return console.error
  return console.info
}

export function logBuilderTelemetry(
  event: string,
  metadata: Record<string, unknown> = {},
  level: BuilderTelemetryLevel = 'info',
): void {
  consoleForLevel(level)(event, redactLogMetadata(metadata))
}

export function logBuilderError(
  event: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
): void {
  console.error(event, redactLogMetadata({
    ...metadata,
    error: summarizeError(error),
  }))
}
