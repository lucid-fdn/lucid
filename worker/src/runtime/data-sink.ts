/**
 * DataSink — Strategy pattern for deployment-mode-agnostic worker reporting.
 *
 * SupabaseDataSink: Direct DB writes (SaaS worker, self-hosted with DB access)
 * RestDataSink: REST calls to /api/runtimes/* (dedicated/hybrid runtimes)
 */

// ─── Payload Types (re-exported from @lucid/agent-bridge — single source of truth) ───

export type {
  NativeChannelStatus,
  HeartbeatPayload,
  HeartbeatResponse,
  RuntimeManagementCommand,
  FeedEvent,
  ApprovalRequest,
  ApprovalResolution,
  HealthScorePayload,
  CostPayload,
  RunPacket,
  CompleteInboundPayload,
  CompleteResult,
  StepRunPacket,
  CompleteStepPayload,
  FailStepPayload,
  RenewStepLeaseResult,
  AIGenerationReceiptPayload,
} from '@lucid/agent-bridge'

import type {
  HeartbeatPayload,
  HeartbeatResponse,
  RuntimeManagementCommand,
  FeedEvent,
  ApprovalRequest,
  ApprovalResolution,
  HealthScorePayload,
  CostPayload,
  RunPacket,
  CompleteInboundPayload,
  CompleteResult,
  StepRunPacket,
  CompleteStepPayload,
  FailStepPayload,
  RenewStepLeaseResult,
  AIGenerationReceiptPayload,
} from '@lucid/agent-bridge'

// ─── Interface ───

export interface DataSink {
  reportHeartbeat(metrics: HeartbeatPayload): Promise<string | null>
  takeManagementCommands?(): RuntimeManagementCommand[]
  ackManagementCommand?(
    commandId: string,
    status: 'accepted' | 'rejected' | 'needs_user_action' | 'applied' | 'failed',
    response?: Record<string, unknown> | null,
    error?: string | null,
  ): Promise<void>
  reportEvents(events: FeedEvent[]): Promise<void>
  submitApproval(request: ApprovalRequest): Promise<string>
  pollApprovalResolution(approvalId: string): Promise<ApprovalResolution | null>
  reportHealthScores(scores: HealthScorePayload): Promise<void>
  reportCosts(costs: CostPayload): Promise<void>
  reportAIGeneration?(receipt: AIGenerationReceiptPayload): Promise<void>

  // Phase 1b: REST message relay (optional — only implemented by RestDataSink)
  claimInboundEvents?(batchSize: number, waitMs?: number): Promise<RunPacket[]>
  completeInboundEvent?(payload: CompleteInboundPayload): Promise<CompleteResult>

  // Phase 2: Lease renewal + explicit fail (Pulse integration for BYO runtimes)
  renewLease?(eventId: string, runId: string): Promise<boolean>
  failInboundEvent?(eventId: string, runId: string, errorMessage: string): Promise<boolean>

  // Phase 4N-c: StepRunPacket protocol (dedicated runtimes claim DAG-internal steps)
  claimNextStep?(): Promise<StepRunPacket | null>
  completeStep?(payload: CompleteStepPayload): Promise<void>
  failStep?(payload: FailStepPayload): Promise<void>
  renewStepLease?(stepId: string): Promise<RenewStepLeaseResult>
}

// ─── Offline Ring Buffer (telemetry-only) ───

interface BufferEntry {
  type: 'heartbeat' | 'event' | 'cost' | 'ai_generation'
  payload: unknown
  timestamp: number
}

export class OfflineBuffer {
  private ring: (BufferEntry | null)[]
  private head = 0 // next write position
  private tail = 0 // next read position
  private count = 0
  droppedCount = 0

  constructor(private readonly capacity = 1000) {
    this.ring = new Array(capacity).fill(null)
  }

  push(entry: BufferEntry): void {
    if (this.count === this.capacity) {
      // Tail-drop: discard oldest
      this.tail = (this.tail + 1) % this.capacity
      this.count--
      this.droppedCount++
    }
    this.ring[this.head] = entry
    this.head = (this.head + 1) % this.capacity
    this.count++
  }

