# Telegram Multi-Agent Deep Link — Design Spec

**Date**: 2026-04-07
**Status**: Design — pending approval
**Scope**: Make the shared hosted Telegram bot (`@LucidBot`) multi-agent safe so a single Telegram user can connect, switch between, and converse with several Lucid agents from one DM.

## 1. Problem Statement

The hosted Telegram channel (`/api/webhooks/telegram/hosted`) was designed assuming **one chat ↔ one agent**. In practice, an org owner who clicks "Connect Telegram" on multiple agents creates **N rows** in `assistant_channels` that all share the **same `external_channel_id` (Telegram chat id)**.

Current routing logic in `getHostedTelegramChannelByChatId`:

```sql
SELECT id, assistant_id FROM assistant_channels
WHERE channel_type='telegram' AND is_active=true AND external_channel_id=$1
ORDER BY updated_at DESC LIMIT 1
```

→ The **most recently connected agent silently steals** all inbound traffic from older siblings. Production already shows this: chat `853247773` is bound to 3 agents, and only `Test2` ever sees messages.

### Symptoms in production today
- User connects Agent A → works.
- User connects Agent B from same Telegram → A goes silent, no error, no notification.
- No way to talk to A or B from the same chat afterwards without going back to the Studio and re-clicking connect.
- Memory and history per agent are correctly isolated, but **invisible** to the user — they cannot reach the other agent from inside Telegram.

### Goal

> **One Telegram chat, many Lucid agents, one active speaker at a time, switchable from inside Telegram.**

A user should be able to:
1. Open a deep link from Studio (`t.me/LucidBot?start=agent_<id>`) and immediately start chatting with that specific agent.
2. Run `/agents` to see all agents bound to this chat.
3. Run `/switch <name>` (or tap an inline keyboard button) to change which agent receives messages.
4. Trust that switching never leaks history or memory across agents.

## 2. Constraints (Telegram Platform)

These are hard limits we must design around — not bugs:

| Constraint | Implication |
|---|---|
| One bot = one webhook URL | We cannot programmatically spin up a new bot per agent on shared hosting. `@LucidBot` is the only entry point for SaaS users. |
| One bot ↔ one DM thread per user | A user cannot have parallel chats with "Agent A version" and "Agent B version" of the same bot. There is exactly one DM thread per `(user, bot)`. |
| `/start PAYLOAD` deep links | `t.me/BotName?start=<payload>` is the standard multi-tenant entry point — Telegram delivers `/start <payload>` as the first message. Already used by GitHub, Notion, Linear bots. |
| Bot commands & inline keyboards | Standard primitives we already use. Free, no API limits beyond normal rate limits. |

**Out of scope:** Per-agent dedicated bots (BYOB) — already supported via the non-hosted flow. This spec is hosted-shared only.

## 3. Product Model

### 3.1 Per-chat active agent binding

A `(telegram_chat_id, telegram_user_id)` tuple has **exactly one active agent at a time**, even when several agents are bound to the chat. We add an explicit `is_primary` flag on `assistant_channels` (scoped to telegram + chat id), enforced by a partial unique index. Switching is a single UPDATE that flips the flag atomically.

> Why not "most-recently-updated wins"? Because routing must be **deterministic and observable**, not a side effect of `updated_at` ordering. The current bug is exactly this anti-pattern.

### 3.2 Three entry points to bind a chat

