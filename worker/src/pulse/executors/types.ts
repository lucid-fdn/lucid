/**
 * Pulse Step Executor — Type Definitions
 *
 * Pluggable executors decouple "what to run" from "how to run it".
 * Executors follow BaseWorker's throw-based contract:
 * - Return void → BaseWorker calls queue.complete()
 * - Throw → BaseWorker calls queue.fail()
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../../config.js'
import type { EncryptionService } from '../../crypto/encryption-service.js'
import type { PulseJob } from '../types.js'

/** Step types — extends event types with webhook, approval, PM sync outbound, and Linear agent session */
export type StepType =
  | 'inbound'
  | 'outbound'
  | 'scheduled'
  | 'webhook'
  | 'approval'
  | 'pm_sync_outbound'
  | 'linear_agent_session'

/**
 * Context provided to every executor on each step execution.
 * BaseWorker creates this per-job from its own state.
 */
export interface StepExecutionContext {
  /** The Pulse job being processed */
  job: PulseJob
  /** Supabase client (service role) */
  supabase: SupabaseClient
  /** Worker configuration */
  config: Config
  /** Encryption service for decrypting secrets */
  encryptionService: EncryptionService
  /** Per-job abort controller — aborted on graceful shutdown */
  abortController: AbortController
}

/**
 * Step Executor — pluggable execution strategy for Pulse jobs.
 *
 * IMPORTANT: Follows BaseWorker's throw-based contract:
 * - execute() returns void on success → BaseWorker calls queue.complete()
 * - execute() throws on failure → BaseWorker calls queue.fail() with error message
 *
 * The executor does NOT call complete/fail itself.
 * The caller (BaseWorker) owns Pulse lease, renewal, complete, and fail.
 */
export interface StepExecutor {
  /** Unique executor type identifier */
  readonly type: string

  /**
   * Execute a step. Returns void on success, throws on failure.
   * The executor writes step metadata to orchestration_steps directly (best-effort).
   */
  execute(ctx: StepExecutionContext): Promise<void>

  /**
   * Whether this executor can handle the given step type.
   * Used by the executor registry to route jobs.
   */
  canHandle(stepType: string): boolean
}