  /**
   * Non-destructive read of the oldest entry. Caller must call `ackFirst()`
   * after the entry is durably delivered. If delivery fails, leave the entry
   * in the buffer so the next flush retries it instead of dropping it.
   */
  peekFirst(): BufferEntry | null {
    if (this.count === 0) return null
    return this.ring[this.tail]
  }

  /**
   * Remove the oldest entry. Pair with `peekFirst()` — only call after
   * successful delivery.
   */
  ackFirst(): void {
    if (this.count === 0) return
    this.ring[this.tail] = null
    this.tail = (this.tail + 1) % this.capacity
    this.count--
  }

  /**
   * Destructive batch read. Returns up to `batchSize` oldest entries and
   * removes them from the buffer. Prefer `peekFirst()`/`ackFirst()` in
   * delivery paths that can fail mid-batch — this helper is kept for
   * simulation/diagnostic callers that own the retry logic themselves.
   */
  flush(batchSize = 50): BufferEntry[] {
    const batch: BufferEntry[] = []
    const n = Math.min(batchSize, this.count)
    for (let i = 0; i < n; i++) {
      const entry = this.ring[this.tail]
      if (entry) batch.push(entry)
      this.ring[this.tail] = null
      this.tail = (this.tail + 1) % this.capacity
      this.count--
    }
    return batch
  }

  get depth(): number {
    return this.count
  }
}

// ─── REST Implementation (for dedicated runtimes) ───

export class RestDataSink implements DataSink {
  private offlineBuffer = new OfflineBuffer()
  private flushing = false
  private backoffMs = 1000
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private managementCommands: RuntimeManagementCommand[] = []

  constructor(
    private readonly controlPlaneUrl: string,
    private readonly runtimeId: string,
    private readonly apiKey: string
  ) {}

