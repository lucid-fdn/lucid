# Nerve Phase 3N — Step Execution Protocol — Design Spec

**Date**: 2026-04-06
**Last Updated**: 2026-04-06 (post-Codex review — 3 P0 blockers resolved)
**Status**: Design — ready for implementation
**Scope**: Pluggable step executors that decouple "what to run" from "how to run it", enabling external agents, crew fan-out, approval gates, and webhook callbacks within the Pulse queue.
**Parent**: `docs/superpowers/specs/2026-04-06-nerve-universal-orchestration-design.md`

## 1. Problem Statement

Today every Pulse job follows one path: `BaseWorker.process(job)` → load event from DB → call a processor function (`processInboundEvent`, `processOutboundEvent`, `processScheduledTask`). This works for OpenClaw agents on the SaaS worker, but can't handle:

1. **External agents** — A LangGraph graph, CrewAI pipeline, or plain HTTP API can't participate in Pulse. There's no way to dispatch a job to an external webhook and wait for the result.
2. **Crew fan-out** — A crew coordinator decomposes a goal into steps for different agents, but each step is a separate inbound event with no parent/child relationship. There's no DAG tracking.
3. **Approval gates as steps** — The approval gate (`approval-gate.ts`) blocks the agent loop with 2s polling. It works, but it can't be a standalone step in a multi-step workflow (e.g., "research → human approval → execute").
4. **Webhook callbacks** — Scheduled tasks have `webhook_url` (fire-and-forget, no retry). There's no bidirectional webhook protocol where an external service receives work and calls back when done.
5. **Step-level observability** — `agent_runs` tracks whole runs but can't answer "which step of a 5-step workflow is currently blocking?"

### What This Phase Does NOT Do

- **No AI task decomposition** — That's Phase 4N (DagPlanner). This phase provides the execution substrate that 4N will use.
- **No confidence routing** — That's Phase 5N. This phase provides the step metadata that 5N will score.
- **No new UI** — Orchestration steps are visible in `agent_runs` and `mc_feed_events_v`. A dedicated step timeline UI is future work.

### Goal

> **One Pulse job → one step executor. The executor decides how to run the step. The queue doesn't care.**

## 2. Architecture

### 2.1 Critical Design Constraint: Throw-Based Completion

`BaseWorker.processJob()` uses throw/not-throw semantics:
- **No throw** → `queue.complete(job, workerId)` → success
- **Throw** → `queue.fail(job, workerId, errorMsg)` → retry/DLQ

Executors MUST follow the same contract: **throw on failure, return void on success.** This preserves the existing completion/failure flow and avoids dual-path bugs.

```typescript
interface StepExecutor {
  /** Unique executor type identifier */
  readonly type: string

  /**
   * Execute a step. Returns void on success, throws on failure.
   *
   * IMPORTANT: This follows BaseWorker's throw-based contract:
   * - Return normally → BaseWorker calls queue.complete()
   * - Throw → BaseWorker calls queue.fail() with error message
   *
   * The executor does NOT call complete/fail itself.
   * The caller (BaseWorker) owns Pulse lease, renewal, complete, and fail.
   */
  execute(ctx: StepExecutionContext): Promise<void>

  /**
   * Whether this executor can handle the given step type.
   * Used by the executor registry to route jobs.
   */
  canHandle(stepType: string): boolean
}

interface StepExecutionContext {
  job: PulseJob
  supabase: SupabaseClient
  config: WorkerConfig
  encryptionService: EncryptionService
  abortController: AbortController  // Per-job, aborted on graceful shutdown
}

// Step metadata is written to orchestration_steps table (best-effort, like agent_runs).
// It is NOT returned from execute() — the executor writes it directly.
```

**Why no `StepResult`?** Returning a result object would require `processJob()` to inspect it and decide complete vs fail — creating a new code path alongside the existing throw-based one. This was flagged as a P0 blocker by Codex review. By keeping throw semantics, `processJob()` is unchanged for all executors.

### 2.2 Per-Job AbortController

BaseWorker currently has no per-job cancellation. Long-polling executors (webhook, approval) need it. The fix:

1. `processJob()` creates an `AbortController` per job
2. `stop()` aborts all active controllers (in addition to `running = false`)
3. Executors check `ctx.abortController.signal.aborted` in their poll loops
4. On abort, executor throws → triggers `queue.fail()` → clean shutdown

