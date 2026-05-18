import type { SupabaseClient } from '@supabase/supabase-js'

import {
  markInboundDone,
  markInboundFailed,
  markOutboundFailed,
  markOutboundSent,
} from '../../adapters/supabase.js'
import { getCorrelationFields } from '../../observability/tracing.js'

export type InteractiveLifecycleStage =
  | 'received'
  | 'claimed'
  | 'processed'
  | 'outbound_created'
  | 'outbound_sent'
  | 'done'
  | 'failed'

export interface LifecycleTraceContext {
  traceId: string
  spanId: string
}

export interface LifecycleUpdate {
  stage: InteractiveLifecycleStage
  lifecycleTrace: LifecycleTraceContext
}

export function getLifecycleTraceContext(explicitTraceId?: string): LifecycleTraceContext {
  const correlation = getCorrelationFields()
  return {
    traceId: explicitTraceId || correlation.trace_id,
    spanId: correlation.span_id,
  }
}

export async function markInboundStage(params: {
  supabase: SupabaseClient
  eventId: string
  stage: Extract<InteractiveLifecycleStage, 'done' | 'failed'>
  attempts?: number
  maxAttempts?: number
  errorMessage?: string
}): Promise<void> {
  if (params.stage === 'done') {
    await markInboundDone(params.supabase, params.eventId)
    return
  }

  await markInboundFailed(
    params.supabase,
    params.eventId,
    params.errorMessage || 'Unknown inbound lifecycle failure',
    params.attempts ?? 1,
    params.maxAttempts ?? 1,
  )
}

export async function markOutboundStage(params: {
  supabase: SupabaseClient
  eventId: string
  stage: Extract<InteractiveLifecycleStage, 'outbound_sent' | 'failed'>
  externalMessageId?: string | null
  attempts?: number
  maxAttempts?: number
  errorMessage?: string
}): Promise<void> {
  if (params.stage === 'outbound_sent') {
    await markOutboundSent(params.supabase, params.eventId, params.externalMessageId ?? null)
    return
  }

  await markOutboundFailed(
    params.supabase,
    params.eventId,
    params.errorMessage || 'Unknown outbound lifecycle failure',
    params.attempts ?? 1,
    params.maxAttempts ?? 1,
  )
}

