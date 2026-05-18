/**
 * Agent Bridge — LucidBridge
 *
 * Main entry point for external agent frameworks connecting to Lucid Mission Control.
 * Orchestrates heartbeat, event reporting, message relay, and approval flow.
 *
 * Two modes:
 *   full    — Lucid drives execution via C1 REST relay. Requires onMessage() handler.
 *   observe — Agent drives its own I/O. Lucid gets heartbeat + events + costs only.
 *
 * Non-blocking start: initial heartbeat is fire-and-forget. If the control plane
 * is unreachable, the offline buffer absorbs telemetry until connectivity returns.
 * start() never throws on network failure — the agent keeps running.
 *
 * Graceful shutdown: SIGINT/SIGTERM → stop relay → flush events → shutdown heartbeat.
 *
 * Usage:
 *   import { LucidBridge } from '@lucid/agent-bridge'
 *
 *   const bridge = new LucidBridge({
 *     runtimeId: process.env.LUCID_RUNTIME_ID!,
 *     runtimeKey: process.env.LUCID_RUNTIME_KEY!,
 *     controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
 *     mode: 'observe',
 *   })
 *   await bridge.start()
 */

import { RestClient } from './http-client.js'
import { OfflineBuffer } from './offline-buffer.js'
import { HeartbeatManager } from './heartbeat.js'
import { EventReporter } from './event-reporter.js'
import { MessageRelay } from './message-relay.js'
import { ApprovalGate } from './approval-gate.js'
import { defaultLogger } from './logger.js'
import type {
  BridgeConfig,
  MessageHandler,
  MessageResponse,
  RunResult,
  FeedEvent,
  CostPayload,
  AIGenerationReceiptPayload,
  BridgeLogger,
  ToolExecutionHandler,
  RuntimeManagementCommandHandler,
} from './types.js'

// =============================================================================
// Errors
// =============================================================================

export class BridgeConfigError extends Error {
  readonly name = 'BridgeConfigError'
  constructor(message: string) {
    super(message)
  }
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULTS = {
  mode: 'full' as const,
  generation: 1,
  engine: 'openclaw',
  runtimeProtocol: 'lucid-runtime-v2',
  heartbeatIntervalMs: 30_000,
  eventFlushIntervalMs: 5_000,
  messagePollIntervalMs: 5_000,
  messageClaimWaitMs: 15_000,
  offlineBufferCapacity: 1_000,
} as const

// =============================================================================
// LucidBridge
// =============================================================================

export class LucidBridge {
  private readonly config: Required<
    Pick<BridgeConfig, 'runtimeId' | 'runtimeKey' | 'controlPlaneUrl' | 'mode' | 'generation'>
  > & BridgeConfig
  private readonly logger: BridgeLogger

  private client!: RestClient
  private buffer!: OfflineBuffer
  private heartbeat!: HeartbeatManager
  private eventReporter!: EventReporter
  private approvalGate!: ApprovalGate
  private messageRelay: MessageRelay | undefined

  private handler: MessageHandler | undefined
  private toolExecutionHandler: ToolExecutionHandler | undefined
  private managementCommandHandler: RuntimeManagementCommandHandler | undefined
  private started = false
  private signalCleanups: Array<() => void> = []

  constructor(config: BridgeConfig) {
    this.config = { ...DEFAULTS, ...config }
    this.logger = config.logger ?? defaultLogger
  }

  /** Register the message handler (required for full mode). */
  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  /** Register optional structured Lucid tool execution for dedicated runtimes. */
  onToolExecution(handler: ToolExecutionHandler): void {
    this.toolExecutionHandler = handler
  }

  /** Register optional runtime management command execution for BYO/dedicated runtimes. */
  onManagementCommand(handler: RuntimeManagementCommandHandler): void {
    this.managementCommandHandler = handler
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.validate()

    const { runtimeId, runtimeKey, controlPlaneUrl } = this.config

    // Wire up subsystems
    this.client = new RestClient(controlPlaneUrl, runtimeKey, this.logger)
    this.buffer = new OfflineBuffer(this.config.offlineBufferCapacity)
    this.approvalGate = new ApprovalGate(this.client, this.logger)

    this.heartbeat = new HeartbeatManager(this.client, this.buffer, this.logger, {
      runtimeId,
      generation: this.config.generation!,
      intervalMs: this.config.heartbeatIntervalMs!,
      engine: this.config.engine,
      runtimeProtocol: this.config.runtimeProtocol,
      engineVersion: this.config.engineVersion,
      runtimeVersion: this.config.runtimeVersion,
      adapterIdentity: this.config.adapterIdentity,
      nativeCapabilities: this.config.nativeCapabilities,
      runtimeServices: this.config.runtimeServices,
      adapterProbe: this.config.adapterProbe,
      transcriptParser: this.config.transcriptParser,
      commandSpec: this.config.commandSpec,
      engineHomePolicy: this.config.engineHomePolicy,
      onManagementCommands: this.managementCommandHandler,
    })

    this.eventReporter = new EventReporter(this.client, this.logger, {
      intervalMs: this.config.eventFlushIntervalMs!,
    })

    // Start heartbeat + events (both modes)
    this.heartbeat.start()
    this.eventReporter.start()

    // Full mode: also start message relay
    if (this.config.mode === 'full') {
      if (!this.handler) {
        throw new BridgeConfigError(
          'Full mode requires a message handler — call bridge.onMessage(handler) before start()',
        )
      }
      this.messageRelay = new MessageRelay(
        this.client,
        this.eventReporter,
        this.approvalGate,
        this.handler,
        this.toolExecutionHandler,
        this.logger,
        { intervalMs: this.config.messagePollIntervalMs!, claimWaitMs: this.config.messageClaimWaitMs! },
      )
      this.messageRelay.start()
    }

    // Register signal handlers for graceful shutdown
    const shutdown = () => { this.stop() }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    this.signalCleanups = [
      () => process.removeListener('SIGINT', shutdown),
      () => process.removeListener('SIGTERM', shutdown),
    ]

    this.started = true
    this.logger.info(`Bridge started (mode=${this.config.mode}, runtime=${runtimeId})`)
  }