```typescript
// In BaseWorker:
private activeAbortControllers = new Map<string, AbortController>()

private async processJob(job: PulseJob): Promise<void> {
  const ac = new AbortController()
  this.activeAbortControllers.set(job.runId, ac)
  try {
    // ... existing try/catch/finally with this.process(job) or executor.execute(ctx)
  } finally {
    this.activeAbortControllers.delete(job.runId)
    // ... existing inflightCount--, stopLeaseRenewal
  }
}

async stop(): Promise<void> {
  this.running = false
  // Abort all in-flight executors
  for (const [, ac] of this.activeAbortControllers) {
    ac.abort()
  }
  // ... existing wait loop
}
```

### 2.3 Executor Registry

```typescript
class ExecutorRegistry {
  private executors: StepExecutor[] = []

  register(executor: StepExecutor): void
  resolve(stepType: string): StepExecutor | null
}
```

Resolution order: first registered executor whose `canHandle(stepType)` returns `true`. Falls through to `ProcessorExecutor` as the default catch-all.

### 2.4 Built-in Executors

| Executor | `stepType` | Purpose | Blocking? |
|----------|-----------|---------|-----------|
| `ProcessorExecutor` | `inbound`, `outbound`, `scheduled` | Wraps existing processors (zero behavior change) | Yes (in-process) |
| `WebhookExecutor` | `webhook` | POST payload to URL, poll for callback | Yes (poll) |
| `ApprovalExecutor` | `approval` | Insert `mc_pending_approvals`, poll for resolution | Yes (poll) |

### 2.5 ProcessorExecutor (Default — Wraps Existing)

This is the backwards-compatible executor. **It does not change behavior.** It literally calls the existing processor functions and throws on failure (same as today).

```
BaseWorker.processJob(job)
  → executorRegistry.resolve(job.stepType ?? job.eventType)
  → ProcessorExecutor.execute(ctx)
    → if 'inbound': load event, processInboundEvent()  // throws on failure
    → if 'outbound': load event, processOutboundEvent()
    → if 'scheduled': load task, processScheduledTask()
  → (no throw = success → BaseWorker calls queue.complete())
  → (throw = failure → BaseWorker calls queue.fail())
```

**Why the subclass `process()` method stays:** InboundWorker, OutboundWorker, ScheduledWorker keep their `process()` implementations. ProcessorExecutor delegates to them. BaseWorker's `processJob()` routes: if executor found via registry → use it; else → call `this.process(job)` (backwards compat). No existing code is removed or changed.

### 2.6 WebhookExecutor (New — External Agent Protocol)

Enables external agents (LangGraph, CrewAI, custom HTTP services) to participate in Pulse:

```
1. Pulse claims a `webhook` step
2. WebhookExecutor POSTs the step payload to the registered URL
3. External agent processes the work
4. External agent calls back: POST /api/runtimes/step-callback
5. WebhookExecutor sees callback_status = 'received', returns
```

**Outbound POST payload:**
```json
{
  "stepId": "uuid",
  "runId": "evt-123:0",
  "eventId": "evt-123",
  "eventType": "inbound",
  "agentId": "agent-1",
  "orgId": "org-1",
  "callbackUrl": "https://control-plane/api/runtimes/step-callback",
  "callbackToken": "hmac-signed-token",
  "payload": { ... },
  "timeoutSeconds": 300
}
```

**Callback POST (from external agent):**
```json
{
  "stepId": "uuid",
  "callbackToken": "hmac-signed-token",
  "status": "completed" | "failed",
  "output": "result text",
  "errorMessage": "optional error"
}
```

**Immediate response support:** If the external agent returns a 2xx with JSON body containing `{ status, output?, errorMessage? }`, the executor treats it as an inline callback — no polling needed. This handles simple synchronous external agents without requiring them to implement the callback protocol.

**Duplicate callback idempotency:** The callback endpoint checks `callback_status = 'pending'` before updating. If already `'received'`, returns 200 with `{ alreadyReceived: true }` (same pattern as complete-inbound).

**Security:**
- `callbackToken` is HMAC-SHA256(`stepId + runId`, `PULSE_WEBHOOK_SECRET`)
- Callback endpoint recomputes the HMAC from `stepId` (stored in DB) and compares — token is NOT stored in DB
- Timing-safe comparison on callback receipt
- `callbackUrl` points to control plane (not worker) — external agents don't need worker access
- Webhook URL must be HTTPS (validated at step creation)
- 5-minute default timeout, configurable per step (max 30 min)