  private async post(path: string, body: unknown): Promise<Response> {
    const res = await fetch(`${this.controlPlaneUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DataSink POST ${path} failed: ${res.status} ${text}`)
    }
    return res
  }

  private async get(path: string): Promise<Response> {
    const res = await fetch(`${this.controlPlaneUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new Error(`DataSink GET ${path} failed: ${res.status}`)
    }
    return res
  }

  async reportHeartbeat(metrics: HeartbeatPayload): Promise<string | null> {
    try {
      // Include dropped count from offline buffer if any
      const payload = this.offlineBuffer.droppedCount > 0
        ? { ...metrics, _droppedTelemetry: this.offlineBuffer.droppedCount }
        : metrics
      const res = await this.post('/api/runtimes/heartbeat', payload)
      const body = await res.json().catch(() => ({})) as HeartbeatResponse
      this.managementCommands = Array.isArray(body.managementCommands) ? body.managementCommands : []

      // Reset dropped count after successful report
      if (this.offlineBuffer.droppedCount > 0) {
        this.offlineBuffer.droppedCount = 0
      }

      // Successful heartbeat means we're online — flush buffer if non-empty
      if (this.offlineBuffer.depth > 0 && !this.flushing) {
        this.scheduleFlush()
      }
      this.backoffMs = 1000 // reset backoff on success
      return typeof body.configVersion === 'string' ? body.configVersion : null
    } catch {
      this.managementCommands = []
      this.offlineBuffer.push({ type: 'heartbeat', payload: metrics, timestamp: Date.now() })
      return null
    }
  }

  takeManagementCommands(): RuntimeManagementCommand[] {
    const commands = this.managementCommands
    this.managementCommands = []
    return commands
  }

  async ackManagementCommand(
    commandId: string,
    status: 'accepted' | 'rejected' | 'needs_user_action' | 'applied' | 'failed',
    response: Record<string, unknown> | null = null,
    error: string | null = null,
  ): Promise<void> {
    await this.post('/api/runtimes/commands/ack', {
      commandId,
      status,
      response,
      error,
    })
  }

  async reportEvents(events: FeedEvent[]): Promise<void> {
    if (events.length === 0) return
    try {
      await this.post('/api/runtimes/events', { events })
      this.backoffMs = 1000
    } catch {
      for (const event of events) {
        this.offlineBuffer.push({ type: 'event', payload: event, timestamp: Date.now() })
      }
    }
  }

  // Approvals and business mutations bypass buffer entirely — fail fast
  async submitApproval(request: ApprovalRequest): Promise<string> {
    const res = await this.post('/api/runtimes/approvals', request)
    const data = await res.json() as { approvalId: string }
    return data.approvalId
  }

  async pollApprovalResolution(approvalId: string): Promise<ApprovalResolution | null> {
    const res = await this.get(`/api/runtimes/approvals/pending?approval_id=${approvalId}`)
    const data = await res.json() as { status: string; resolvedAt?: string }
    if (data.status === 'pending') return null
    return {
      decision: data.status as ApprovalResolution['decision'],
      resolvedAt: data.resolvedAt || new Date().toISOString(),
    }
  }

  async reportHealthScores(scores: HealthScorePayload): Promise<void> {
    await this.post('/api/runtimes/health-scores', scores)
  }

  async reportCosts(costs: CostPayload): Promise<void> {
    try {
      await this.post('/api/runtimes/costs', costs)
      this.backoffMs = 1000
    } catch {
      this.offlineBuffer.push({ type: 'cost', payload: costs, timestamp: Date.now() })
    }
  }

  async reportAIGeneration(receipt: AIGenerationReceiptPayload): Promise<void> {
    try {
      await this.post('/api/runtimes/ai-generation-events', receipt)
      this.backoffMs = 1000
    } catch {
      this.offlineBuffer.push({ type: 'ai_generation', payload: receipt, timestamp: Date.now() })
    }
  }

  // ─── Phase 1b: REST message relay ───

  async claimInboundEvents(batchSize: number, waitMs?: number): Promise<RunPacket[]> {
    const res = await this.post('/api/runtimes/messages/claim-inbound', {
      batchSize,
      ...(waitMs != null ? { waitMs } : {}),
    })
    const data = await res.json() as { packets: RunPacket[] }
    return data.packets
  }

  async completeInboundEvent(payload: CompleteInboundPayload): Promise<CompleteResult> {
    const res = await this.post('/api/runtimes/messages/complete-inbound', payload)
    return await res.json() as CompleteResult
  }

  async renewLease(eventId: string, runId: string): Promise<boolean> {
    try {
      await this.post('/api/runtimes/messages/renew-lease', { eventId, runId })
      return true
    } catch {
      return false
    }
  }

  async failInboundEvent(eventId: string, runId: string, errorMessage: string): Promise<boolean> {
    try {
      await this.post('/api/runtimes/messages/fail-inbound', { eventId, runId, errorMessage })
      return true
    } catch {
      return false
    }
  }

  // ─── Phase 4N-c: StepRunPacket protocol ───

  async claimNextStep(): Promise<StepRunPacket | null> {
    const res = await fetch(`${this.controlPlaneUrl}/api/runtimes/steps/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 204) return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DataSink POST /api/runtimes/steps/claim failed: ${res.status} ${text}`)
    }
    return (await res.json()) as StepRunPacket
  }

  async completeStep(payload: CompleteStepPayload): Promise<void> {
    await this.post('/api/runtimes/steps/complete', payload)
  }

  async failStep(payload: FailStepPayload): Promise<void> {
    await this.post('/api/runtimes/steps/fail', payload)
  }

  async renewStepLease(stepId: string): Promise<RenewStepLeaseResult> {
    const res = await this.post('/api/runtimes/steps/renew-lease', { stepId })
    return (await res.json()) as RenewStepLeaseResult
  }

  // ─── Offline buffer flush ───

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flushBuffer(), this.backoffMs)
  }

  private async flushBuffer(): Promise<void> {
    this.flushTimer = null
    if (this.flushing || this.offlineBuffer.depth === 0) return

    this.flushing = true
    let delivered = 0
    try {
      // Peek-then-ack. On POST failure we break out WITHOUT acking the
      // current entry, leaving it (and any remaining entries) in the buffer
      // so the next flush retries them. Previously we flushed upfront into
      // a local array and lost every entry from the failing index onwards —
      // dropping critical events like `channel_deactivated` during outages.
      const maxBatch = 50
      for (let i = 0; i < maxBatch && this.offlineBuffer.depth > 0; i++) {
        const entry = this.offlineBuffer.peekFirst()
        if (!entry) break
        switch (entry.type) {
          case 'heartbeat':
            await this.post('/api/runtimes/heartbeat', entry.payload)
            break
          case 'event':
            await this.post('/api/runtimes/events', { events: [entry.payload] })
            break
          case 'cost':
            await this.post('/api/runtimes/costs', entry.payload)
            break
          case 'ai_generation':
            await this.post('/api/runtimes/ai-generation-events', entry.payload)
            break
        }
        this.offlineBuffer.ackFirst()
        delivered++
      }

      this.backoffMs = 1000 // reset on success
      // Continue flushing if more entries remain
      if (this.offlineBuffer.depth > 0) {
        this.scheduleFlush()
      }
    } catch {
      // The entry that failed is still at the head of the buffer — it will
      // be retried on the next flush. Increase backoff (1s, 2s, 4s, max 30s).
      // If we already delivered some entries in this batch, treat that as
      // forward progress and reset backoff; otherwise grow it.
      if (delivered === 0) {
        this.backoffMs = Math.min(this.backoffMs * 2, 30_000)
      } else {
        this.backoffMs = 1000
      }
      if (this.offlineBuffer.depth > 0) {
        this.scheduleFlush()
      }
    } finally {
      this.flushing = false
    }
  }
}

export class SharedWorkerStepDataSink implements DataSink {
  constructor(
    private readonly controlPlaneUrl: string,
    private readonly workerTriggerSecret: string,
  ) {}

  async claimNextStep(): Promise<StepRunPacket | null> {
    const res = await this.post('/api/runtimes/steps/claim', {})
    if (res.status === 204) return null
    return (await res.json()) as StepRunPacket
  }

  async completeStep(payload: CompleteStepPayload): Promise<void> {
    await this.post('/api/runtimes/steps/complete', payload)
  }

  async failStep(payload: FailStepPayload): Promise<void> {
    await this.post('/api/runtimes/steps/fail', payload)
  }

  async renewStepLease(stepId: string): Promise<RenewStepLeaseResult> {
    const res = await this.post('/api/runtimes/steps/renew-lease', { stepId })
    return (await res.json()) as RenewStepLeaseResult
  }

  async reportHeartbeat(): Promise<string | null> { return null }
  async reportEvents(): Promise<void> {}
  async submitApproval(): Promise<string> {
    throw new Error('Shared worker step approval is not configured')
  }
  async pollApprovalResolution(): Promise<ApprovalResolution | null> { return null }
  async reportHealthScores(): Promise<void> {}
  async reportCosts(): Promise<void> {}
  async reportAIGeneration(): Promise<void> {}

  private async post(path: string, body: unknown): Promise<Response> {
    const res = await fetch(`${this.controlPlaneUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.workerTriggerSecret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => '')
      throw new Error(`SharedWorkerStepDataSink POST ${path} failed: ${res.status} ${text}`)
    }
    return res
  }
}

// ─── Factory ───

export function createDataSink(): DataSink | null {
  const runtimeId = process.env.LUCID_RUNTIME_ID
  const apiKey = process.env.LUCID_RUNTIME_KEY
  const controlPlaneUrl = process.env.LUCID_CONTROL_PLANE_URL

  if (runtimeId && apiKey && controlPlaneUrl) {
    return new RestDataSink(controlPlaneUrl, runtimeId, apiKey)
  }

  // Not a dedicated runtime — no DataSink needed (SaaS worker writes directly to DB)
  return null
}

export function createSharedWorkerStepDataSink(): DataSink | null {
  const controlPlaneUrl = process.env.LUCID_CONTROL_PLANE_URL
  const workerTriggerSecret = process.env.WORKER_TRIGGER_SECRET
  if (!controlPlaneUrl || !workerTriggerSecret) return null
  return new SharedWorkerStepDataSink(controlPlaneUrl, workerTriggerSecret)
}
