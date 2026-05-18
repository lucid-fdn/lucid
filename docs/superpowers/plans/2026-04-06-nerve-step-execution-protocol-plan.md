# Nerve Phase 3N — Step Execution Protocol — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pluggable step executors for Pulse. ProcessorExecutor wraps existing processors (zero behavior change). WebhookExecutor enables external agents via HTTP callback. ApprovalExecutor makes approval a standalone step. Step tracking via `orchestration_steps` table.

**Tech Stack:** TypeScript, Vitest, Zod, @upstash/redis, Supabase

**Spec:** `docs/superpowers/specs/2026-04-06-nerve-step-execution-protocol-design.md`

---

## File Structure

### Phase 3N-a: Executor Interface + ProcessorExecutor (files)

| File | Status | Responsibility |
|------|--------|---------------|
| `worker/src/pulse/executors/types.ts` | New | `StepExecutor` interface (void return, throw on failure), `StepExecutionContext` (with AbortController) |
| `worker/src/pulse/executors/registry.ts` | New | `ExecutorRegistry` class |
| `worker/src/pulse/executors/processor.ts` | New | `ProcessorExecutor` — wraps processInbound/Outbound/Scheduled |
| `worker/src/pulse/executors/index.ts` | New | Barrel + `createDefaultRegistry()` factory |
| `worker/src/pulse/types.ts` | Modified | PulseJob gains optional `stepType`, `stepId`, `webhookUrl`, `webhookPayload`, `approvalConfig` fields |
| `worker/src/pulse/workers/base-worker.ts` | Modified | Optional ExecutorRegistry, per-job AbortController, constructor gains supabase/workerConfig/encryptionService |
| `worker/src/pulse/workers/inbound-worker.ts` | Modified | Keep `process()` as fallback, pass registry to BaseWorker |
| `worker/src/pulse/workers/outbound-worker.ts` | Modified | Same |
| `worker/src/pulse/workers/scheduled-worker.ts` | Modified | Same |
| `worker/src/pulse/index.ts` | Modified | Export executor types |
| `worker/src/pulse/__tests__/executor-registry.test.ts` | New | Registry routing tests |
| `worker/src/pulse/__tests__/processor-executor.test.ts` | New | ProcessorExecutor conformance |

### Phase 3N-b: Step Tracking + WebhookExecutor (files)

