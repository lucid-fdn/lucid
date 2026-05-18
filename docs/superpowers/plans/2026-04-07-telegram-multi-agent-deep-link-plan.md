# Telegram Multi-Agent Deep Link — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared `@LucidBot` chat multi-agent safe. One chat can be bound to several agents; one is primary at a time; users switch with `/agents`, `/switch`, `/whoami`, `/leave`. Public deep links via `/start agent_<id>` are gated by an explicit per-agent share toggle.

**Tech Stack:** TypeScript, Next.js 15, Supabase (PostgreSQL), Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-telegram-multi-agent-deep-link-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260407100000_telegram_multi_agent.sql` | `is_primary` column + partial unique index + `telegram_share_enabled` + backfill |
| `src/lib/telegram/hosted-router.ts` | Pure routing helpers: `parseStartPayload`, `resolveActiveAgent`, `listChatBindings`, `setPrimary`, `unbind` |
| `src/lib/telegram/hosted-commands.ts` | `/agents`, `/switch`, `/whoami`, `/leave`, `/help` command handlers (return Telegram API payloads, no I/O) |
| `src/lib/telegram/inline-keyboards.ts` | `agentsKeyboard(bindings, activeId)` builder + callback payload schema |
| `src/lib/telegram/__tests__/hosted-router.test.ts` | Routing helper unit tests |
| `src/lib/telegram/__tests__/hosted-commands.test.ts` | Command handler unit tests |
| `src/app/api/webhooks/telegram/hosted/__tests__/route.test.ts` | Webhook integration tests (mocked DB) |

### Modified files

| File | Change |
|------|--------|
| `src/lib/db/index.ts` | Replace `getHostedTelegramChannelByChatId` with `getPrimaryTelegramChannelForChat`, add `listTelegramChannelsForChat`, `setPrimaryTelegramChannel`, `unbindTelegramChannel`, `bindAgentToChatViaShare` |
| `src/app/api/webhooks/telegram/hosted/route.ts` | Dispatch on `parseStartPayload` result; handle `/agents`, `/switch`, `/whoami`, `/leave`; route inbound via primary; reply with onboarding when no primary |
| `src/lib/db/assistants.ts` (or wherever `ai_assistants` reads live) | Surface `telegram_share_enabled` in assistant fetches that feed the channel UI |
| `src/components/assistants/channels/telegram-card.tsx` (or current channel-card path) | Add "Allow public deep link" toggle + share URL display + copy/QR |
| `src/app/api/assistants/[id]/telegram-share/route.ts` | New PATCH endpoint that flips `telegram_share_enabled` (auth: org admin) |
| `worker/src/processors/inbound.ts` | No change required — already routes by `channel_id`. Add a guard log if `channel_id`'s row is no longer `is_primary` (defense in depth) |

### Preserved (unchanged)

| File | Status |
|------|--------|
| `consumeTelegramConnectToken` flow | Stays — first-party connect via opaque 5-minute token |
| `upsertHostedTelegramChannel` | Stays, but caller marks new row `is_primary=true` and demotes siblings in the same transaction |
| BYOB Telegram path | Untouched |

---

## Chunk 1: Database + Migration

- [ ] **Task 1: Add `is_primary` and partial unique index**
  - Migration: `supabase/migrations/20260407100000_telegram_multi_agent.sql`
  - `ALTER TABLE assistant_channels ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false`
  - `CREATE UNIQUE INDEX idx_assistant_channels_primary_per_chat ON assistant_channels (channel_type, external_channel_id) WHERE is_primary = true AND is_active = true AND channel_type = 'telegram'`

- [ ] **Task 2: Add `telegram_share_enabled` to `ai_assistants`**
  - Same migration
  - `ALTER TABLE ai_assistants ADD COLUMN IF NOT EXISTS telegram_share_enabled BOOLEAN NOT NULL DEFAULT false`

- [ ] **Task 3: Backfill primaries deterministically**
  - Same migration, after the index is created (the index is partial, so backfill must succeed)
  - `WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY external_channel_id ORDER BY updated_at DESC) AS rn FROM assistant_channels WHERE channel_type='telegram' AND is_active=true) UPDATE assistant_channels c SET is_primary = (r.rn = 1) FROM ranked r WHERE c.id = r.id`
  - Verify on staging: every chat with bindings has exactly one primary.

- [ ] **Task 4: Apply migration locally + on staging Supabase**
  - `supabase db push` against staging
  - Verify: `SELECT external_channel_id, COUNT(*) FILTER (WHERE is_primary), COUNT(*) FROM assistant_channels WHERE channel_type='telegram' AND is_active GROUP BY 1` — every group should be `(1, n)`.

## Chunk 2: DB Layer

- [ ] **Task 5: Replace `getHostedTelegramChannelByChatId`**
  - In `src/lib/db/index.ts`, deprecate the existing function (keep it as a thin wrapper for one release, log a warning).
  - Add `getPrimaryTelegramChannelForChat(chatId: string): Promise<{ id: string; assistant_id: string } | null>` — same shape, but filters `is_primary=true`.

- [ ] **Task 6: Add binding listing**
  - `listTelegramChannelsForChat(chatId: string): Promise<Array<{ id, assistant_id, assistant_name, is_primary }>>`
  - Joins `ai_assistants` for the display name. Order by `is_primary DESC, assistant_name ASC`.

- [ ] **Task 7: Add primary toggle**
  - `setPrimaryTelegramChannel(chatId: string, assistantId: string): Promise<{ ok: boolean; error?: 'not_bound' }>`
  - Single transaction: demote all rows for the chat (`is_primary=false`) then promote the target row (`is_primary=true`). Verify the target row exists and `is_active=true` first; return `not_bound` otherwise.

- [ ] **Task 8: Add unbind**
  - `unbindTelegramChannel(chatId: string, assistantId: string): Promise<void>`
  - Sets `is_active=false` and `is_primary=false` on the matching row. Does NOT promote a sibling — the next inbound message will surface the "no primary" path and the user picks one with `/agents`.

- [ ] **Task 9: Update `upsertHostedTelegramChannel`**
  - When inserting/updating, also demote any existing primary for the chat and promote the new row in the same transaction.
  - This preserves today's first-party connect UX: clicking "Connect" makes that agent the active speaker immediately.

- [ ] **Task 10: Add `bindAgentToChatViaShare`**
  - `bindAgentToChatViaShare({ assistantId, chatId, telegramUserId, botToken, webhookSecret })` — checks `telegram_share_enabled` on the agent, inserts or reuses an `assistant_channels` row, marks it primary atomically. Returns `{ ok, error? }` with `error: 'share_disabled' | 'agent_not_found'`.

## Chunk 3: Routing Helpers (Pure)

- [ ] **Task 11: `parseStartPayload`**
  - In `src/lib/telegram/hosted-router.ts`
  - Input: `text: string` (e.g. `/start agent_abc123`, `/start <opaque>`, `/start`)
  - Output: `{ kind: 'none' } | { kind: 'connect_token'; token: string } | { kind: 'agent_share'; assistantId: string }`
  - Rule: if payload starts with `agent_` and the rest matches a UUID (or short id), it's `agent_share`. Otherwise it's `connect_token`. No payload → `none`.

- [ ] **Task 12: `resolveActiveAgent`**
  - Thin wrapper around `getPrimaryTelegramChannelForChat` that returns a discriminated union: `{ kind: 'primary'; channel } | { kind: 'has_bindings_no_primary' } | { kind: 'no_bindings' }`. Lets the webhook branch cleanly.

## Chunk 4: Command Handlers

- [ ] **Task 13: `/agents` handler**
  - In `src/lib/telegram/hosted-commands.ts`
  - Calls `listTelegramChannelsForChat`. If empty → onboarding text. Otherwise builds a Telegram API payload with `text: "Agents in this chat:"` + an inline keyboard from `agentsKeyboard()`.

- [ ] **Task 14: Inline keyboard builder**
  - In `src/lib/telegram/inline-keyboards.ts`
  - `agentsKeyboard(bindings, activeId)` → `{ inline_keyboard: [...] }`. Each row: `[{ text: "✅ Agent A" | "Agent A", callback_data: "switch:<assistantId>" }]`. Cap at 10 rows (spec §11).
  - Callback payload schema: `switch:<uuid>`, validated by Zod on receipt.

- [ ] **Task 15: `/switch <name>` handler**
  - Resolve name via case-insensitive `ilike` against `ai_assistants.name` joined with the chat's bindings. Three outcomes:
    - 0 matches → "No agent named X is bound to this chat. Try /agents."
    - 1 match → call `setPrimaryTelegramChannel`, reply "✅ Switched to <name>."
    - >1 match → reply with the disambiguation inline keyboard.

- [ ] **Task 16: `/whoami`, `/leave`, `/help` handlers**
  - `/whoami` → reads primary, replies with name + one-line description.
  - `/leave` → calls `unbindTelegramChannel` for the current primary. Replies "Unbound. Use /agents to pick another."
  - `/help` → static text listing every command.

- [ ] **Task 17: `callback_query` handler**
  - The hosted webhook currently handles `message` only. Add a branch for `body.callback_query` that:
    1. Parses `data` as `switch:<uuid>` via Zod.
    2. Calls `setPrimaryTelegramChannel`.
    3. Calls Telegram `answerCallbackQuery` to dismiss the loading spinner.
    4. Edits the original message (or sends a new one) with the updated keyboard showing the new ✅.

## Chunk 5: Webhook Wiring

- [ ] **Task 18: Refactor `/api/webhooks/telegram/hosted/route.ts`**
  - Branches in this order:
    1. `body.callback_query` → callback handler (Task 17)
    2. `message.text` starts with `/start` → `parseStartPayload` → dispatch
       - `connect_token` → existing `consumeTelegramConnectToken` flow (UNCHANGED)
       - `agent_share` → `bindAgentToChatViaShare` → reply success or share-disabled error
       - `none` → if chat has bindings, run `/agents` handler; else onboarding
    3. `message.text` starts with `/agents`, `/switch`, `/whoami`, `/leave`, `/help` → command handlers
    4. Plain text message → `resolveActiveAgent`:
       - `primary` → existing `insertAssistantInboundEvent` + `triggerWorker` + `publishWakeForChannel`
       - `has_bindings_no_primary` → reply "No active agent. Use /agents to pick one." Drop the message.
       - `no_bindings` → onboarding text. Drop the message.
  - All branches must return `NextResponse.json({ ok: true })` to satisfy Telegram's webhook contract.

- [ ] **Task 19: Update `appendTelegramServerLog` calls**
  - New events: `chat_bound_via_deep_link`, `chat_switched`, `chat_left`, `routing_no_primary`, `share_disabled_blocked`.
  - Match the existing `event` + `message` + `context` shape.

## Chunk 6: Studio UI

- [ ] **Task 20: PATCH endpoint for `telegram_share_enabled`**
  - `src/app/api/assistants/[id]/telegram-share/route.ts`
  - PATCH: `{ enabled: boolean }`, Zod validated, CSRF protected, requires org admin/owner.
  - Updates `ai_assistants.telegram_share_enabled`. Returns the new value.

- [ ] **Task 21: Channel card share affordance**
  - In the existing assistant detail Telegram channel card component, when `is_active && hosted`:
    - Toggle: "Allow public deep link" → calls the PATCH endpoint, optimistic update.
    - When toggle is on, render a read-only input with `https://t.me/${LUCID_BOT_USERNAME}?start=agent_${assistantId}` + copy button (use existing `Copy` icon pattern from `share-button.tsx`).
    - Help text below: spec §7.1 wording.
  - `LUCID_BOT_USERNAME` reads from `process.env.NEXT_PUBLIC_LUCID_BOT_USERNAME` (new env var, defaulting to `LucidBot` for now).

