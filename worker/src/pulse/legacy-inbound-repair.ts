import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import type { EncryptionService } from '../crypto/encryption-service.js'

const legacyRepairTimers = new Map<string, ReturnType<typeof setTimeout>>()

export async function repairOrScheduleCompletedInboundDelivery(params: {
  supabase: SupabaseClient
  config: Config
  encryptionService?: EncryptionService
  eventId: string
  delayMs?: number
  logPrefix: string
}): Promise<boolean> {
  const { repairCompletedInboundDelivery } = await import('../processors/inbound.js')
  const repaired = await repairCompletedInboundDelivery({
    supabase: params.supabase,
    config: params.config,
    encryptionService: params.encryptionService,
    eventId: params.eventId,
  })

  if (repaired) {
    const existingTimer = legacyRepairTimers.get(params.eventId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      legacyRepairTimers.delete(params.eventId)
    }
    return true
  }

  const existingTimer = legacyRepairTimers.get(params.eventId)
  if (existingTimer) clearTimeout(existingTimer)

  const timer = setTimeout(async () => {
    legacyRepairTimers.delete(params.eventId)
    try {
      const { repairCompletedInboundDelivery: retryRepairCompletedInboundDelivery } = await import('../processors/inbound.js')
      await retryRepairCompletedInboundDelivery({
        supabase: params.supabase,
        config: params.config,
        encryptionService: params.encryptionService,
        eventId: params.eventId,
      })
    } catch (error) {
      console.error(
        `${params.logPrefix} Deferred legacy repair failed for ${params.eventId}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }, params.delayMs ?? 5000)

  if (typeof timer.unref === 'function') timer.unref()
  legacyRepairTimers.set(params.eventId, timer)
  return false
}
