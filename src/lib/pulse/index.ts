/**
 * Pulse Control Plane — Scheduler Facade
 *
 * Control-plane facade for Pulse scheduling operations.
 * Dedicated relay runtimes call into this layer over HTTP, but the scheduler
 * semantics remain the same Redis Streams + lease contract used by worker Pulse.
 */

export {
  claimForRuntime,
  completeForRuntime,
  failForRuntime,
  enqueueAndClaimSelf,
  isPulseAvailable,
  type ClaimResult,
} from './claim-proxy'
export { getPulseRedis } from './redis-client'