**Delivery:**
- 3 retries with exponential backoff (1s, 2s, 4s) on 5xx/timeout
- No retry on 4xx (client error)
- If all retries fail → executor throws → BaseWorker calls `queue.fail()` → normal retry/DLQ

**Wait mechanism:**
- After POST (if no inline response), executor polls `orchestration_steps.callback_status` every 5s
- Respects `ctx.abortController.signal` — aborts on shutdown
- On callback received: reads output from step row, returns normally (success) or throws (if callback status is 'failed')
- On timeout: throws with "Step timed out" → queue.fail()

### 2.7 ApprovalExecutor (New — Standalone Approval Step)

Today's approval gate blocks the agent loop mid-tool-call. The `ApprovalExecutor` makes approval a first-class Pulse step:

```
1. Pulse claims an `approval` step
2. ApprovalExecutor inserts mc_pending_approvals (same table as today)
3. Polls for resolution (2s interval, same as today)
4. On approval → returns normally (success)
5. On denial → throws (failure)
6. On timeout → marks as 'expired' (matching existing approval-gate.ts behavior), throws
```

This enables workflows like: `research (inbound step) → approval (approval step) → execute (inbound step)`.

**Alignment with existing approval-gate.ts:**
- Uses same `mc_pending_approvals` table and `mc_approval_log` table
- Timeout marks row as `'expired'` (not 'denied' — matches `approval-gate.ts:136`)
- Risk level derived server-side from `job.approvalConfig.toolName` using same `estimateRiskLevel()` function from `approval-gate.ts` (not caller-provided)

**Note:** The existing tool-level approval gate (`approval-gate.ts`) is unchanged. `ApprovalExecutor` is for standalone approval steps in multi-step workflows, not for tool-call gating.

### 2.8 Step Tracking Table

```sql
CREATE TABLE orchestration_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,                          -- Pulse runId (eventId:attempt)
  event_id UUID NOT NULL,                        -- Source event ID
  attempt INTEGER NOT NULL DEFAULT 0,            -- Retry attempt (from PulseJob)
  parent_step_id UUID REFERENCES orchestration_steps(id),  -- For DAG (Phase 4N)
  step_type TEXT NOT NULL CHECK (step_type IN ('inbound', 'outbound', 'scheduled', 'webhook', 'approval')),
  executor_type TEXT NOT NULL,                   -- 'processor', 'webhook', 'approval'
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'cancelled')),

  -- Webhook-specific
  webhook_url TEXT,
  callback_status TEXT CHECK (callback_status IN ('pending', 'received')),
  -- NOTE: callback_token is NOT stored. It's recomputed from stepId + runId + PULSE_WEBHOOK_SECRET.

  -- Approval-specific
  approval_id UUID,                              -- References mc_pending_approvals(id), no FK (best-effort)

  -- Execution metadata
  input JSONB CHECK (octet_length(input::text) <= 102400),   -- 100KB cap
  output TEXT CHECK (octet_length(output) <= 102400),         -- 100KB cap
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB,                                -- Executor-specific metadata

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ                         -- For webhook/approval steps
);

-- Idempotency: one step per event+attempt+step_type
CREATE UNIQUE INDEX idx_orch_steps_idempotent ON orchestration_steps(event_id, attempt, step_type);
CREATE INDEX idx_orch_steps_run ON orchestration_steps(run_id);
CREATE INDEX idx_orch_steps_agent ON orchestration_steps(agent_id, created_at DESC);
CREATE INDEX idx_orch_steps_active ON orchestration_steps(status) WHERE status IN ('pending', 'claimed', 'running');
CREATE INDEX idx_orch_steps_callback ON orchestration_steps(id) WHERE callback_status = 'pending';

-- RLS (same pattern as agent_runs)
ALTER TABLE orchestration_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read" ON orchestration_steps FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- Service role only for writes (workers use service role)
CREATE POLICY "service_write" ON orchestration_steps FOR ALL
  USING (auth.role() = 'service_role');
```

### 2.9 BaseWorker Integration

The change to `BaseWorker` is minimal and backwards-compatible:

