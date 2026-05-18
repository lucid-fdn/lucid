/**
 * Supabase Client Adapter
 * 
 * Creates a Supabase client with service role key for worker operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getConfig } from '../config.js'

let client: SupabaseClient | null = null

export function createSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = getConfig()
    
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  
  return client
}

/**
 * Renew lease for an event (heartbeat pattern)
 */
export async function renewLease(
  supabase: SupabaseClient,
  eventId: string,
  workerId: string,
  eventType: 'inbound' | 'outbound'
): Promise<boolean> {
  const { data, error } = await supabase.rpc('renew_event_lease', {
    p_event_id: eventId,
    p_worker_id: workerId,
    p_event_type: eventType,
  })
  
  if (error) {
    console.error(`[lease] Renewal failed for ${eventType} ${eventId}:`, error.message)
    return false
  }
  
  return data === true
}

/**
 * Mark inbound event as done
 */
export async function markInboundDone(
  supabase: SupabaseClient,
  eventId: string
): Promise<void> {
  const { error } = await supabase
    .from('assistant_inbound_events')
    .update({
      status: 'done',
      processed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      locked_until: null,
    })
    .eq('id', eventId)
  
  if (error) {
    console.error(`[inbound] Failed to mark done ${eventId}:`, error.message)
    throw error
  }
}

/**
 * Mark inbound event as failed or pending for retry
 */
export async function markInboundFailed(
  supabase: SupabaseClient,
  eventId: string,
  errorMessage: string,
  attempts: number,
  maxAttempts: number
): Promise<void> {
  const isFinal = attempts >= maxAttempts
  const nextAttempt = isFinal ? null : calculateBackoff(attempts)
  
  const { error } = await supabase
    .from('assistant_inbound_events')
    .update({
      status: isFinal ? 'failed' : 'pending',
      last_error: errorMessage,
      next_attempt_at: nextAttempt,
      locked_at: null,
      locked_by: null,
      locked_until: null,
    })
    .eq('id', eventId)
  
  if (error) {
    console.error(`[inbound] Failed to mark failed ${eventId}:`, error.message)
    throw error
  }
  
  if (isFinal) {
    console.error(`[inbound] 🚨 Event ${eventId} PERMANENTLY FAILED after ${attempts} attempts`)
  }
}

/**
 * Mark outbound event as sent
 */
export async function markOutboundSent(
  supabase: SupabaseClient,
  eventId: string,
  externalMessageId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('assistant_outbound_events')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      external_message_id: externalMessageId,
      last_error: null,
      next_attempt_at: null,
      locked_at: null,
      locked_by: null,
      locked_until: null,
    })
    .eq('id', eventId)
  
  if (error) {
    console.error(`[outbound] Failed to mark sent ${eventId}:`, error.message)
    throw error
  }
}

/**
 * Mark outbound event as failed or pending for retry
 */
export async function markOutboundFailed(
  supabase: SupabaseClient,
  eventId: string,
  errorMessage: string,
  attempts: number,
  maxAttempts: number
): Promise<void> {
  const isFinal = attempts >= maxAttempts
  const nextAttempt = isFinal ? null : calculateBackoff(attempts)
  
  const { error } = await supabase
    .from('assistant_outbound_events')
    .update({
      status: isFinal ? 'failed' : 'pending',
      last_error: errorMessage,
      next_attempt_at: nextAttempt,
      locked_at: null,
      locked_by: null,
      locked_until: null,
    })
    .eq('id', eventId)
  
  if (error) {
    console.error(`[outbound] Failed to mark failed ${eventId}:`, error.message)
    throw error
  }
  
  if (isFinal) {
    console.error(`[outbound] 🚨 Event ${eventId} PERMANENTLY FAILED after ${attempts} attempts`)
  }
}

/**
 * Calculate exponential backoff delay
 * 1min, 2min, 4min, 8min, 16min (capped at 30min)
 */
function calculateBackoff(attempts: number): string {
  const delayMs = Math.min(Math.pow(2, attempts) * 60 * 1000, 30 * 60 * 1000)
  return new Date(Date.now() + delayMs).toISOString()
}
