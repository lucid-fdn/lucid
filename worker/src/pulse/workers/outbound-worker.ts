/**
 * Pulse Outbound Worker
 *
 * Claims from pulse:{outbound}:* ZSETs, delegates to processOutboundEvent().
 *
 * Phase 3N: process() kept as backwards-compatible fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../../config.js'
import type { PulseJob, PulseEventType, PulseConfig } from '../types.js'
import { BaseWorker } from './base-worker.js'
import { PulseQueue } from '../queue.js'
import type { ExecutorRegistry } from '../executors/registry.js'
import type { IncrementalScheduler } from '../dag/scheduler.js'
import { claimOrReclaimPulseEvent, getPulseEventColumns } from '../ownership.js'

export class OutboundWorker extends BaseWorker {
  constructor(
    queue: PulseQueue,
    workerId: string,
    supabase: SupabaseClient,
    appConfig: Config,
    config?: Partial<PulseConfig>,
    executorRegistry?: ExecutorRegistry,
    dagScheduler?: IncrementalScheduler,
  ) {
    super(queue, workerId, config, {
      executorRegistry,
      supabase,
      workerConfig: appConfig,
      dagScheduler,
    })
  }

  getEventType(): PulseEventType {
    return 'outbound'
  }

  async process(job: PulseJob): Promise<void> {
    // Fallback path — used when no executor registry or no matching executor
    const { data: event, error } = await this.supabase!
      .from('assistant_outbound_events')
      .select(getPulseEventColumns('assistant_outbound_events'))
      .eq('id', job.eventId)
      .single()

    if (error || !event) {
      console.error(`[pulse:outbound] Event ${job.eventId} not found:`, error?.message)
      return
    }
    const outboundEvent = event as unknown as {
      id: string
      channel_id: string
      inbound_event_id: string | null
      conversation_id: string | null
      message_text: string
      reply_to_external_id: string | null
      attempts: number
      max_attempts: number
      status: string
      locked_by?: string | null
      locked_at?: string | null
      locked_until?: string | null
    }

    const claimResult = await claimOrReclaimPulseEvent({
      supabase: this.supabase!,
      table: 'assistant_outbound_events',
      logPrefix: '[pulse:outbound]',
      eventId: job.eventId,
      event: outboundEvent,
      lockOwner: this.workerId,
    })
    if (!claimResult.proceed) return

    // Delegate to existing processor
    const { processOutboundEvent } = await import('../../processors/outbound.js')
    await processOutboundEvent(claimResult.event, this.supabase!, this.workerConfig!)
  }
}