## Chunk 7: Tests

- [ ] **Task 22: Routing helper unit tests** (`hosted-router.test.ts`)
  - `parseStartPayload`: 6+ cases covering `none`, `connect_token`, `agent_share`, malformed payloads.
  - `resolveActiveAgent`: mock DB; verify all 3 discriminant branches.

- [ ] **Task 23: Command handler unit tests** (`hosted-commands.test.ts`)
  - `/agents` empty + populated.
  - `/switch` with 0 / 1 / >1 matches.
  - `/whoami` with and without active.
  - `/leave` happy path.

- [ ] **Task 24: Webhook integration tests** (`route.test.ts`)
  - Mock `@/lib/db` + `fetch`. Drive the route with realistic Telegram update payloads.
  - Cases:
    - First-time `/start <opaque-token>` (regression — unchanged behavior).
    - `/start agent_<id>` with `share_enabled=true` → bound + primary.
    - `/start agent_<id>` with `share_enabled=false` → blocked + log event.
    - Plain message with one binding → enqueued.
    - Plain message with bindings but no primary → dropped + reply.
    - `/agents` → keyboard returned.
    - `callback_query: switch:<id>` → primary flipped + keyboard refreshed.

- [ ] **Task 25: DB layer tests**
  - `setPrimaryTelegramChannel` atomicity: spawn 2 concurrent calls for the same chat; assert exactly one primary survives.
  - `upsertHostedTelegramChannel` demotion: insert agent A, then agent B; assert B is primary and A is demoted.
  - Migration backfill correctness: seed 3 rows for one chat, run the backfill query, assert exactly 1 primary.

