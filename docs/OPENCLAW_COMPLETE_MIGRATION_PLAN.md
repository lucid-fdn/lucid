# OpenClaw Complete Channel Migration Plan (v2 — Corrected)

> **Status note (2026-05-08):** This plan is historical channel-migration context. Current channel and runtime behavior is engine/runtime agnostic: centralized Lucid channel contracts are shared by OpenClaw and Hermes, runtime compatibility lives in `packages/runtime-compat/`, adapter metadata lives in `packages/runtime-adapters/`, and the latest parity verification is documented in `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`.

> **Goal:** Unify ALL channels (Telegram, Discord, Slack, WhatsApp) through the OpenClaw bridge pattern, eliminating legacy direct-API implementations.
>
> **⚠️ v2 fixes 4 critical issues found during code review (see §Corrections below).**

## Current State Audit

### ✅ Already on OpenClaw (Partial)
| Channel | Plugin | Bridge | Outbound | Inbound |
|---------|--------|--------|----------|---------|
| Discord | `DiscordPlugin.ts` ✅ | `DiscordOpenClawBridge.ts` ✅ | ✅ Uses plugin | ❌ Legacy |
| Slack   | `SlackPlugin.ts` ✅ | `SlackOpenClawBridge.ts` ✅ | ✅ Uses plugin | ❌ Legacy |

### ❌ Still Legacy
| Channel | Plugin | Bridge | Outbound | Inbound |
|---------|--------|--------|----------|---------|
| Telegram | ❌ Missing | `TelegramOpenClawBridge.ts` ✅ | ❌ `sendTelegramMessage()` in outbound.ts | ❌ `TelegramOutput` class |
| WhatsApp | ❌ Missing | ❌ Missing | ❌ `sendWhatsAppMessage()` in outbound.ts | ❌ `WhatsAppOutput` class |

### Infrastructure Ready ✅
- `OpenClawBridgeContract.ts` — Contract interface
- `ChannelAdapter.ts` — `OpenClawChannelAdapter` + global registry (`registerChannel()`)
- `ChannelOutput.ts` — Lifecycle interface (`begin → append → finalize/error`)
- Contract tests for Telegram, Discord, Slack bridges

---

## Migration Plan

### Phase 1: Create Missing Plugins (Telegram + WhatsApp)

#### 1a. Create `TelegramPlugin.ts`
**File:** `worker/src/channels/bridge/telegram/TelegramPlugin.ts`

Port logic from:
- `worker/src/channels/telegram/TelegramOutput.ts` (sendMessage, editMessageText)
- `worker/src/processors/outbound.ts` (sendTelegramMessage function)

Must implement `OpenClawChannelPluginBridgeContract`:
```typescript
export function createTelegramPlugin(
  secrets: Record<string, string>,
): OpenClawChannelPluginBridgeContract {
  return {
    id: 'telegram',
    outbound: {
      deliveryMode: 'streamed',  // Telegram supports message editing
      chunker: telegramChunker,
      chunkerMode: 'plain',     // ⚠️ MUST be 'plain' — see Correction #1
      textChunkLimit: 4096,
      sendText: async (params) => { /* Bot API sendMessage */ },
      editText: async (params) => { /* Bot API editMessageText */ },
    }
  }
}
```

Key differences from Discord/Slack:
- `deliveryMode: 'streamed'` (supports editing for streaming UX)
- **`chunkerMode: 'plain'`** — Required! The `OpenClawChannelAdapter.canStream` check rejects `chunkerMode: 'markdown'` to avoid broken partial markdown during streaming edits. Using `'plain'` preserves the live-typing UX. Markdown-aware chunking still happens at finalize time via the `chunker` function.
- `parse_mode: 'Markdown'` on send
- `reply_to_message_id` support
- Rate limit awareness (30 msg/sec global, 1 edit/sec/chat)

#### 1b. Create `WhatsAppPlugin.ts`
**File:** `worker/src/channels/bridge/whatsapp/WhatsAppPlugin.ts`

