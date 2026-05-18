# Channel Adapter Architecture (OpenClaw Bridge)

## Purpose

`worker/src/channels/ChannelAdapter.ts` adapts OpenClaw channel outbound plugins to the internal `ChannelOutput` lifecycle.

It is intentionally limited to **delivery mechanics** (streaming, chunking, edits, fallback), while control-plane guarantees remain in inbound pipeline guards.

---

## Responsibility Boundary

### Adapter owns
- placeholder/edit streaming UX
- markdown-safe chunking policy
- per-channel send/edit behavior
- flush cadence + rate-limit backoff behavior
- fail-open delivery fallback when edit path fails

### Adapter does not own
- dedup/idempotency source-of-truth
- policy and run budgets
- encryption-at-rest decisions
- conversation lock ownership
- tenant/user rate-limit guard decisions

---

## Lifecycle Contract

Internal contract (`ChannelOutput`):

1. `begin()`
2. `status(label)` (optional, transient, zero or more)
3. `append(delta)` (zero or more)
4. `finalize(fullText)` or `error(err)`

`status(label)` is for operational progress only, such as “Reading relevant memory” or “Checking live market data”.
It must never become part of the final assistant answer. Implementations should use native status/edit-in-place
behavior where available, and ignore the call when the channel cannot render it safely.

Current renderers:

- Web streamed chat emits `data-progress-status` AI SDK parts, which the chat UI renders as a proper Thinking/status line.
- Web realtime chat also listens to Supabase Broadcast `agent-chat:<conversationId>` `stream` events for persisted channel updates.
- Slack native streaming uses `assistant.threads.setStatus` when the app has thread context and `slack_native_streaming=true`; Slack clears this status automatically when the app replies.
- Discord/Telegram-style editable channels use transient edit-in-place previews and clear them on first answer delta/final delivery.

### Runtime states
- `canStream`: static capability predicate from config/outbound implementation
- `streamingActive`: runtime flag enabled only after successful `begin()` with editable `messageId`
- `closed/finalizing/finalized`: terminal safety/idempotency guards

`append()` only buffers when `streamingActive=true`.

---

## Safety Invariants Implemented

1. **Markdown safety (Policy A)**
   - If `chunkerMode === 'markdown'`, stream editing is suppressed.
   - Final output is sent by finalized chunking only.

2. **No flush/finalize deadlock**
   - `finalize()` and `error()` wait for in-flight flush with bounded timeout.
   - On timeout, fail-open path continues delivery (no infinite hang).

3. **Soft failure enforcement**
   - Outbound `{ ok: false }` is treated as failure via `assertOk()`.

4. **Timeout discipline**
   - `withTimeout()` clears timer handles on resolve/reject.
   - Separate timeout profiles:
     - flush edit: short (`flushEditTimeoutMs`)
     - finalize send/edit: longer (`finalizeOpTimeoutMs`) to reduce false timeout duplicates

5. **Rate-limit backoff**
   - Exponential backoff on 429/rate-limit errors during flush edits.
   - Backoff resets after successful edit.

6. **Sanitized logging**
   - Adapter logs safe, bounded error summaries.
   - No raw thrown object serialization.

7. **Finalize idempotency**
   - Repeated `finalize()`/`error()` calls are guarded.

8. **Immediate memory cleanup on terminal paths**
   - `finalize()` and `error()` clear transient stream state (`buffer`, `lastFlushed`, `ref`).

9. **Progress does not pollute answers**
   - `status()` writes a transient preview only.
   - The first real `append()` clears status preview state before streaming answer text.
   - `finalize()` always replaces the preview with the final answer.

---

## Channel Progress

Lucid-owned channel progress is centralized in:

- `worker/src/core/progress/*`: engine-agnostic progress phases, label mapping, tool-event mapping.
- `worker/src/core/progress/tool-capabilities.ts`: exact first-party tool capability/status metadata, used before regex fallback.
- `worker/src/channels/progress/controller.ts`: channel renderer/dedupe controller.
- `contracts/template-composition.ts`: capability template `progress` metadata, so templates can declare native status copy without per-channel code.

The inbound processor owns the controller and passes an `onProgress` callback into agent engines.
OpenClaw and Hermes both emit tool progress through the same callback, so channel UX does not depend on
which engine or runtime executed the run.

### Design rules
- Engines emit structured progress; they do not send chat text.
- Labels are deterministic and centrally mapped from exact tool/template capability metadata before falling back to safe regex labels.
- Tool arguments and secrets are never rendered into status labels.
- Completion/failure events are recorded in controller history but do not replace final delivery.
- Native OpenClaw/Hermes runtime status primitives can be adapted into this contract without changing channels.

---

## Registry

`registerChannel()` and `createChannelOutput()` provide channel registration/lookup.

- Duplicate registration is rejected.
- Unregistered channel types return `null` so callers can use legacy/fallback paths.

---

## Tests

Primary test files:

- `worker/src/channels/__tests__/ChannelAdapter.test.ts`
- `worker/src/core/progress/__tests__/progress.test.ts`

Coverage includes:
- markdown streaming suppression
- flush/finalize race handling
- finalize fail-open fallback
- 429 backoff behavior
- finalize idempotency
- soft-failure (`ok:false`) enforcement
- no-buffer append when streaming disabled
- no-messageId runtime deactivation
- bounded finalize when flush never resolves
- transient progress status replacement
- capability/tool progress mapping