## Chunk 8: Migration & Telemetry

- [ ] **Task 26: Add OTel counters**
  - `lucid.telegram.hosted.chat_switches` (attrs: `reason`)
  - `lucid.telegram.hosted.routing_dropped` (attrs: `reason`)
  - `lucid.telegram.hosted.deep_link_bind` (attrs: `outcome`)
  - Defined in `src/observability/metrics.ts` (or wherever the existing telegram metrics live — verify before adding).

- [ ] **Task 27: Production migration plan**
  - Run migration on staging first. Verify `(1, n)` invariant from Task 4.
  - Open Supabase prod, run the same migration in a transaction. Re-verify the invariant.
  - Deploy webhook code AFTER the migration has applied — old webhook code still works against the new schema (it ignores `is_primary`), so there is no ordering hazard.

- [ ] **Task 28: Smoke test in production**
  - Pick the existing conflict chat `853247773`.
  - Send `/agents` from the user's Telegram → expect 3 rows.
  - Tap each agent → verify `/whoami` reflects the change and the next plain message routes to the right agent (check `assistant_inbound_events.channel_id`).

## Chunk 9: Validation Gate (per CLAUDE.md)

- [ ] **Task 29: Typecheck**
  - `npm run typecheck` (frontend) — must pass.
  - `cd worker && npm run typecheck` if any worker file changed (defense-in-depth log only — likely none).

