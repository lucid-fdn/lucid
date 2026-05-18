import 'server-only'

/**
 * Control Plane Pulse Redis Client
 *
 * Singleton ioredis TCP client for Pulse operations on the control plane.
 * Used by claim/complete/fail/renew endpoints to participate in the same
 * Redis Streams + lease contract as the worker Pulse engine.
 */

import { PulseKeys } from '@contracts/pulse'
import { ControlPlaneIoredisAdapter, type ControlPlanePulseRedis } from './ioredis-adapter'
import { CONTROL_PLANE_CONSUMER_GROUP, PULSE_EVENT_TYPES, PULSE_PRIORITIES } from './constants'

let pulseRedis: ControlPlanePulseRedis | null = null
let initPromise: Promise<ControlPlanePulseRedis | null> | null = null

async function bootstrapConsumerGroups(redis: ControlPlanePulseRedis): Promise<void> {
  for (const eventType of PULSE_EVENT_TYPES) {
    for (const priority of PULSE_PRIORITIES) {
      const streamKey = PulseKeys.stream(eventType, priority)
      try {
        await redis.xgroupCreate(streamKey, CONTROL_PLANE_CONSUMER_GROUP, '0', { mkstream: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('BUSYGROUP')) continue
        console.warn(`[pulse:control-plane] Failed to create consumer group on ${streamKey}: ${message}`)
      }
    }
  }
}

/**
 * Get the Pulse Redis client (singleton, lazy-init).
 * Returns null if REDIS_URL is not configured or connection fails.
 */
export async function getPulseRedis(): Promise<ControlPlanePulseRedis | null> {
  if (pulseRedis) return pulseRedis
  if (!initPromise) {
    initPromise = (async () => {
      const url = process.env.REDIS_URL
      if (!url) return null

      const adapter = new ControlPlaneIoredisAdapter(url)
      try {
        await adapter.connect()
        await bootstrapConsumerGroups(adapter)
        pulseRedis = adapter
        return adapter
      } catch (error) {
        console.warn(
          '[pulse:control-plane] Failed to connect to Redis:',
          error instanceof Error ? error.message : String(error),
        )
        try {
          await adapter.quit()
        } catch {
          // ignore cleanup failure
        }
        return null
      } finally {
        initPromise = null
      }
    })()
  }
  return initPromise
}

export function resetPulseRedis(): void {
  pulseRedis = null
  initPromise = null
}