```typescript
// BaseWorker gains:
private executorRegistry?: ExecutorRegistry
private activeAbortControllers = new Map<string, AbortController>()

// Constructor accepts optional registry
constructor(queue, workerId, config?, executorRegistry?) {
  // ...existing
  this.executorRegistry = executorRegistry
}

// processJob updated (existing method):
private async processJob(job: PulseJob): Promise<void> {
  const ac = new AbortController()
  this.activeAbortControllers.set(job.runId, ac)
  const startMs = Date.now()
  try {
    await withSpan(`pulse.process.${this.getEventType()}`, { ... }, async () => {
      const stepType = job.stepType ?? job.eventType
      const executor = this.executorRegistry?.resolve(stepType)
      if (executor) {
        await executor.execute({
          job,
          supabase: this.supabase,        // NEW: passed in constructor
          config: this.workerConfig,       // NEW: passed in constructor
          encryptionService: this.encryptionService,  // NEW: passed in constructor
          abortController: ac,
        })
      } else {
        await this.process(job)           // Existing fallback
      }
      await this.queue.complete(job, this.workerId)
      recordComplete(job, Date.now() - startMs)
    })
  } catch (err) {
    // ... existing queue.fail() + recordFail()
  } finally {
    this.activeAbortControllers.delete(job.runId)
    this.inflightCount--
    this.stopLeaseRenewal(job.runId)
  }
}
```

**Key points:**
- `supabase`, `workerConfig`, `encryptionService` are new constructor params on BaseWorker (passed from index.ts startup)
- Abstract `process(job)` stays as fallback — existing subclasses work unchanged
- `executorRegistry` is optional — if not provided, all jobs go through `process(job)`
- Complete/fail logic is unchanged: throw = fail, no throw = complete

### 2.10 PulseJob Extension

```typescript
interface PulseJob {
  // Existing fields (unchanged)
  runId: string
  eventId: string
  eventType: PulseEventType    // Still 'inbound' | 'outbound' | 'scheduled'
  agentId: string
  orgId: string
  priority: PulsePriority
  attempt: number
  enqueuedAt: number

  // New (Phase 3N) — all optional, backwards compatible
  stepType?: string              // Overrides eventType for executor resolution
  stepId?: string                // orchestration_steps.id (for tracking)
  webhookUrl?: string            // For webhook executor
  webhookPayload?: string        // Serialized JSON payload
  approvalConfig?: {             // For approval executor
    toolName: string
    toolArgs: Record<string, unknown>
    timeoutSeconds: number
  }
}
```

**PulseEventType is NOT extended.** Step types ('webhook', 'approval') live in `stepType` field, not `eventType`. This preserves the queue key scheme (`pulse:{inbound}:normal`) — step jobs are enqueued to the same queues as regular events. The event type determines which queue; the step type determines which executor.