| File | Status | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260406200000_orchestration_steps.sql` | New | Table with CHECK constraints, idempotency index, RLS |
| `worker/src/pulse/executors/webhook.ts` | New | WebhookExecutor (POST + inline 2xx + poll callback) |
| `worker/src/pulse/executors/step-tracker.ts` | New | orchestration_steps CRUD helpers (best-effort) |
| `worker/src/pulse/queue.ts` | Modified | Add `enqueueStep()` method |
| `contracts/pulse.ts` | Modified | Add `StepType`, step-related shared types |
| `src/app/api/runtimes/step-callback/route.ts` | New | Webhook callback endpoint (HMAC recomputed, not stored) |
| `src/app/api/runtimes/steps/enqueue/route.ts` | New | Step enqueue endpoint |
| `src/lib/mission-control/schemas.ts` | Modified | Add step callback + enqueue schemas |
| `worker/src/pulse/__tests__/webhook-executor.test.ts` | New | Webhook POST + inline 2xx + callback + timeout tests |
| `worker/src/pulse/__tests__/step-tracker.test.ts` | New | Step CRUD tests |

### Phase 3N-c: ApprovalExecutor + Integration Tests (files)

| File | Status | Responsibility |
|------|--------|---------------|
| `worker/src/pulse/executors/approval.ts` | New | ApprovalExecutor (mc_pending_approvals poll, server-side risk level, 'expired' timeout) |
| `worker/src/pulse/__tests__/approval-executor.test.ts` | New | Approval lifecycle tests |
| `worker/src/pulse/__tests__/step-integration.test.ts` | New | End-to-end multi-executor tests |
| `worker/src/pulse/__tests__/contract-sync.test.ts` | Modified | Add step-related contract sync checks |

---

## Phase 3N-a: Executor Interface + ProcessorExecutor — DONE

### Chunk 1: Executor Types + Registry

- [x] **Task 1: Create `worker/src/pulse/executors/types.ts`**
  - `StepExecutor` interface:
    - `readonly type: string` — executor type identifier
    - `execute(ctx: StepExecutionContext): Promise<void>` — **void return, throw on failure** (matches BaseWorker's throw-based contract)
    - `canHandle(stepType: string): boolean` — routing predicate
  - `StepExecutionContext`:
    - `job: PulseJob`
    - `supabase: SupabaseClient`
    - `config: WorkerConfig`
    - `encryptionService: EncryptionService`
    - `abortController: AbortController` — per-job, aborted on graceful shutdown
  - `StepType` union: `'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'`
  - **No `StepResult` type** — executors return void on success, throw on failure

- [x] **Task 2: Create `worker/src/pulse/executors/registry.ts`**
  - `ExecutorRegistry` class with `register(executor)` and `resolve(stepType)` methods
  - Resolution: first executor whose `canHandle(stepType)` returns true
  - Returns null if no executor matches (caller falls back to `this.process(job)`)

- [x] **Task 3: Create `worker/src/pulse/executors/index.ts`**
  - Barrel exports
  - `createDefaultRegistry()` factory that registers ProcessorExecutor

### Chunk 2: ProcessorExecutor

- [x] **Task 4: Create `worker/src/pulse/executors/processor.ts`**
  - `ProcessorExecutor` class implementing `StepExecutor`
  - `canHandle()`: returns true for 'inbound', 'outbound', 'scheduled'
  - `execute()`: delegates to existing processor functions
    - 'inbound': load event from DB → `processInboundEvent()`
    - 'outbound': load event from DB → `processOutboundEvent()`
    - 'scheduled': load task from DB → `processScheduledTask()`
  - Must replicate the exact same DB loading + status update logic currently in each worker subclass
  - **Does NOT catch exceptions** — lets them propagate to BaseWorker's existing catch block (throw = fail)
  - OTel span: `pulse.step.execute` with step_type + executor_type attributes

- [x] **Task 5: Extend `PulseJob` in `worker/src/pulse/types.ts`**
  - Add optional fields: `stepType?: string`, `stepId?: string`, `webhookUrl?: string`, `webhookPayload?: string`, `approvalConfig?: { toolName: string; toolArgs: Record<string, unknown>; timeoutSeconds: number }`
  - Backwards compatible — all existing code works without these fields
  - Update `contracts/pulse.ts` to match

### Chunk 3: BaseWorker Integration

- [x] **Task 6: Modify `worker/src/pulse/workers/base-worker.ts`**
  - **Constructor**: accept new params: `supabase`, `workerConfig`, `encryptionService` (store as protected fields). Accept optional `ExecutorRegistry`.
  - **Per-job AbortController**: `processJob()` creates `AbortController` per job, stores in `activeAbortControllers: Map<string, AbortController>`
  - **`stop()` method**: abort all active controllers (`for (const [, ac] of this.activeAbortControllers) ac.abort()`) before existing wait loop
  - In `processJob()`: resolve executor via `registry.resolve(job.stepType ?? job.eventType)`
  - If executor found: call `executor.execute({ job, supabase, config: workerConfig, encryptionService, abortController })`
  - If no executor: fall through to existing abstract `process(job)` (backwards compat)
  - Complete/fail logic unchanged: no throw = `queue.complete()`, throw = `queue.fail()`
  - `finally` block: `activeAbortControllers.delete(job.runId)` + existing cleanup

- [x] **Task 7: Update worker subclasses**
  - `InboundWorker`: keep `process()` as backwards compat fallback, pass `supabase`/`workerConfig`/`encryptionService`/registry to BaseWorker constructor
  - `OutboundWorker`: same
  - `ScheduledWorker`: same
  - The subclass `process()` method becomes the fallback path (used when no executor matches)
  - **Critical**: existing behavior must be IDENTICAL — no functional changes

- [x] **Task 8: Update `worker/src/pulse/index.ts`**
  - Export: `StepExecutor`, `StepExecutionContext`, `ExecutorRegistry`, `ProcessorExecutor`
  - Export: `createDefaultRegistry`

### Chunk 4: Tests (Phase 3N-a)

- [x] **Task 9: Create `executor-registry.test.ts`**
  - Registry resolves correct executor by stepType
  - First-match semantics (priority ordering)
  - Returns null for unknown stepType
  - Multiple executors can coexist
  - 8-10 tests

- [x] **Task 10: Create `processor-executor.test.ts`**
  - canHandle returns true for inbound/outbound/scheduled, false for webhook/approval
  - Execute delegates to correct processor for each event type
  - Returns normally (void) on success
  - Lets exceptions propagate on failure (throw-based contract)
  - Handles missing event in DB → throws
  - Per-job AbortController passed in context
  - 12-15 tests

- [x] **Task 11: Verify all existing tests pass**
  - `cd worker && npm run test -- --run` — all 2679+ tests must pass
  - `cd worker && npm run typecheck` — clean
  - This is the critical zero-regression gate

---

## Phase 3N-b: Step Tracking + WebhookExecutor — DONE

### Chunk 5: Database Migration

- [x] **Task 12: Create `20260406200000_orchestration_steps.sql`**
  - `orchestration_steps` table (schema from spec Section 2.8):
    - `id UUID PK`, `run_id TEXT NOT NULL`, `event_id UUID NOT NULL`, `attempt INTEGER NOT NULL DEFAULT 0`
    - `parent_step_id UUID REFERENCES orchestration_steps(id)` (for Phase 4N DAG)
    - `step_type TEXT NOT NULL CHECK (step_type IN ('inbound', 'outbound', 'scheduled', 'webhook', 'approval'))`
    - `executor_type TEXT NOT NULL` ('processor', 'webhook', 'approval')
    - `agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE`
    - `org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
    - `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'cancelled'))`
    - `webhook_url TEXT`, `callback_status TEXT CHECK (callback_status IN ('pending', 'received'))`
    - NOTE: `callback_token` is NOT stored — recomputed from stepId + runId + PULSE_WEBHOOK_SECRET
    - `approval_id UUID` (no FK — best-effort reference to mc_pending_approvals)
    - `input JSONB CHECK (octet_length(input::text) <= 102400)` (100KB cap)
    - `output TEXT CHECK (octet_length(output) <= 102400)` (100KB cap)
    - `error_message TEXT`, `duration_ms INTEGER`, `metadata JSONB`
    - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `started_at TIMESTAMPTZ`, `completed_at TIMESTAMPTZ`, `timeout_at TIMESTAMPTZ`
  - Idempotency index: `CREATE UNIQUE INDEX idx_orch_steps_idempotent ON orchestration_steps(event_id, attempt, step_type)`
  - Indexes: `run_id`, `agent+created_at`, active status partial, callback pending partial
  - RLS: `org_members_read` (SELECT via organization_members join) + `service_write` (ALL for service_role)
  - Grant appropriate permissions

