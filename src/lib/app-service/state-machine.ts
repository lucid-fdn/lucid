import type { AppGenerationStatus } from '@contracts/app-service'
import { AppServiceError } from './errors'

export const TERMINAL_GENERATION_STATUSES = new Set<AppGenerationStatus>([
  'succeeded',
  'failed',
  'cancelled',
])

export const GENERATION_STATUS_TRANSITIONS: Record<AppGenerationStatus, AppGenerationStatus[]> = {
  queued: ['planning', 'cancelled', 'failed'],
  planning: ['awaiting_input', 'generating', 'cancelled', 'failed'],
  awaiting_input: ['planning', 'generating', 'cancelled', 'failed'],
  generating: ['building', 'evaluating', 'cancelled', 'failed'],
  building: ['evaluating', 'deploying', 'cancelled', 'failed'],
  evaluating: ['deploying', 'succeeded', 'cancelled', 'failed'],
  deploying: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
}

export function isTerminalGenerationStatus(status: AppGenerationStatus): boolean {
  return TERMINAL_GENERATION_STATUSES.has(status)
}

export function canTransitionGenerationStatus(
  from: AppGenerationStatus,
  to: AppGenerationStatus,
): boolean {
  return GENERATION_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertGenerationStatusTransition(
  from: AppGenerationStatus,
  to: AppGenerationStatus,
): void {
  if (from === to) return
  if (canTransitionGenerationStatus(from, to)) return

  throw new AppServiceError(
    'validation_failed',
    `Invalid app generation transition from "${from}" to "${to}".`,
    409,
    { details: { from, to } },
  )
}