| Entry point | Trigger | Outcome |
|---|---|---|
| **Existing connect token flow** | `/start <opaque-token>` from a Studio "Connect" click | Binds the chat to the agent that minted the token (today's flow — preserved) |
| **Deep link share** | `/start agent_<assistantId>` from a shared link | Binds the chat to the named agent if the user has access OR the agent is `share_enabled=true` |
| **In-chat switching** | `/switch <name>` or inline keyboard tap | Re-binds an already-connected chat to a different sibling agent |

The opaque connect-token flow stays untouched — it is a **first-party connect** with a 5-minute one-time token. The deep link `agent_<id>` flow is **publicly shareable** and gated by an explicit `share_enabled` flag on the agent.

### 3.3 In-chat commands

| Command | Behavior |
|---|---|
| `/start` (no payload) | If chat has bindings → list them with inline keyboard. If not → onboarding text. |
| `/start <payload>` | Route to connect-token consumer or `agent_<id>` deep link consumer based on prefix. |
| `/agents` | Inline keyboard listing every agent bound to this chat. The active one is marked ✅. Tapping a row switches. |
| `/switch <name>` | Text-based switch by agent name (case-insensitive `ilike`). Returns confirmation or "ambiguous" error. |
| `/whoami` | Show the currently active agent and a one-line description. |
| `/leave` | Unbind the active agent from this chat (sets `is_active=false` on that row only). |

### 3.4 Memory & history isolation (already correct — document it)

Switching agents is **safe by construction** because every per-user state is keyed by `(assistant_id, scoped_user_id)`:

- `assistant_messages.assistant_id` — conversation history is per agent.
- `assistant_memory` keyed by `(assistant_id, scoped_user_id="telegram:<user_id>")` — long-term memory is per agent.
- `assistant_inbound_events.channel_id` → resolves to one specific `assistant_channels` row → one agent.

**Switching the active agent does not move, merge, or expose any state from the previous agent.** This is a property of the existing schema; this spec does not change it.

## 4. Data Model Changes

### 4.1 `assistant_channels` — add `is_primary`

```sql
ALTER TABLE assistant_channels
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Exactly one primary per (channel_type, external_channel_id) for telegram hosted
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_channels_primary_per_chat
  ON assistant_channels (channel_type, external_channel_id)
  WHERE is_primary = true AND is_active = true AND channel_type = 'telegram';
```

> The existing partial unique `UNIQUE(assistant_id, channel_type) WHERE is_active = true` stays — it prevents one agent from being double-bound.

### 4.2 `ai_assistants` — add `share_enabled`

```sql
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS telegram_share_enabled BOOLEAN NOT NULL DEFAULT false;
```

Off by default. Owners must explicitly opt in before a public deep link works. This prevents accidental exposure of private agents through shared URLs.

### 4.3 No new tables

The existing `assistant_channels` row is the binding. No `chat_agent_bindings` join table — that would duplicate state and create sync drift.

## 5. Routing Algorithm (replaces `getHostedTelegramChannelByChatId`)

```
Inbound message arrives for chat C, user U:
  1. SELECT id, assistant_id FROM assistant_channels
       WHERE channel_type='telegram'
         AND is_active=true
         AND external_channel_id=C
         AND is_primary=true
       LIMIT 1
  2. If found → route to that channel (existing path)
  3. If NOT found but bindings exist → reply with "/agents" prompt, do not enqueue
  4. If no bindings at all → reply with onboarding text, do not enqueue
```

Step 3 is the **explicit failure mode** for chats that lost their primary (e.g. owner ran `/leave`). We never silently fall back to "most recent" again.

## 6. Migration Strategy (existing conflicting chats)

Production chat `853247773` already has 3 active rows. The migration must pick a primary deterministically without losing any binding.

```sql
-- Promote the most-recently-updated row per chat to primary, leave others bound but inactive-primary
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY external_channel_id
           ORDER BY updated_at DESC
         ) AS rn
  FROM assistant_channels
  WHERE channel_type='telegram' AND is_active=true
)
UPDATE assistant_channels c
   SET is_primary = (r.rn = 1)
  FROM ranked r
 WHERE c.id = r.id;
```

This preserves today's effective behavior on day one (most-recent wins) **while making it explicit and switchable**. After migration, users discover the other agents via `/agents`.

## 7. Studio UI Surface

### 7.1 Channel card "Share link" affordance

On the Telegram channel card in the assistant detail page (existing `assistant-detail-client.tsx` channels tab), add when `is_active && hosted`:

- **Toggle**: "Allow public deep link" → flips `telegram_share_enabled` on the agent.
- **Read-only field** (visible only when toggle is on): `https://t.me/LucidBot?start=agent_<id>` with copy button + "Show QR" disclosure.
- **Help text**: "Anyone with this link can start chatting with this agent. Owner-only commands still require login in Studio."

### 7.2 No new pages

Everything else lives in Telegram itself — `/agents`, `/switch`, `/whoami`. The Studio surface is intentionally minimal to keep the cognitive load on the operator side.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| First message before any deep link | Reply with onboarding text + link to Studio. Do not enqueue. |
| Deep link to an agent with `share_enabled=false` | Reply: "This agent is private. Ask its owner for an invite." Do not bind. |
| Deep link to an agent in a different org than an existing binding | Allowed — bindings are per chat, not per org. Memory isolation already guarantees no cross-org leakage. |
| Group chats | Out of scope for v1. Deep link only binds DMs (`chat.type === 'private'`). For groups, fall back to existing single-agent behavior + log a warning. |
| User runs `/switch <name>` with ambiguous match | Reply with the disambiguation list using inline keyboard. |
| User runs `/leave` while only one agent is bound | Unbind, then send onboarding text. Chat returns to step 4 of routing. |
| Bot blocked by user | Telegram returns 403 on next outbound — existing channel error handling covers this. |
| Race: two inbound events while switching | The UPDATE flipping `is_primary` is a single transaction. The unique index guarantees at most one primary at any instant. |

## 9. Observability

- New `appendTelegramServerLog` events: `chat_bound_via_deep_link`, `chat_switched`, `chat_left`, `routing_no_primary`, `share_disabled_blocked`.
- Counter metric `lucid.telegram.hosted.chat_switches` (by reason: `/switch`, `/agents`, `/start`).
- Counter `lucid.telegram.hosted.routing_dropped` (by reason: `no_primary`, `no_bindings`, `share_disabled`).

## 10. Non-Goals

- Allowing **simultaneous** parallel responses from multiple agents in the same chat (Telegram does not support sub-threads in DMs).
- Cross-agent memory bridging on switch — that is the **Crew Mode** + **Board Memory** feature surface, not this one.
- Owner-only admin commands (e.g. `/audit`) — deferred.
- Group chat support — deferred to v2.
- BYOB (per-agent dedicated bot) changes — already works, untouched.

## 11. Open Questions

1. Should `/agents` show **only this user's** agents (filtered by ownership) or **every agent** bound to the chat? Lean: every agent bound to this chat — the chat itself is the access ledger.
2. Should we cap the number of agents bound to a single chat? Soft limit 10 per `(chat_id)` to keep `/agents` keyboards usable.
3. Do we want a `/help` command that lists every command? Yes, free to add.

## 12. Success Criteria

- The production chat `853247773` can reach all 3 of its currently bound agents via `/agents` after deploy, with no manual DB intervention.
- A new user clicking a shared deep link reaches a working agent in under 10 seconds, with no Studio login.
- Zero cross-agent message leakage in integration tests across `assistant_messages` and `assistant_memory`.
- Routing dropped events are visible in metrics and explainable in logs.