### Chunk 6: Step Tracker

- [x] **Task 13: Create `worker/src/pulse/executors/step-tracker.ts`**
  - `createStep(supabase, params)` → insert into orchestration_steps, return stepId
  - `updateStepStatus(supabase, stepId, status, output?, errorMessage?, durationMs?)`
  - `getStepByIdForCallback(supabase, stepId)` → load step for callback endpoint (verify callback_status = 'pending')
  - All operations are best-effort (same pattern as agent_runs — errors logged, not thrown)
  - Types for step params

### Chunk 7: WebhookExecutor

- [x] **Task 14: Create `worker/src/pulse/executors/webhook.ts`**
  - `WebhookExecutor` implementing `StepExecutor`
  - `canHandle('webhook')` → true
  - `execute(ctx)` — **returns void on success, throws on failure** (matches BaseWorker contract):
    1. Generate HMAC callback token: `HMAC-SHA256(stepId + runId, PULSE_WEBHOOK_SECRET)` — recomputed, NOT stored
    2. Create step in orchestration_steps (status: 'running', callback_status: 'pending')
    3. POST payload to `job.webhookUrl`:
       - Body: `{ stepId, runId, eventId, eventType, agentId, orgId, callbackUrl, callbackToken, payload, timeoutSeconds }`
       - Headers: `Content-Type: application/json`, `X-Pulse-Step-Id: stepId`
       - 3 retries with exponential backoff (1s, 2s, 4s) on 5xx/timeout
       - No retry on 4xx
    4. **Inline response support**: If POST returns 2xx with JSON `{ status, output?, errorMessage? }`, treat as inline callback — skip polling
    5. If no inline response: poll `orchestration_steps.callback_status` every 5s until 'received' or timeout
    6. On callback received: read output/error from step row → return normally (success) or throw (if callback status is 'failed')
    7. On timeout: throw with "Step timed out" → BaseWorker calls `queue.fail()`
  - `ctx.abortController.signal` respected — abort cancels polling, executor throws on abort
  - OTel spans: `pulse.step.webhook.post`, `pulse.step.webhook.wait`

