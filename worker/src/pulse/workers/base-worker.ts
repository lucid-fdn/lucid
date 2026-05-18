/**
 * Pulse Base Worker — Priority sweep + XREADGROUP BLOCK claim loop.
 *
 * Each concrete worker implements getEventType() and process(job).
 * If an ExecutorRegistry is provided, jobs are routed to executors first;
 * process(job) is the fallback for unmatched step types.
 *
 * Pulse v2: Replaces exponential backoff polling with:
 * 1. Non-blocking XREADGROUP on critical stream
 * 2. Non-blocking XREADGROUP on normal stream
 * 3. Blocking XREADGROUP on all 3 streams (2s timeout)
 * Zero idle cost — TCP connection blocks at Redis until data arrives.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../../config.js'
import type { EncryptionService } from '../../crypto/encryption-service.js'
import type { PulseJob, PulseEventType, PulseConfig } from '../types.js'
import { DEFAULT_PULSE_CONFIG } from '../types.js'
import { PulseQueue } from '../queue.js'
import { getPulseRedis } from '../redis.js'
import { recordClaim, recordComplete, recordFail } from '../agent-runs.js'
import { withSpan } from '../../observability/tracing.js'
import type { ExecutorRegistry } from '../executors/registry.js'
import type { IncrementalScheduler } from '../dag/scheduler.js'

export abstract class BaseWorker {
  protected queue: PulseQueue
  protected pulseConfig: PulseConfig
  protected workerId: string
  protected running = false

  // Executor registry (Phase 3N) — optional, falls back to abstract process()
  protected executorRegistry?: ExecutorRegistry

  // Worker dependencies — available to executors via StepExecutionContext
  protected supabase?: SupabaseClient
  protected workerConfig?: Config
  protected encryptionService?: EncryptionService

  // DAG scheduler (Phase 4N) — optional, only used when job carries dagId
  protected dagScheduler?: IncrementalScheduler

  // Concurrency control — max in-flight jobs per worker process
  private inflightCount = 0

  // Lease renewal timers per active run
  private leaseTimers = new Map<string, ReturnType<typeof setInterval>>()

  // Per-job AbortControllers (Phase 3N) — aborted on graceful shutdown
  private activeAbortControllers = new Map<string, AbortController>()

  constructor(
    queue: PulseQueue,
    workerId: string,
    config?: Partial<PulseConfig>,
    options?: {
      executorRegistry?: ExecutorRegistry
      supabase?: SupabaseClient
      workerConfig?: Config
      encryptionService?: EncryptionService
      dagScheduler?: IncrementalScheduler
    },
  ) {
    this.queue = queue
    this.workerId = workerId
    this.pulseConfig = { ...DEFAULT_PULSE_CONFIG, ...config }
    if (options) {
      this.executorRegistry = options.executorRegistry
      this.supabase = options.supabase
      this.workerConfig = options.workerConfig
      this.encryptionService = options.encryptionService
      this.dagScheduler = options.dagScheduler
    }
  }

  /** Event type this worker processes */
  abstract getEventType(): PulseEventType

  /** Process a claimed job — delegates to existing processor functions */
  abstract process(job: PulseJob): Promise<void>

  /**
   * Worker-specific inflight cap.
   * Interactive lanes can tolerate higher concurrency; background lanes should
   * stay tighter so they do not monopolize shared model/provider capacity.
   */
  protected getMaxInflight(): number {
    return 10
  }

  /**
   * Optional claim deferral hook.
   * Used by background workers to yield when higher-priority traffic is queued
   * or actively executing.
   */
  protected async shouldDeferClaim(): Promise<boolean> {
    return false
  }

  protected getActiveEventCount(eventType: PulseEventType): number {
    return ACTIVE_EVENT_COUNTS[eventType] ?? 0
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return
    this.running = true
    this.claimLoop()
    console.log(`[pulse:${this.getEventType()}] Worker started (workerId=${this.workerId})`)
  }

  async stop(): Promise<void> {
    this.running = false

    // Abort all in-flight executors (Phase 3N)
    for (const [, ac] of this.activeAbortControllers) {
      ac.abort()
    }

    // Wait up to 30s for in-flight jobs to complete (check both counters)
    const deadline = Date.now() + 30_000
    while ((this.inflightCount > 0 || this.leaseTimers.size > 0) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500))
    }

    // Release remaining leases — snapshot + clear atomically to avoid
    // race with startLeaseRenewal() firing after the loop yields
    const remainingTimers = Array.from(this.leaseTimers.values())
    this.leaseTimers.clear()
    for (const timer of remainingTimers) {
      clearInterval(timer)
    }

    console.log(`[pulse:${this.getEventType()}] Worker stopped (inflight=${this.inflightCount})`)
  }

  // ─── Claim Loop ─────────────────────────────────────────────────────────

  private async claimLoop(): Promise<void> {
    while (this.running) {
      try {
        // Wait if at max concurrency
        while (this.running && this.inflightCount >= this.getMaxInflight()) {
          await this.sleep(100)
        }
        if (!this.running) break

        if (await this.shouldDeferClaim()) {
          await this.sleep(250)
          continue
        }

        const redis = await getPulseRedis()
        if (!redis) {
          await this.sleep(1000)
          continue
        }

        const eventType = this.getEventType()

        // Step 1: Priority sweep (non-blocking)
        let job = await this.queue.claimNonBlocking(eventType, this.workerId, 'critical')
        if (!job) {
          job = await this.queue.claimNonBlocking(eventType, this.workerId, 'normal')
        }

        // Check running after non-blocking claims (stop() may have been called)
        if (!this.running) break

        // Step 2: Blocking wait on all 3 streams
        if (!job) {
          job = await this.queue.claimBlocking(eventType, this.workerId, this.pulseConfig.blockTimeoutMs)
        }

        // Re-check after blocking read — stop() may have set running=false while we blocked
        if (!this.running) break

        // Timeout — loop back (zero cost during block)
        if (!job) continue

        // Step 3: Post-claim flow (inflight + lease)
        const claimed = await this.queue.postClaimFlow(redis, job, this.workerId, eventType)
        if (!claimed) continue

        // Guard against stop() landing during postClaimFlow() await
        if (!this.running) {
          // Release the lease and inflight counter we just acquired
          await this.queue.complete(claimed, this.workerId).catch(() => {})
          break
        }

        // Record claim in agent_runs ledger (best-effort)
        recordClaim(claimed, this.workerId, this.pulseConfig.leaseTtlSeconds)

        // Start lease renewal timer for this run
        this.startLeaseRenewal(claimed.runId)

        // Track in-flight and fire-and-forget so we can claim more
        this.inflightCount++
        void this.processJob(claimed).catch((err) => {
          console.error(
            `[pulse:${this.getEventType()}] Unhandled processJob error for ${claimed.runId}:`,
            err instanceof Error ? err.message : err,
          )
        })
      } catch (err) {
        console.error(
          `[pulse:${this.getEventType()}] Claim loop error:`,
          err instanceof Error ? err.message : err,
        )
        await this.sleep(5_000) // Flat 5s delay on error
      }
    }
  }

  private async processJob(job: PulseJob): Promise<void> {
    // Create per-job AbortController (Phase 3N)
    const ac = new AbortController()
    this.activeAbortControllers.set(job.runId, ac)
    ACTIVE_EVENT_COUNTS[this.getEventType()] = (ACTIVE_EVENT_COUNTS[this.getEventType()] ?? 0) + 1

    const startMs = Date.now()
    try {
      await withSpan(`pulse.process.${this.getEventType()}`, {
        'lucid.pulse.event_type': this.getEventType(),
        'lucid.pulse.event_id': job.eventId,
        'lucid.pulse.run_id': job.runId,
        'lucid.pulse.agent_id': job.agentId,
        'lucid.pulse.attempt': job.attempt,
      }, async () => {
        // Phase 3N: try executor registry first, fall back to abstract process()
        const stepType = job.stepType ?? job.eventType
        const executor = this.executorRegistry?.resolve(stepType)

        if (executor && this.supabase && this.workerConfig && this.encryptionService) {
          await executor.execute({
            job,
            supabase: this.supabase,
            config: this.workerConfig,
            encryptionService: this.encryptionService,
            abortController: ac,
          })
        } else {
          // Fallback to subclass process() — backwards compatible
          await this.process(job)
        }

        const completed = await this.queue.complete(job, this.workerId)
        if (!completed) {
          console.warn(
            `[pulse:${this.getEventType()}] Stale complete for run ${job.runId} — skipping metrics + DAG callbacks`,
          )
          return
        }
        recordComplete(job, Date.now() - startMs)

        // Phase 4N: notify DAG scheduler on success
        if (this.dagScheduler && job.dagId && job.dagNodeId) {
          try {
            await this.dagScheduler.onNodeComplete(job.dagId, job.dagNodeId)
          } catch (schedErr) {
            console.error(
              `[pulse:${this.getEventType()}] dag scheduler onNodeComplete failed for ${job.dagNodeId}:`,
              schedErr instanceof Error ? schedErr.message : schedErr,
            )
          }
        }
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Processing failed'
      console.error(
        `[pulse:${this.getEventType()}] Job ${job.eventId} failed (attempt ${job.attempt}, ${Date.now() - startMs}ms):`,
        errorMsg,
      )
      const failOutcome = await this.queue.fail(job, this.workerId, errorMsg)
      if (failOutcome === 'stale') {
        console.warn(
          `[pulse:${this.getEventType()}] Stale fail for run ${job.runId} — skipping metrics + DAG callbacks`,
        )
        return
      }
      recordFail(job, errorMsg)

      // Phase 4N: notify DAG scheduler on failure
      if (this.dagScheduler && job.dagId && job.dagNodeId) {
        const retryable = job.attempt + 1 < this.pulseConfig.maxAttempts
        try {
          await this.dagScheduler.onNodeFail(
            job.dagId,
            job.dagNodeId,
            retryable,
            errorMsg,
          )
        } catch (schedErr) {
          console.error(
            `[pulse:${this.getEventType()}] dag scheduler onNodeFail failed for ${job.dagNodeId}:`,
            schedErr instanceof Error ? schedErr.message : schedErr,
          )
        }
      }
    } finally {
      this.activeAbortControllers.delete(job.runId)
      this.inflightCount--
      this.stopLeaseRenewal(job.runId)
      ACTIVE_EVENT_COUNTS[this.getEventType()] = Math.max(
        0,
        (ACTIVE_EVENT_COUNTS[this.getEventType()] ?? 1) - 1,
      )
    }
  }

  // ─── Lease Renewal ────────────────────────────────────────────────────────

  private startLeaseRenewal(runId: string): void {
    const timer = setInterval(async () => {
      try {
        const renewed = await this.queue.renewLease(runId, this.workerId)
        if (!renewed) {
          this.stopLeaseRenewal(runId)
          console.warn(`[pulse:${this.getEventType()}] Lease lost for run ${runId}`)
        }
      } catch (err) {
        console.warn(
          `[pulse:${this.getEventType()}] Lease renewal failed for run ${runId}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }, 15_000)

    this.leaseTimers.set(runId, timer)
  }

  private stopLeaseRenewal(runId: string): void {
    const timer = this.leaseTimers.get(runId)
    if (timer) {
      clearInterval(timer)
      this.leaseTimers.delete(runId)
    }
  }

  // ─── Wake Signal ──────────────────────────────────────────────────────────

  /**
   * @deprecated XREADGROUP BLOCK wakes natively on new data.
   * Kept as no-op for interface compatibility with wake-signal.ts.
   */
  resetBackoff(): void {
    // No-op — XREADGROUP BLOCK wakes natively when data arrives.
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }
}

const ACTIVE_EVENT_COUNTS: Record<PulseEventType, number> = {
  inbound: 0,
  outbound: 0,
  scheduled: 0,
  human_task: 0,
}
