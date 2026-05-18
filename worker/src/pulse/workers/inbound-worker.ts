/**
 * Pulse Inbound Worker
 *
 * Claims from pulse:{inbound}:* ZSETs, delegates to processInboundEvent().
 * Priority lanes: critical (cross-agent msgs), normal (user msgs), background (retries).
 *
 * Phase 3N: process() is kept as the backwards-compatible fallback.
 * When an ExecutorRegistry is provided (via BaseWorker options), jobs route
 * through the registry first. ProcessorExecutor handles inbound/outbound/scheduled.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../../config.js'
import type { EncryptionService } from '../../crypto/encryption-service.js'
import type { PulseJob, PulseEventType, PulseConfig } from '../types.js'
import { BaseWorker } from './base-worker.js'
import { PulseQueue } from '../queue.js'
import type { ExecutorRegistry } from '../executors/registry.js'
import type { IncrementalScheduler } from '../dag/scheduler.js'
import { repairOrScheduleCompletedInboundDelivery } from '../legacy-inbound-repair.js'
import { claimOrReclaimPulseEventById, isLegacyLockOwner } from '../ownership.js'

export class InboundWorker extends BaseWorker {
  constructor(
    queue: PulseQueue,
    workerId: string,
    supabase: SupabaseClient,
    appConfig: Config,
    encryptionService: EncryptionService,
    config?: Partial<PulseConfig>,
    executorRegistry?: ExecutorRegistry,
    dagScheduler?: IncrementalScheduler,
  ) {
    super(queue, workerId, config, {
      executorRegistry,
      supabase,
      workerConfig: appConfig,
      encryptionService,
      dagScheduler,
    })
  }

  getEventType(): PulseEventType {
    return 'inbound'
  }

  async process(job: PulseJob): Promise<void> {
    const claimResult = await claimOrReclaimPulseEventById({
      supabase: this.supabase!,
      table: 'assistant_inbound_events',
      logPrefix: '[pulse:inbound]',
      eventId: job.eventId,
      lockOwner: this.workerId,
    })

    if (!claimResult.event) {
      console.error(`[pulse:inbound] Event ${job.eventId} not found`)
      return // Complete without error — event may have been deleted
    }

    if (!claimResult.proceed) {
      if (isLegacyLockOwner(claimResult.event.locked_by)) {
        await repairOrScheduleCompletedInboundDelivery({
          supabase: this.supabase!,
          config: this.workerConfig!,
          encryptionService: this.encryptionService!,
          eventId: job.eventId,
          logPrefix: '[pulse:inbound]',
        })
      }
      return
    }

    // Delegate to existing processor
    const { processInboundEvent } = await import('../../processors/inbound.js')
    await processInboundEvent(claimResult.event as any, this.supabase!, this.workerConfig!, this.encryptionService!)

    await repairOrScheduleCompletedInboundDelivery({
      supabase: this.supabase!,
      config: this.workerConfig!,
      encryptionService: this.encryptionService!,
      eventId: job.eventId,
      logPrefix: '[pulse:inbound]',
    })
  }
}
