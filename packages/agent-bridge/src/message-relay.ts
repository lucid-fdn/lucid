/**
 * Agent Bridge — Message Relay
 *
 * Polls the control plane for inbound messages (C1 REST relay pattern),
 * dispatches them to the user's MessageHandler, and completes the cycle.
 *
 * Flow: claim-inbound → user handler → complete-inbound → cost report
 * Auto-emits run_started / run_finished / error feed events.
 *
 * Backoff: exponential 1s → 2s → 4s → max 30s on consecutive claim failures.
 * Resets to base delay on any successful claim (even if 0 packets returned).
 *
 * Uses long-poll claims so the control plane can hold the request open while
 * the queue is idle instead of forcing fixed-interval hot loops. If a claim
 * returns immediately with no packets, we fall back to the configured idle
 * interval so a misconfigured control plane cannot create a tight empty-loop.
 */

import { BridgeError, type RestClient } from './http-client.js'
import type { EventReporter } from './event-reporter.js'
import type { ApprovalGate } from './approval-gate.js'
import type {
  RunPacket,
  CompleteInboundPayload,
  CompleteResult,
  MessageHandler,
  MessageContext,
  FeedEvent,
  ApprovalRequest,
  CostPayload,
  AIGenerationReceiptPayload,
  BridgeLogger,
  ToolExecutionHandler,
} from './types.js'

const BATCH_SIZE = 10
const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

export class MessageRelay {
  private running = false
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private backoffMs = BASE_BACKOFF_MS
  private consecutiveFailures = 0
  private readonly intervalMs: number
  private readonly claimWaitMs: number

  constructor(
    private readonly client: RestClient,
    private readonly eventReporter: EventReporter,
    private readonly approvalGate: ApprovalGate,
    private readonly handler: MessageHandler,
    private readonly toolExecutionHandler: ToolExecutionHandler | undefined,
    private readonly logger: BridgeLogger,
    opts: { intervalMs: number; claimWaitMs: number },
  ) {
    this.intervalMs = opts.intervalMs
    this.claimWaitMs = opts.claimWaitMs
  }

  start(): void {
    this.running = true
    this.schedulePoll(0)
    this.logger.info(`Message relay started (poll every ${this.intervalMs / 1000}s)`)
  }

  stop(): void {
    this.running = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = undefined
    }
    this.logger.info('Message relay stopped')
  }

  // ── Polling ───────────────────────────────────────────────────────

  private schedulePoll(delayMs: number): void {
    if (!this.running) return
    this.pollTimer = setTimeout(() => this.poll(), delayMs)
  }

  private async poll(): Promise<void> {
    if (!this.running) return

    try {
      const packets = await this.claimInbound()
      this.backoffMs = BASE_BACKOFF_MS
      this.consecutiveFailures = 0

      for (const packet of packets) {
        if (!this.running) break
        await this.processPacket(packet)
      }

      this.schedulePoll(packets.length > 0 ? 0 : this.intervalMs)
    } catch (err) {
      this.consecutiveFailures++

      // Permanent errors (4xx) don't trigger backoff
      if (err instanceof BridgeError && !err.isTransient) {
        this.logger.error(`Relay claim error (permanent, ${err.status}):`, err.message)
        this.schedulePoll(this.intervalMs)
        return
      }

      this.logger.warn(
        `Relay poll failed (failure #${this.consecutiveFailures}, backoff ${this.backoffMs}ms):`,
        err instanceof Error ? err.message : err,
      )
      this.schedulePoll(this.backoffMs)
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
    }
  }

  // ── Claim / Process / Complete ────────────────────────────────────

  private async claimInbound(): Promise<RunPacket[]> {
    const data = await this.client.post<{ packets: RunPacket[] }>(
      '/api/runtimes/messages/claim-inbound',
      { batchSize: BATCH_SIZE, waitMs: this.claimWaitMs },
    )
    return data.packets
  }

  private async processPacket(packet: RunPacket): Promise<void> {
    const agentId = packet.assistantConfig.id
    const runId = crypto.randomUUID()

    this.eventReporter.report({
      agentId,
      eventType: 'run_started',
      severity: 'info',
      payload: { eventId: packet.eventId, runId },
    })

    try {
      const ctx = this.buildContext(agentId, runId)
      const startMs = Date.now()
      const response = await this.handler(packet, ctx)
      const durationMs = Date.now() - startMs

      const payload: CompleteInboundPayload = {
        eventId: packet.eventId,
        runId,
        responseText: response.responseText,
        outputArtifacts: response.outputArtifacts,
        tokenUsage: response.tokenUsage,
      }

      const result = await this.client.post<CompleteResult>(
        '/api/runtimes/messages/complete-inbound',
        payload,
      )

      if (result.alreadyApplied) {
        this.logger.warn(`Event ${packet.eventId} already applied (idempotent duplicate)`)
      }

      this.eventReporter.report({
        agentId,
        eventType: 'run_finished',
        severity: 'info',
        payload: { eventId: packet.eventId, runId, durationMs },
      })

      // Fire-and-forget cost reporting
      if (response.tokenUsage) {
        this.client.post('/api/runtimes/costs', {
          agentId, runId, ...response.tokenUsage,
        }).catch(() => {})
        this.reportAIGeneration({
          agentId,
          runId,
          feature: 'agent-run',
          modality: 'agent-run',
          prompt: packet.userMessage.text || 'agent-bridge relay run',
          success: true,
          model: packet.assistantConfig.modelId,
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
            metadata: {
              mode: 'relay',
              eventId: packet.eventId,
              channelType: packet.channelMeta.channelType,
              channelId: packet.channelMeta.channelId,
              delivered: result.delivered,
              alreadyApplied: result.alreadyApplied,
            },
          },
        })
      }
    } catch (err) {
      this.eventReporter.report({
        agentId,
        eventType: 'error',
        severity: 'error',
        payload: {
          eventId: packet.eventId,
          runId,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      this.logger.error(`Run ${runId} failed:`, err instanceof Error ? err.message : err)
    }
  }

  // ── Context Builder ───────────────────────────────────────────────

  private buildContext(agentId: string, runId: string): MessageContext {
    const toolExecutionHandler = this.toolExecutionHandler

    return {
      reportEvent: (event: Omit<FeedEvent, 'agentId'>) => {
        this.eventReporter.report({ ...event, agentId })
      },
      requestApproval: (request: Omit<ApprovalRequest, 'agentId'>) => {
        return this.approvalGate.requestApproval({ ...request, agentId, runId })
      },
      reportCost: (cost: Omit<CostPayload, 'agentId'>) => {
        this.client.post('/api/runtimes/costs', { ...cost, agentId }).catch(() => {})
      },
      reportAIGeneration: (receipt: Omit<AIGenerationReceiptPayload, 'agentId' | 'runId'>) => {
        this.reportAIGeneration({ ...receipt, agentId, runId })
      },
      executeTool: toolExecutionHandler
        ? (request) =>
            toolExecutionHandler({
              ...request,
              agentId,
              runId,
            })
        : undefined,
    }
  }

  private reportAIGeneration(receipt: AIGenerationReceiptPayload): void {
    this.client.post('/api/runtimes/ai-generation-events', receipt).catch(() => {})
  }
}