**ZADD NX dedupe is preserved.** Step-specific fields (`stepType`, `stepId`, `webhookUrl`, etc.) are part of the serialized member. Different step types for the same event naturally produce different ZADD members (no collision). The `enqueueStep()` function generates a unique `eventId` per step (not reusing the parent event's ID), so NX dedupe works correctly.

## 3. Enqueue API

### 3.1 Step Enqueue (Worker-Side)

```typescript
// New function in worker/src/pulse/queue.ts
async enqueueStep(params: {
  eventId: string          // Generated: unique per step (not the parent event ID)
  eventType: PulseEventType  // Queue routing: 'inbound' (webhook/approval steps use inbound queue)
  agentId: string
  orgId: string
  stepType: string         // Executor routing: 'webhook' | 'approval'
  priority?: PulsePriority
  webhookUrl?: string
  webhookPayload?: Record<string, unknown>
  approvalConfig?: { toolName: string; toolArgs: Record<string, unknown>; timeoutSeconds: number }
}): Promise<string>  // Returns stepId (from orchestration_steps)
```

Internally calls `this.enqueue()` with the extended PulseJob fields. The step-specific fields are serialized as part of the ZADD member JSON.

### 3.2 Step Enqueue (Control Plane — for C2a/external)

New endpoint: `POST /api/runtimes/steps/enqueue`

Auth: `authenticateRuntime()` (same as other runtime endpoints). Org match verification.

## 4. Security

### Webhook Security
- HMAC-SHA256 callback tokens (recomputed from stepId, not stored in DB)
- `PULSE_WEBHOOK_SECRET` env var (required when webhook executor is used)
- HTTPS-only webhook URLs (validated at enqueue)
- 5-minute default timeout prevents indefinite lease hold
- Callback endpoint is public (token-authed, not API-key-authed) so external agents don't need runtime credentials
- Duplicate callbacks return 200 `{ alreadyReceived: true }` (idempotent)

### Approval Security
- Same `mc_pending_approvals` table and RLS as existing approval gate
- Risk level derived server-side (not caller-provided)
- Timeout marks as 'expired' (matching existing behavior)

### Step Table Security
- RLS: org-scoped via `organization_members` join
- `input` capped at 100KB (DB CHECK constraint)
- `output` capped at 100KB (DB CHECK constraint)
- `callback_token` not stored (recomputed from stepId + HMAC secret)
- Idempotency: unique index on `(event_id, attempt, step_type)`

## 5. Observability

### OTel Spans
- `pulse.step.execute` — wraps each executor call (attributes: step_type, executor_type, agent_id)
- `pulse.step.webhook.post` — outbound webhook POST
- `pulse.step.webhook.wait` — callback polling duration
- `pulse.step.approval.wait` — approval polling duration

### Metrics
- `lucid.pulse.steps.enqueued` (by step_type)
- `lucid.pulse.steps.completed` (by step_type, executor_type)
- `lucid.pulse.steps.failed` (by step_type, reason)
- `lucid.pulse.steps.webhook_latency_ms` — time from POST to callback

### Feed Events
- `step_started`, `step_completed`, `step_failed` → `mc_feed_events_v`
- Includes step_type and executor_type for filtering

## 6. Migration Path

### Phase 3N-a: Executor Interface + ProcessorExecutor (Zero Behavior Change)
1. Add `supabase`, `workerConfig`, `encryptionService` to BaseWorker constructor
2. Add per-job `AbortController` to BaseWorker.processJob()
3. Add `stop()` abort propagation
4. Create `StepExecutor` interface and `ExecutorRegistry`
5. Create `ProcessorExecutor` wrapping existing processors (throw-based)
6. Wire `BaseWorker` to use registry (optional, fallback to `process()`)
7. Add `stepType` and other optional fields to PulseJob type
8. All existing tests must pass unchanged

### Phase 3N-b: Step Tracking Table + WebhookExecutor
1. Migration: `orchestration_steps` table with CHECK constraints, RLS, indexes
2. Create `WebhookExecutor` with POST + poll-for-callback (throw on failure)
3. Create `POST /api/runtimes/step-callback` endpoint (HMAC recomputed, not stored)
4. Create `POST /api/runtimes/steps/enqueue` endpoint
5. Wire step tracking into executor lifecycle

### Phase 3N-c: ApprovalExecutor + Tests
1. Create `ApprovalExecutor` (reuses `estimateRiskLevel()`, marks timeout as 'expired')
2. Integration tests: webhook flow (mock external agent)
3. Integration tests: approval flow
4. Contract sync tests for new types

## 7. Accepted Tradeoffs

1. **Polling for webhook callbacks** — WebhookExecutor polls `orchestration_steps` every 5s instead of using WebSockets or Supabase Realtime. Simpler, works with any Redis/DB setup, and 5s is acceptable for step-level workflows.

2. **No webhook retry queue** — Failed webhook POSTs retry inline (3 attempts with backoff). No separate retry queue. If all 3 fail, the executor throws → `queue.fail()` → normal Pulse retry/DLQ.

3. **Callback token recomputed, not stored** — HMAC is deterministic from `stepId + runId + secret`. Callback endpoint recomputes and compares. No token in DB to leak.

4. **No streaming for webhook executor** — External agents return the full result in the callback. External agents that need streaming should use C2a (self-sovereign) instead.

5. **Executors throw, don't return StepResult** — Matches BaseWorker's existing throw-based complete/fail contract. No dual code path. Step metadata is written to `orchestration_steps` directly by the executor (best-effort, like agent_runs).

6. **PulseEventType not extended** — Step types live in `stepType` field, not `eventType`. Queue routing uses eventType; executor routing uses stepType. No changes to queue key scheme or ZADD member dedupe.

## 8. Deferred (Phase 4N+)

- **DAG execution** — `parent_step_id` column exists but is unused. Phase 4N (DagPlanner) will create multi-step DAGs.
- **Conditional steps** — Steps that run only if a previous step produced a certain output. Phase 4N.
- **Confidence scoring per step** — Phase 5N.
- **Webhook streaming protocol** — SSE or WebSocket for long-running external agents.
- **Step timeline UI** — Visual step-by-step workflow view in Mission Control.

## 9. File Structure (Planned)

```
worker/src/pulse/
├── executors/
│   ├── types.ts              # StepExecutor, StepExecutionContext
│   ├── registry.ts           # ExecutorRegistry
│   ├── processor.ts          # ProcessorExecutor (wraps existing, throws on failure)
│   ├── webhook.ts            # WebhookExecutor (POST + callback poll, throws on failure)
│   ├── approval.ts           # ApprovalExecutor (mc_pending_approvals poll, throws on failure)
│   ├── step-tracker.ts       # orchestration_steps CRUD helpers (best-effort)
│   └── index.ts              # Barrel + createDefaultRegistry()
├── workers/
│   └── base-worker.ts        # Modified: optional ExecutorRegistry, per-job AbortController
├── types.ts                  # Modified: PulseJob gains stepType, stepId, etc.
└── __tests__/
    ├── executor-registry.test.ts
    ├── processor-executor.test.ts
    ├── webhook-executor.test.ts
    ├── approval-executor.test.ts
    └── step-integration.test.ts

src/app/api/runtimes/
├── step-callback/route.ts    # Webhook callback endpoint (HMAC recomputed)
└── steps/
    └── enqueue/route.ts      # Step enqueue endpoint

contracts/pulse.ts              # Extended: step-related optional fields on PulseJob

supabase/migrations/
└── 20260406200000_orchestration_steps.sql
```

## 10. Codex Review Resolutions

| Finding | Severity | Resolution |
|---------|----------|------------|
| StepResult return semantics incompatible with throw-based processJob() | P0 | Executors throw on failure, return void on success. No StepResult. |
| No per-job AbortController for long-polling executors | P0 | Added AbortController per job in processJob(), stop() aborts all |
| enqueueStep() incompatible with PulseQueue.enqueue() + ZADD NX dedupe | P0 | Step-specific fields serialized in ZADD member. Unique eventId per step. PulseEventType unchanged. |
| ProcessorExecutor catching exceptions changes behavior | P1 | ProcessorExecutor doesn't catch — it lets exceptions propagate to BaseWorker's existing catch block |
| Plan inconsistency: "remove process()" vs "keep process()" | P1 | process() stays. ProcessorExecutor delegates to it. BaseWorker uses executor if registry set, else fallback to process(). |
| callback_token stored raw in DB | P1 | Token NOT stored. Recomputed from stepId + runId + HMAC secret on callback receipt. |
| ApprovalExecutor "auto-deny" vs existing "expired" status | P1 | Matches existing: timeout marks as 'expired', not 'denied' |
| Risk level caller-provided vs server-derived | P1 | Server-derived via existing estimateRiskLevel() from tool name |
| Missing event_id, attempt columns | P1 | Added to schema. Unique index on (event_id, attempt, step_type). |
| No size constraints in DB | P1 | CHECK constraints on input (100KB) and output (100KB) |
| StepExecutionContext requires fields BaseWorker doesn't have | P1 | BaseWorker constructor extended with supabase, workerConfig, encryptionService |

## 11. Success Criteria

- [ ] All existing 2679+ worker tests pass unchanged (zero regression)
- [ ] ProcessorExecutor produces identical behavior to direct processor calls
- [ ] WebhookExecutor: POST → callback → success lifecycle works
- [ ] WebhookExecutor: POST → inline 2xx response → success (sync path)
- [ ] WebhookExecutor: POST → timeout → throw → queue.fail() lifecycle
- [ ] ApprovalExecutor: insert → poll → approve → return lifecycle
- [ ] ApprovalExecutor: insert → timeout → 'expired' → throw lifecycle
- [ ] Callback endpoint: HMAC recomputation + step status update
- [ ] Step tracking: orchestration_steps populated for all step types
- [ ] Per-job AbortController: shutdown aborts polling executors cleanly
- [ ] OTel spans on all executor operations
- [ ] 50+ new tests covering all 3 executors + registry + callback + enqueue