  async stop(): Promise<void> {
    if (!this.started) return
    this.started = false

    // 1. Stop accepting new messages
    this.messageRelay?.stop()

    // 2. Final event flush
    await this.eventReporter.flush()
    this.eventReporter.stop()

    // 3. Shutdown heartbeat (signals control plane immediately)
    await this.heartbeat.sendShutdown()
    this.heartbeat.stop()

    // 4. Remove signal handlers
    for (const cleanup of this.signalCleanups) cleanup()
    this.signalCleanups = []

    this.logger.info('Bridge stopped')
  }

  // ── Observe Mode ──────────────────────────────────────────────────

  /**
   * Wrap an existing agent run for observability.
   * Emits run_started/run_finished/error events and reports costs.
   *
   * @param meta.agentId — The agent identifier for Mission Control.
   * @param fn — The agent's run function.
   * @returns The agent's response plus timing.
   */
  async trackRun(
    meta: { agentId: string },
    fn: () => Promise<MessageResponse>,
  ): Promise<RunResult> {
    const runId = crypto.randomUUID()

    this.eventReporter.report({
      agentId: meta.agentId,
      eventType: 'run_started',
      severity: 'info',
      payload: { runId },
    })

    const startMs = Date.now()
    try {
      const response = await fn()
      const durationMs = Date.now() - startMs

      this.eventReporter.report({
        agentId: meta.agentId,
        eventType: 'run_finished',
        severity: 'info',
        payload: { runId, durationMs },
      })

      // Fire-and-forget cost reporting
      if (response.tokenUsage) {
        this.client.post('/api/runtimes/costs', {
          agentId: meta.agentId, runId, ...response.tokenUsage,
        }).catch(() => {})
        this.reportAIGeneration({
          agentId: meta.agentId,
          runId,
          feature: 'agent-run',
          modality: 'agent-run',
          prompt: 'agent-bridge observe run',
          success: true,
          provider: 'worker',
          usage: {
            inputTokens: response.tokenUsage.inputTokens,
            outputTokens: response.tokenUsage.outputTokens,
            totalTokens: response.tokenUsage.inputTokens + response.tokenUsage.outputTokens,
            estimatedCostUsd: response.tokenUsage.estimatedCostUsd,
          },
          receipt: {
            provider: 'worker',
            latencyMs: durationMs,
            requestId: runId,
            metadata: { mode: 'observe' },
          },
        })
      }

      return { ...response, durationMs }
    } catch (err) {
      const durationMs = Date.now() - startMs

      this.eventReporter.report({
        agentId: meta.agentId,
        eventType: 'error',
        severity: 'error',
        payload: {
          runId, durationMs,
          error: err instanceof Error ? err.message : String(err),
        },
      })

      throw err
    }
  }

  // ── Convenience (both modes) ──────────────────────────────────────

  /** Report a custom feed event visible in Mission Control. */
  reportEvent(event: FeedEvent): void {
    this.eventReporter.report(event)
  }

  /** Report cost data for a run. Fire-and-forget. */
  reportCost(cost: CostPayload): void {
    this.client.post('/api/runtimes/costs', cost).catch(() => {})
  }

  /** Report an AI generation receipt. Fire-and-forget. */
  reportAIGeneration(receipt: AIGenerationReceiptPayload): void {
    this.client.post('/api/runtimes/ai-generation-events', receipt).catch(() => {})
  }

  // ── Diagnostics ───────────────────────────────────────────────────

  /** Whether the bridge is currently running. */
  get isRunning(): boolean {
    return this.started
  }

  /** Number of events waiting to be flushed. */
  get pendingEvents(): number {
    return this.eventReporter?.pendingCount ?? 0
  }

  /** Number of entries in the offline buffer. */
  get offlineBufferDepth(): number {
    return this.buffer?.depth ?? 0
  }

  // ── Validation ────────────────────────────────────────────────────

  private validate(): void {
    const { runtimeId, runtimeKey, controlPlaneUrl } = this.config

    if (!runtimeId) {
      throw new BridgeConfigError(
        'runtimeId is required — create a runtime in Mission Control first',
      )
    }
    if (!runtimeKey) {
      throw new BridgeConfigError(
        'runtimeKey is required — copy it from the runtime setup page in Mission Control',
      )
    }
    if (!controlPlaneUrl) {
      throw new BridgeConfigError(
        'controlPlaneUrl is required — typically https://lucid.foundation',
      )
    }

    try {
      new URL(controlPlaneUrl)
    } catch {
      throw new BridgeConfigError('controlPlaneUrl must be a valid URL')
    }
  }
}