- [x] **Task 15: Add `PULSE_WEBHOOK_SECRET` to worker config**
  - `worker/src/config.ts`: add optional `PULSE_WEBHOOK_SECRET` env var
  - WebhookExecutor checks it exists before executing (throw if missing — fail-fast)

- [x] **Task 16: Add `enqueueStep()` to `worker/src/pulse/queue.ts`**
  - Accepts: `{ eventId: string (generated unique per step, NOT parent event ID), eventType: PulseEventType (queue routing — webhook/approval use 'inbound' queue), agentId, orgId, stepType, priority?, webhookUrl?, webhookPayload?, approvalConfig? }`
  - Creates PulseJob with stepType + step-specific fields serialized in ZADD member JSON
  - **PulseEventType NOT extended** — step types live in `stepType` field, `eventType` routes to queue
  - Calls existing `enqueue()` with the extended job
  - Returns stepId (from step tracker)

### Chunk 8: Callback + Enqueue Endpoints

- [x] **Task 17: Create `src/app/api/runtimes/step-callback/route.ts`**
  - POST endpoint: `{ stepId, callbackToken, status, output?, errorMessage? }`
  - Zod validation for request body
  - HMAC recomputation: recompute `HMAC-SHA256(stepId + runId, PULSE_WEBHOOK_SECRET)` from step row's `run_id` — compare via `crypto.timingSafeEqual`
  - Load step from DB, verify status = 'running' and callback_status = 'pending'
  - **Duplicate callback idempotency**: if `callback_status = 'received'`, return 200 `{ alreadyReceived: true }` (same pattern as complete-inbound)
  - Update: output, error_message, callback_status = 'received', completed_at, status
  - Return 200 on success, 401 on invalid token, 409 on step not in expected state
  - No `authenticateRuntime()` — uses HMAC token auth instead (external agents don't have runtime keys)

- [x] **Task 18: Create `src/app/api/runtimes/steps/enqueue/route.ts`**
  - POST endpoint: `{ eventId, eventType, agentId, orgId, stepType, webhookUrl?, webhookPayload?, approvalConfig? }`
  - Auth: `authenticateRuntime()`
  - Org match verification (agent belongs to runtime's org)
  - Webhook URL validation (HTTPS-only)
  - Calls claim-proxy or direct enqueue depending on availability
  - Returns: `{ stepId, runId }`

- [x] **Task 19: Add Zod schemas to `src/lib/mission-control/schemas.ts`**
  - `stepCallbackSchema`: stepId UUID, callbackToken string, status enum ('completed'|'failed'), output optional, errorMessage optional
  - `enqueueStepSchema`: eventId UUID, eventType enum, agentId UUID, orgId UUID, stepType enum, webhookUrl optional URL (HTTPS), webhookPayload optional object, approvalConfig optional object

- [x] **Task 20: Update `contracts/pulse.ts`**
  - Add `StepType` type: `'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'`
  - Add step-related optional fields to PulseJob type
  - Update worker-side `types.ts` to match

### Chunk 9: Tests (Phase 3N-b)

- [x] **Task 21: Create `webhook-executor.test.ts`**
  - POST delivery: correct payload, headers, URL
  - Retry on 5xx (3 attempts with backoff)
  - No retry on 4xx
  - **Inline 2xx response**: POST returns `{ status: 'completed', output }` → no polling, returns normally
  - Callback received (via polling) → returns normally (success)
  - Callback received with `status: 'failed'` → throws
  - Callback timeout → throws with "Step timed out"
  - **Duplicate callback**: returns 200 `{ alreadyReceived: true }`
  - Abort signal cancels polling → throws
  - HMAC token is deterministic (recomputed from stepId + runId)
  - Missing PULSE_WEBHOOK_SECRET → throws immediately
  - 18-22 tests

- [x] **Task 22: Create `step-tracker.test.ts`**
  - Create step → returns stepId
  - Update status transitions
  - Get step for callback verification
  - Best-effort: DB errors logged, not thrown
  - Idempotency: unique index on (event_id, attempt, step_type)
  - 8-10 tests

- [x] **Task 23: Verify full test suite**
  - `npm run typecheck` — frontend clean
  - `npm run test -- --run` — all frontend tests pass
  - `cd worker && npm run typecheck` — worker clean
  - `cd worker && npm run test -- --run` — all worker tests pass (2679+ existing + new)

---

## Phase 3N-c: ApprovalExecutor + Integration Tests — DONE

### Chunk 10: ApprovalExecutor

- [x] **Task 24: Create `worker/src/pulse/executors/approval.ts`**
  - `ApprovalExecutor` implementing `StepExecutor`
  - `canHandle('approval')` → true
  - `execute(ctx)` — **returns void on success, throws on failure** (matches BaseWorker contract):
    1. Create step in orchestration_steps (status: 'running')
    2. **Risk level**: derive server-side via `estimateRiskLevel(job.approvalConfig.toolName)` from existing `approval-gate.ts` (NOT caller-provided)
    3. Insert `mc_pending_approvals` row (same schema as existing approval gate):
       - org_id, agent_id, run_id, tool_name, tool_args, risk_level (server-derived)
       - expires_at = now + timeoutSeconds (default 300)
    4. Poll `mc_pending_approvals` every 2s for resolution
    5. On approved → return normally (void = success)
    6. On denied → throw (BaseWorker calls `queue.fail()`)
    7. On timeout (expires_at reached) → mark as **'expired'** (NOT 'denied' — matches existing `approval-gate.ts:136` behavior), log in mc_approval_log, throw
  - `ctx.abortController.signal` respected — abort cancels polling, throws
  - OTel span: `pulse.step.approval.wait`

- [x] **Task 25: Register ApprovalExecutor in default registry**
  - `createDefaultRegistry()` in `executors/index.ts`: register WebhookExecutor + ApprovalExecutor + ProcessorExecutor
  - Order: WebhookExecutor, ApprovalExecutor, ProcessorExecutor (ProcessorExecutor is catch-all last)

### Chunk 11: Integration Tests

- [x] **Task 26: Create `approval-executor.test.ts`**
  - Insert → poll → approved → returns normally (void)
  - Insert → poll → denied → throws
  - Insert → timeout → marks 'expired' (not 'denied') → throws
  - Abort signal cancels polling → throws
  - Risk level derived via estimateRiskLevel(), not from caller
  - Correct mc_pending_approvals row shape
  - mc_approval_log written on timeout
  - 10-12 tests

- [x] **Task 27: Create `step-integration.test.ts`**
  - Full lifecycle: enqueueStep(webhook) → claim → WebhookExecutor POST → callback → complete
  - Full lifecycle: enqueueStep(approval) → claim → ApprovalExecutor → approve → complete
  - ProcessorExecutor still works for standard events (backwards compat)
  - Mixed executors in same registry
  - Step tracking: orchestration_steps populated correctly for each executor type
  - Per-job AbortController: shutdown aborts polling executors cleanly
  - 12-15 tests

- [x] **Task 28: Update `contract-sync.test.ts`**
  - Verify StepType exists in contracts/pulse.ts
  - Verify PulseJob step fields in both worker types.ts and contracts
  - 3-5 new tests

### Chunk 12: Final Verification

- [x] **Task 29: Full test suite verification**
  - `npm run typecheck` — frontend types clean
  - `npm run test -- --run` — all frontend tests pass
  - `cd worker && npm run typecheck` — worker types clean
  - `cd worker && npm run test -- --run` — all worker tests pass
  - Specific: `cd worker && npm run test -- --run src/pulse/__tests__/` — all Pulse tests pass

- [x] **Task 30: Update Nerve orchestration plan + spec**
  - Update parent plan: mark Phase 3N as Done
  - Update parent spec: Section 2.6 status, Section 7 success criteria
  - Update spec Section 8 (Gaps): remove items addressed by 3N

---

## Verification

### After Phase 3N-a (Executor Interface)
```bash
cd worker && npm run typecheck                        # Worker types ✓
cd worker && npm run test -- --run                    # All worker tests ✓ (zero regression)
```

### After Phase 3N-b (WebhookExecutor)
```bash
npm run typecheck                                     # Frontend types ✓
npm run test -- --run                                 # Frontend tests ✓
cd worker && npm run typecheck                        # Worker types ✓
cd worker && npm run test -- --run                    # Worker tests ✓
```

### After Phase 3N-c (ApprovalExecutor + Integration)
```bash
npm run typecheck                                     # Frontend types ✓
npm run test -- --run                                 # All frontend tests ✓
cd worker && npm run typecheck                        # Worker types ✓
cd worker && npm run test -- --run                    # All worker tests ✓
cd worker && npm run test -- --run src/pulse/__tests__/contract-sync.test.ts  # Sync guard ✓
```

### Staging
- Standard events (inbound/outbound/scheduled) still work identically via ProcessorExecutor
- Webhook: enqueue webhook step → external agent receives POST → calls back → step completes
- Webhook (inline): enqueue webhook step → external agent returns 2xx with result → step completes (no polling)
- Approval: enqueue approval step → MC shows pending approval → approve → step completes
- Approval timeout: approval step → timeout → marked 'expired' → step fails

---

## Summary

| Phase | Effort | Deliverables |
|-------|--------|-------------|
| 3N-a: Executor Interface | 1 day | StepExecutor (void/throw), ExecutorRegistry, ProcessorExecutor, per-job AbortController, BaseWorker constructor extension |
| 3N-b: WebhookExecutor | 2 days | orchestration_steps table (CHECK constraints, RLS, idempotency index), WebhookExecutor (inline 2xx + poll), callback endpoint (HMAC recomputed), step enqueue endpoint |
| 3N-c: ApprovalExecutor | 1 day | ApprovalExecutor (server-side risk, 'expired' timeout), integration tests, contract sync |
| **Total** | **4 days** | **3 executors, 1 table, 2 endpoints, ~60-70 tests** |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Executors return void, throw on failure | Matches BaseWorker's existing throw-based complete/fail contract. No dual code path. No StepResult. |
| Per-job AbortController in BaseWorker | Long-polling executors (webhook, approval) need cancellation on graceful shutdown. stop() aborts all active controllers. |
| BaseWorker constructor extended | Executors need supabase, workerConfig, encryptionService — passed from index.ts startup, stored as protected fields. |
| process() stays as fallback | Backwards compat. Subclasses that don't use registry still work. ProcessorExecutor delegates to process() internally. |
| ProcessorExecutor wraps, doesn't replace | Zero behavior change. Existing processors are battle-tested. Executor adds interface, not logic. |
| HMAC callback token recomputed, not stored | Deterministic from stepId + runId + secret. Callback endpoint recomputes and compares. No token in DB to leak. |
| Inline 2xx response for webhook | Simple sync external agents don't need callback protocol. POST returns result directly. |
| Duplicate callback idempotency | callback_status = 'pending' check. Already 'received' → 200 `{ alreadyReceived: true }`. |
| Risk level server-derived for approval | estimateRiskLevel() from tool name, not caller-provided. Prevents escalation. |
| Timeout marks 'expired', not 'denied' | Matches existing approval-gate.ts behavior. Consistent semantics. |
| PulseEventType NOT extended | Step types in `stepType` field. eventType routes to queue. No queue key scheme changes. |
| Unique eventId per step | enqueueStep() generates unique ID. ZADD NX dedupe works correctly. |
| orchestration_steps has event_id + attempt | Full traceability. Idempotency index on (event_id, attempt, step_type). |
| Step table separate from agent_runs | agent_runs = run-level. orchestration_steps = step-level. Different granularity. |
| Approval reuses mc_pending_approvals | Same table, same UI, same RLS. Only difference: standalone step vs inline tool-call gate. |
| Registry is first-match | Simple, predictable. ProcessorExecutor registered last as catch-all default. |
