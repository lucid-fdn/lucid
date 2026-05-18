import type { SupabaseClient } from '@supabase/supabase-js'

export const LEGACY_LOCK_OWNER = 'worker-local'
const DEFAULT_LEASE_MS = 120_000

type PulseEventStatus = 'pending' | 'processing' | string

type PulseLockableEvent = {
  id: string
  status: PulseEventStatus
  locked_by?: string | null
  locked_at?: string | null
  locked_until?: string | null
  attempts?: number | null
}

export const PULSE_EVENT_COLUMNS = {
  assistant_inbound_events: [
    'id',
    'created_at',
    'channel_id',
    'external_message_id',
    'external_user_id',
    'external_chat_id',
    'message_text',
    'message_data',
    'attempts',
    'max_attempts',
    'status',
    'locked_by',
    'locked_at',
    'locked_until',
    'processing_started_at',
  ].join(', '),
  assistant_outbound_events: [
    'id',
    'channel_id',
    'inbound_event_id',
    'conversation_id',
    'message_text',
    'reply_to_external_id',
    'attempts',
    'max_attempts',
    'status',
    'locked_by',
    'locked_at',
    'locked_until',
  ].join(', '),
} as const

export function getPulseEventColumns(table: keyof typeof PULSE_EVENT_COLUMNS): string {
  return PULSE_EVENT_COLUMNS[table]
}

export async function claimOrReclaimPulseEvent<TEvent extends PulseLockableEvent>(params: {
  supabase: SupabaseClient
  table: 'assistant_inbound_events' | 'assistant_outbound_events'
  logPrefix: string
  eventId: string
  event: TEvent
  lockOwner: string
  leaseMs?: number
}): Promise<{ proceed: boolean; event: TEvent }> {
  const { supabase, table, logPrefix, eventId, event, lockOwner } = params
  const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS

  if (event.status !== 'processing' && event.status !== 'pending') {
    return { proceed: false, event }
  }

  if (event.status === 'processing' && event.locked_by !== lockOwner) {
    const legacyOwner = event.locked_by === LEGACY_LOCK_OWNER
    if (!legacyOwner) {
      console.warn(
        `${logPrefix} Event ${eventId} already processing under ${event.locked_by ?? 'unknown lock'} — skipping`,
      )
      return { proceed: false, event }
    }

    const nowIso = new Date().toISOString()
    const lockedUntil = new Date(Date.now() + leaseMs).toISOString()
    const { data: reclaimed, error: reclaimErr } = await supabase
      .from(table)
      .update({
        locked_by: lockOwner,
        locked_at: nowIso,
        locked_until: lockedUntil,
      })
      .eq('id', eventId)
      .eq('status', 'processing')
      .eq('locked_by', LEGACY_LOCK_OWNER)
      .select('id')

    if (reclaimErr) {
      throw new Error(`${logPrefix} reclaim UPDATE failed: ${reclaimErr.message}`)
    }
    if (!reclaimed || reclaimed.length === 0) {
      console.warn(
        `${logPrefix} Event ${eventId} could not reclaim legacy owner ${LEGACY_LOCK_OWNER} — skipping`,
      )
      return { proceed: false, event }
    }

    console.warn(`${logPrefix} Reclaimed ${eventId} from legacy owner ${LEGACY_LOCK_OWNER}`)
    event.locked_by = lockOwner
    event.locked_at = nowIso
    event.locked_until = lockedUntil
  }

  if (event.status === 'pending') {
    const nowIso = new Date().toISOString()
    const lockedUntil = new Date(Date.now() + leaseMs).toISOString()
    const { data: claimed, error: claimErr } = await supabase
      .from(table)
      .update({
        status: 'processing',
        locked_by: lockOwner,
        locked_at: nowIso,
        locked_until: lockedUntil,
        attempts: (event.attempts ?? 0) + 1,
      })
      .eq('id', eventId)
      .eq('status', 'pending')
      .select('id')

    if (claimErr) {
      throw new Error(`${logPrefix} claim UPDATE failed: ${claimErr.message}`)
    }
    if (!claimed || claimed.length === 0) {
      console.warn(`${logPrefix} Event ${eventId} already claimed by another worker — skipping`)
      return { proceed: false, event }
    }

    event.status = 'processing'
    event.locked_by = lockOwner
    event.locked_at = nowIso
    event.locked_until = lockedUntil
    event.attempts = (event.attempts ?? 0) + 1
  }

  return { proceed: true, event }
}

