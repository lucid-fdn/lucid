import type { PulseEventType, PulsePriority } from '@contracts/pulse'
import { PulseKeys } from '@contracts/pulse'

export const CONTROL_PLANE_CONSUMER_GROUP = 'pulse-workers'
export const CONTROL_PLANE_STREAM_MAXLEN = 10_000
export const CONTROL_PLANE_DEFAULT_WAIT_MS = 15_000
export const CONTROL_PLANE_MAX_WAIT_MS = 30_000
export const CONTROL_PLANE_INFLIGHT_TTL_SECONDS = 300
export const CONTROL_PLANE_RATE_LIMIT_WINDOW_MS = 60_000
export const CONTROL_PLANE_RATE_LIMIT_WINDOW_SECONDS = 60
export const CONTROL_PLANE_RATE_LIMIT_MAX_OPS = 120

export const PULSE_EVENT_TYPES: PulseEventType[] = ['inbound', 'outbound', 'scheduled', 'human_task']
export const PULSE_PRIORITIES: PulsePriority[] = ['critical', 'normal', 'background']

export function pulseStreamsFor(eventType: PulseEventType): string[] {
  return PULSE_PRIORITIES.map((priority) => PulseKeys.stream(eventType, priority))
}
