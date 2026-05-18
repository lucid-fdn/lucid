/**
 * Relay Step Processor — Phase 4N-c, Task 56.
 *
 * Dedicated-runtime claim loop for DAG-internal steps. Parallels relay-inbound
 * but targets `orchestration_steps` via the StepRunPacket protocol instead of
 * `assistant_inbound_events`.
 *
 * Flow:
 *   1. Poll POST /api/runtimes/steps/claim via DataSink
 *   2. On claim: start 15s lease-renewal heartbeat
 *   3. Execute the step via the injected executor
 *   4. completeStep or failStep
 *   5. Stop heartbeat
 *
 * Empty-claim backoff is exponential: 100ms → 200 → 500 → 1s → 2s → 5s.
 * Claim errors back off more aggressively because they usually indicate a
 * degraded control plane / database. During outages this keeps workers from
 * becoming the thundering herd that makes recovery harder.
 */

import type { DataSink, StepRunPacket } from '../runtime/data-sink.js'

/** Pluggable executor — processes a step payload and returns an outcome. */
export interface StepExecutor {
  execute(packet: StepRunPacket): Promise<StepExecutionResult>
}

export type StepExecutionResult =
  | {
      ok: true
      output?: string
      durationMs?: number
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
      costUsd?: number
    }
  | { ok: false; errorMessage: string; retryable: boolean }

const EMPTY_BACKOFF_MS = [100, 200, 500, 1_000, 2_000, 5_000] as const
const ERROR_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000, 60_000] as const
const LEASE_RENEW_INTERVAL_MS = 15_000

export interface RelayStepLoopHandle {
  stop(): Promise<void>
  isRunning(): boolean
}

export interface RelayStepLoopOptions {
  dataSink: DataSink
  executor: StepExecutor
  logger?: {
    info: (msg: string, ...args: unknown[]) => void
    warn: (msg: string, ...args: unknown[]) => void
    error: (msg: string, ...args: unknown[]) => void
  }
  /** Injected sleep for tests. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Starts the relay step claim loop. Returns a handle that can be awaited on
 * shutdown. The loop runs until `stop()` is called; `stop()` resolves after
 * any in-flight step completes (best-effort drain).
 */
export function startRelayStepLoop(opts: RelayStepLoopOptions): RelayStepLoopHandle {
  const log = opts.logger ?? console
  const sleep = opts.sleep ?? defaultSleep

  if (!opts.dataSink.claimNextStep) {
    throw new Error('[relay-step] DataSink.claimNextStep is required')
  }
  if (!opts.dataSink.completeStep || !opts.dataSink.failStep) {
    throw new Error('[relay-step] DataSink.completeStep and failStep are required')
  }

  let running = true
  let emptyBackoffIdx = 0
  let errorBackoffIdx = 0
  const inflight = new Set<Promise<void>>()

  const loop = (async () => {
    while (running) {
      let packet: StepRunPacket | null = null
      try {
        packet = await opts.dataSink.claimNextStep!()
      } catch (err) {
        log.error('[relay-step] claim failed:', err)
        const delay = ERROR_BACKOFF_MS[Math.min(errorBackoffIdx, ERROR_BACKOFF_MS.length - 1)]
        errorBackoffIdx = Math.min(errorBackoffIdx + 1, ERROR_BACKOFF_MS.length - 1)
        await sleep(delay)
        continue
      }

      if (!packet) {
        const delay = EMPTY_BACKOFF_MS[Math.min(emptyBackoffIdx, EMPTY_BACKOFF_MS.length - 1)]
        emptyBackoffIdx = Math.min(emptyBackoffIdx + 1, EMPTY_BACKOFF_MS.length - 1)
        await sleep(delay)
        continue
      }

      // Reset backoff on successful claim.
      emptyBackoffIdx = 0
      errorBackoffIdx = 0

      const task = processOne(packet, opts, log).finally(() => {
        inflight.delete(task)
      })
      inflight.add(task)
      // Serial processing — one step at a time per loop (matches relay-inbound semantics).
      await task
    }
  })().catch((err) => {
    log.error('[relay-step] loop crashed:', err)
  })

  return {
    isRunning: () => running,
    async stop() {
      running = false
      // Wait for loop tick + any in-flight step.
      await loop
      if (inflight.size > 0) {
        await Promise.allSettled([...inflight])
      }
    },
  }
}

async function processOne(
  packet: StepRunPacket,
  opts: RelayStepLoopOptions,
  log: NonNullable<RelayStepLoopOptions['logger']>,
): Promise<void> {
  const logCtx = `[relay-step] step=${packet.stepId} dag=${packet.dagId} node=${packet.dagNodeId}`

  // Start lease renewal heartbeat.
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let heartbeatStopped = false
  if (opts.dataSink.renewStepLease) {
    heartbeatTimer = setInterval(async () => {
      if (heartbeatStopped) return
      try {
        await opts.dataSink.renewStepLease!(packet.stepId)
      } catch (err) {
        log.warn(`${logCtx} lease renew failed:`, err)
      }
    }, LEASE_RENEW_INTERVAL_MS)
  }

  const started = Date.now()
  try {
    const result = await opts.executor.execute(packet)

    heartbeatStopped = true
    if (heartbeatTimer) clearInterval(heartbeatTimer)

    if (result.ok) {
      const completePayload = {
        stepId: packet.stepId,
        output: result.output,
        durationMs: result.durationMs ?? Date.now() - started,
        ...(result.inputTokens !== undefined ? { inputTokens: result.inputTokens } : {}),
        ...(result.outputTokens !== undefined ? { outputTokens: result.outputTokens } : {}),
        ...(result.totalTokens !== undefined ? { totalTokens: result.totalTokens } : {}),
        ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
      }
      await opts.dataSink.completeStep!(completePayload)
      log.info(`${logCtx} completed (${Date.now() - started}ms)`)
    } else {
      await opts.dataSink.failStep!({
        stepId: packet.stepId,
        errorMessage: result.errorMessage,
        retryable: result.retryable,
      })
      log.warn(`${logCtx} failed: ${result.errorMessage} (retryable=${result.retryable})`)
    }
  } catch (err) {
    heartbeatStopped = true
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`${logCtx} executor threw: ${msg}`)
    try {
      await opts.dataSink.failStep!({
        stepId: packet.stepId,
        errorMessage: msg,
        retryable: true,
      })
    } catch (failErr) {
      log.error(`${logCtx} failStep call also failed:`, failErr)
    }
  }
}