export function isLegacyLockOwner(lockOwner: string | null | undefined): boolean {
  return lockOwner === LEGACY_LOCK_OWNER
}

export function createPulseLockOwner(runId: string): string {
  return `pulse:${runId}`
}

export async function claimOrReclaimPulseEventById<TEvent extends PulseLockableEvent>(params: {
  supabase: SupabaseClient
  table: 'assistant_inbound_events' | 'assistant_outbound_events'
  logPrefix: string
  eventId: string
  lockOwner: string
  leaseMs?: number
}): Promise<{ proceed: boolean; event: TEvent | null }> {
  const { supabase, table, logPrefix, eventId, lockOwner } = params
  const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS
  const nowIso = new Date().toISOString()
  const lockedUntil = new Date(Date.now() + leaseMs).toISOString()

  const { data: claimedPending, error: claimPendingErr } = await supabase
    .from(table)
    .update({
      status: 'processing',
      locked_by: lockOwner,
      locked_at: nowIso,
      locked_until: lockedUntil,
      attempts: 1,
    })
    .eq('id', eventId)
    .eq('status', 'pending')
    .eq('attempts', 0)
    .select(getPulseEventColumns(table))

  if (claimPendingErr) {
    throw new Error(`${logPrefix} claim UPDATE failed: ${claimPendingErr.message}`)
  }
  if (claimedPending && claimedPending.length > 0) {
    return { proceed: true, event: claimedPending[0] as unknown as TEvent }
  }

  const { data: event, error: eventErr } = await supabase
    .from(table)
    .select(getPulseEventColumns(table))
    .eq('id', eventId)
    .single()

  if (eventErr || !event) {
    return { proceed: false, event: null }
  }

  const typedEvent = event as unknown as TEvent
  if (typedEvent.status !== 'processing' && typedEvent.status !== 'pending') {
    return { proceed: false, event: typedEvent }
  }

  if (typedEvent.status === 'pending') {
    const fallbackClaim = await claimOrReclaimPulseEvent({
      supabase,
      table,
      logPrefix,
      eventId,
      event: typedEvent,
      lockOwner,
      leaseMs,
    })
    return {
      proceed: fallbackClaim.proceed,
      event: fallbackClaim.event,
    }
  }

  if (typedEvent.locked_by === lockOwner) {
    return { proceed: true, event: typedEvent }
  }

  if (typedEvent.locked_by !== LEGACY_LOCK_OWNER) {
    console.warn(
      `${logPrefix} Event ${eventId} already processing under ${typedEvent.locked_by ?? 'unknown lock'} — skipping`,
    )
    return { proceed: false, event: typedEvent }
  }

  const { data: reclaimed, error: reclaimErr } = await supabase
    .from(table)
    .update({
      locked_by: lockOwner,
      locked_at: nowIso,
      locked_until: lockedUntil,
    })
    .eq('id', eventId)
    .eq('status', 'processing')
    .eq('locked_by', LEGACY_LOCK_OWNER)
    .select(getPulseEventColumns(table))

  if (reclaimErr) {
    throw new Error(`${logPrefix} reclaim UPDATE failed: ${reclaimErr.message}`)
  }
  if (!reclaimed || reclaimed.length === 0) {
    console.warn(
      `${logPrefix} Event ${eventId} could not reclaim legacy owner ${LEGACY_LOCK_OWNER} — skipping`,
    )
    return { proceed: false, event: typedEvent }
  }

  console.warn(`${logPrefix} Reclaimed ${eventId} from legacy owner ${LEGACY_LOCK_OWNER}`)
  return { proceed: true, event: reclaimed[0] as unknown as TEvent }
}
