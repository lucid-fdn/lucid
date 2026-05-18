/**
 * Runtime event classification — durable vs noisy.
 *
 * Durable events always persist. Noisy events are sampled at a configurable rate
 * to prevent runtime_events table growth from becoming a bottleneck.
 */

// `channel_*` lifecycle events are durable because the dedicated runtime feed
// is the only place an operator sees that a self-sovereign channel actually
// connected (or dropped). Sampling `channel_connected` at 10% means most
// "Did the bot start?" answers would be wrong. `channel_deactivated` signals
// operator-required action (rotate credentials) and must never be sampled.
const DURABLE_EVENT_TYPES = new Set([
  'error',
  'message_sent',
  'native_mutation_candidate',
  'channel_connected',
  'channel_disconnected',
  'channel_deactivated',
])
const DURABLE_SEVERITIES = new Set(['error', 'warning', 'critical'])

// 10% sampling for noisy info-level events
const NOISY_SAMPLE_RATE = 0.1

export interface ClassifiedEvent {
  shouldPersist: boolean
  reason: 'durable_type' | 'durable_severity' | 'sampled_in' | 'sampled_out'
}

export function classifyEvent(
  eventType: string,
  severity: string = 'info'
): ClassifiedEvent {
  // Durable by type
  if (DURABLE_EVENT_TYPES.has(eventType)) {
    return { shouldPersist: true, reason: 'durable_type' }
  }

  // Durable by severity
  if (DURABLE_SEVERITIES.has(severity)) {
    return { shouldPersist: true, reason: 'durable_severity' }
  }

  // Noisy — sample
  if (Math.random() < NOISY_SAMPLE_RATE) {
    return { shouldPersist: true, reason: 'sampled_in' }
  }

  return { shouldPersist: false, reason: 'sampled_out' }
}

/** Check if event type is durable (always persists regardless of severity) */
export function isDurableEventType(eventType: string): boolean {
  return DURABLE_EVENT_TYPES.has(eventType)
}