Port logic from:
- `worker/src/channels/whatsapp/WhatsAppBusinessAPI.ts`
- `worker/src/channels/whatsapp/WhatsAppOutput.ts`
- `worker/src/processors/outbound.ts` (sendWhatsAppMessage function)

```typescript
export function createWhatsAppPlugin(
  secrets: Record<string, string>,
): OpenClawChannelPluginBridgeContract {
  return {
    id: 'whatsapp',
    outbound: {
      deliveryMode: 'direct',  // WhatsApp does NOT support editing
      chunker: whatsappChunker,
      chunkerMode: 'plain',
      textChunkLimit: 4096,
      sendText: async (params) => { /* Meta Cloud API */ },
      // No editText — WhatsApp doesn't support message editing
    }
  }
}
```

#### 1c. Create `WhatsAppOpenClawBridge.ts`
**File:** `worker/src/channels/bridge/whatsapp/WhatsAppOpenClawBridge.ts`

Follow the same pattern as `TelegramOpenClawBridge.ts`:
```typescript
export function createWhatsAppBridgeRegistration(plugin, options)
export function createWhatsAppBridgeOutput(plugin, config, options)
```

#### 1d. Update bridge index
**File:** `worker/src/channels/bridge/index.ts`

Add exports:
```typescript
export * from './telegram/TelegramPlugin.js'    // NEW
export * from './whatsapp/WhatsAppPlugin.js'     // NEW
export * from './whatsapp/WhatsAppOpenClawBridge.js'  // NEW
```

---

### ~~Phase 2: Wire Channel Registration at Worker Startup~~ — REMOVED

> **Correction #4:** The global registry in `ChannelAdapter.ts` takes static instances with 
> already-bound secrets, but each channel DB row has **different secrets** (different bot tokens
> per tenant). Discord/Slack outbound already create plugins **on-demand** per request — this 
> pattern works. Skip the global registry and create plugins on-demand in both `inbound.ts` 
> and `outbound.ts`. This avoids adding complexity for no benefit.

---

### Phase 2 (was 3): Update Inbound Processor

#### 2a. Replace `createChannelOutput()` in `inbound.ts`

Current (legacy):
```typescript
import { TelegramOutput } from '../channels/telegram/TelegramOutput.js'
import { WhatsAppOutput } from '../channels/whatsapp/WhatsAppOutput.js'

function createChannelOutput(channel, event, secrets): ChannelOutput | null {
  switch (channel.channel_type) {
    case 'telegram': return new TelegramOutput(baseConfig)
    case 'whatsapp': return new WhatsAppOutput(baseConfig, {...})
    default: return null
  }
}
```

New (OpenClaw bridge):
```typescript
import { createTelegramPlugin } from '../channels/bridge/telegram/TelegramPlugin.js'
import { createTelegramBridgeOutput } from '../channels/bridge/telegram/TelegramOpenClawBridge.js'
import { createDiscordPlugin } from '../channels/bridge/discord/DiscordPlugin.js'
import { createDiscordBridgeOutput } from '../channels/bridge/discord/DiscordOpenClawBridge.js'
import { createSlackPlugin } from '../channels/bridge/slack/SlackPlugin.js'
import { createSlackBridgeOutput } from '../channels/bridge/slack/SlackOpenClawBridge.js'
import { createWhatsAppPlugin } from '../channels/bridge/whatsapp/WhatsAppPlugin.js'
import { createWhatsAppBridgeOutput } from '../channels/bridge/whatsapp/WhatsAppOpenClawBridge.js'

function createChannelOutput(channel, event, secrets): ChannelOutput | null {
  const baseConfig = { channelId, chatId, replyToMessageId, botToken, channelType }
  
  switch (channel.channel_type) {
    case 'telegram': {
      const plugin = createTelegramPlugin(secrets)
      return createTelegramBridgeOutput(plugin, baseConfig)
    }
    case 'discord': {
      const plugin = createDiscordPlugin(secrets)
      return createDiscordBridgeOutput(plugin, baseConfig)
    }
    case 'slack': {
      const plugin = createSlackPlugin(secrets)
      return createSlackBridgeOutput(plugin, baseConfig)
    }
    case 'whatsapp': {
      const plugin = createWhatsAppPlugin(secrets)
      return createWhatsAppBridgeOutput(plugin, baseConfig)
    }
    default: return null
  }
}
```