- [ ] **Task 30: Test suite**
  - `npm run test -- --run src/lib/telegram src/app/api/webhooks/telegram` (changed area)
  - `npm run test -- --run` (full frontend suite, per CLAUDE.md production-readiness gate).
  - Fix every failure, including pre-existing ones in touched files.

- [ ] **Task 31: Codex rescue review** (per `feedback_integration_validation`)
  - Hand the diff to Codex with: "Review for race conditions in `setPrimaryTelegramChannel`, correctness of `parseStartPayload` regex, and any cross-tenant leakage in `bindAgentToChatViaShare`."
  - Apply every P0/P1 finding in the same session.

- [ ] **Task 32: Integration conclusion summary** (per `feedback_integration_conclusion_summary`)
  - Report: E2E results, smoke results, sim results, totals, typecheck status, Codex verdict, accepted tradeoffs, deferred items, files touched.

---

## Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Migration backfill leaves a chat without a primary | The window function partitions by `external_channel_id` and always promotes `rn=1`; impossible to leave a non-empty chat with zero primaries. Verified by Task 4. |
| Race condition flipping primaries under load | Single transaction + partial unique index. Worst case: one of two concurrent UPDATEs fails the unique constraint and we retry once. Tested in Task 25. |
| Public deep links leak access to private agents | Hard gated by `telegram_share_enabled=false` default. PATCH endpoint requires admin/owner. |
| Existing chats stop responding after migration | Behavior on day one is identical to today (most-recent wins → that row is the primary). Users discover other agents via `/agents` only when they choose to. |
| `callback_query` introduces a new Telegram surface we don't currently handle | Covered by Task 17 + integration test in Task 24. Telegram requires `answerCallbackQuery` within 5s — our handler is in-process and DB-only, well under that. |

## Deferred Items (out of scope)

- Group chat support (`chat.type !== 'private'`).
- Owner-only admin commands (`/audit`, `/stats`).
- Cross-agent memory bridging on switch (handled by Crew Mode + Board Memory separately).
- Per-agent dedicated bots on hosted plan.
- Soft cap on bindings per chat (>10) — enforced in UI only, not DB.