#### 2b. Update streaming detection logic

Current:
```typescript
const isStreaming = channel.channel_type === 'telegram' || channel.channel_type === 'whatsapp'
```

**⚠️ Correction #3: Do NOT change this to include Discord/Slack.**

Discord and Slack currently use the **non-streaming path** intentionally — they go through `assistant_outbound_events` (queue-based delivery processed by `outbound.ts`). Discord messages also arrive via `DiscordGatewayManager` (WebSocket), not the inbound polling loop (see Correction #2). Making them "streaming" would bypass the outbound queue and change the architecture.

**Keep the current detection** for Telegram/WhatsApp only:
```typescript
const isStreaming = channel.channel_type === 'telegram' || channel.channel_type === 'whatsapp'
```

The `OpenClawChannelAdapter` handles streaming vs non-streaming internally via `canStream` — so channels that don't support editing will still work correctly through the adapter's `finalize()` path (sends all text as new messages without placeholder/editing).

---

### Phase 3 (was 4): Update Outbound Processor

#### 3a. Replace inline Telegram/WhatsApp functions in `outbound.ts`

Current state: Discord and Slack already use plugins. Telegram and WhatsApp still have inline functions.

New (unified):
```typescript
import { createTelegramPlugin } from '../channels/bridge/telegram/TelegramPlugin.js'
import { createWhatsAppPlugin } from '../channels/bridge/whatsapp/WhatsAppPlugin.js'

// In the switch:
case 'telegram': {
  const plugin = createTelegramPlugin(secrets)
  const result = await plugin.outbound.sendText({
    to: typedChannel.external_channel_id!,
    text: event.message_text,
    replyToId: event.reply_to_external_id || undefined,
  })
  if (!result.ok && result.error) throw new Error(`Telegram bridge error: ${result.error}`)
  externalMessageId = result.messageId ? String(result.messageId) : null
  break
}

case 'whatsapp': {
  const plugin = createWhatsAppPlugin(secrets)
  const result = await plugin.outbound.sendText({
    to: event.reply_to_external_id || typedChannel.external_channel_id!,
    text: event.message_text,
  })
  if (!result.ok && result.error) throw new Error(`WhatsApp bridge error: ${result.error}`)
  externalMessageId = result.messageId ? String(result.messageId) : null
  break
}
```

Remove the now-unused `sendTelegramMessage()` and `sendWhatsAppMessage()` functions.

---

### Phase 4 (was 5): Clean Up Legacy Code

After all channels are migrated and tested:

1. **Delete** `worker/src/channels/telegram/TelegramOutput.ts` (replaced by TelegramPlugin + bridge)
2. **Delete** `worker/src/channels/whatsapp/WhatsAppOutput.ts` (replaced by WhatsAppPlugin + bridge)
3. **Delete** `worker/src/channels/whatsapp/WhatsAppBusinessAPI.ts` (logic moved to plugin)
4. **Remove** inline `sendTelegramMessage()` / `sendWhatsAppMessage()` from `outbound.ts`
5. **Remove** `TelegramOutput` and `WhatsAppOutput` imports from `inbound.ts`
6. **Update** `worker/src/rate-limit/RateLimiter.ts` — move Telegram rate limiter into plugin if still needed

---

### Phase 5 (was 6): Add Contract Tests

Create contract tests for new plugins (following existing pattern):

1. `tests/integration/openclaw-telegram-bridge.contract.test.ts` — Already exists ✅
2. `tests/integration/openclaw-whatsapp-bridge.contract.test.ts` — **CREATE**
3. Update existing tests to use plugin factories

---

## File Change Summary

| Action | File | Description |
|--------|------|-------------|
| **CREATE** | `worker/src/channels/bridge/telegram/TelegramPlugin.ts` | Telegram plugin (sendText + editText) |
| **CREATE** | `worker/src/channels/bridge/whatsapp/WhatsAppPlugin.ts` | WhatsApp plugin (sendText only) |
| **CREATE** | `worker/src/channels/bridge/whatsapp/WhatsAppOpenClawBridge.ts` | WhatsApp bridge adapter |
| **CREATE** | `tests/integration/openclaw-whatsapp-bridge.contract.test.ts` | WhatsApp contract test |
| **MODIFY** | `worker/src/channels/bridge/index.ts` | Add new exports |
| **MODIFY** | `worker/src/processors/inbound.ts` | Replace legacy with bridge factories |
| **MODIFY** | `worker/src/processors/outbound.ts` | Replace inline Telegram/WhatsApp with plugins |
| **MODIFY** | `worker/src/index.ts` | Optional: register channels at startup |
| **DELETE** | `worker/src/channels/telegram/TelegramOutput.ts` | Legacy — replaced by plugin |
| **DELETE** | `worker/src/channels/whatsapp/WhatsAppOutput.ts` | Legacy — replaced by plugin |
| **DELETE** | `worker/src/channels/whatsapp/WhatsAppBusinessAPI.ts` | Legacy — replaced by plugin |

---

---

## Corrections from Code Review

### Correction #1: `canStream` blocks markdown channels (CRITICAL)
The `OpenClawChannelAdapter` in `ChannelAdapter.ts` has:
```typescript
private get canStream(): boolean {
  return (
    this.outbound.chunkerMode !== 'markdown' &&  // ← BLOCKS markdown!
    this.streaming.supportsEditing &&
    this.outbound.deliveryMode === 'streamed' &&
    !!this.outbound.editText
  )
}
```
If Telegram uses `chunkerMode: 'markdown'`, `canStream` returns `false` and the streaming UX (placeholder → edits → finalize) **won't work**. The old `TelegramOutput` handles streaming without this restriction. **Fix:** Use `chunkerMode: 'plain'` for Telegram plugin to preserve live-typing UX. The chunker function itself can still be markdown-aware for splitting at finalize time.

### Correction #2: Discord doesn't use inbound polling pipeline
Discord messages arrive via `DiscordGatewayManager` (WebSocket), started in `worker/src/index.ts`. Adding Discord to `inbound.ts createChannelOutput()` is harmless but won't actually be called. This is noted for accuracy — no action needed, but the plan shouldn't imply Discord inbound needs migration.

### Correction #3: Streaming detection must NOT expand to Discord/Slack
Discord and Slack intentionally use the non-streaming `assistant_outbound_events` queue path. Changing `isStreaming` to include them would bypass the outbound queue and break their delivery architecture.

### Correction #4: Global registry is unnecessary
The `registerChannel()` registry takes static instances with pre-bound secrets. Each channel DB row has different secrets per tenant. Discord/Slack outbound already create plugins on-demand per request. Skip the global registry — use on-demand plugin creation in switch statements.

---

## Risk Mitigation

1. **Feature flag:** Keep `FEATURE_OPENCLAW_CHANNELS` flag to toggle between legacy and bridge paths during rollout
2. **Rollback:** Old implementations stay in codebase until bridge is proven in production
3. **Test first:** All plugins get contract tests before wiring into pipeline
4. **Per-channel rollout:** Migrate one channel at a time (Telegram first → WhatsApp → verify Discord/Slack)

## Execution Order (Corrected)

1. ✍️ Create `TelegramPlugin.ts` (with `chunkerMode: 'plain'`) + update contract test
2. ✍️ Create `WhatsAppPlugin.ts` + `WhatsAppOpenClawBridge.ts` + contract test
3. 🔌 Update `outbound.ts` — swap inline Telegram/WhatsApp for plugins (matches existing Discord/Slack pattern)
4. 🔌 Update `inbound.ts` `createChannelOutput()` — Telegram + WhatsApp via bridge (keep streaming detection unchanged)
5. ✅ Test Telegram + WhatsApp end-to-end (Discord/Slack already working via plugins in outbound)
6. 🧹 Clean up legacy files (`TelegramOutput.ts`, `WhatsAppOutput.ts`, `WhatsAppBusinessAPI.ts`)
