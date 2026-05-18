# Multi-Channel Integration Plan — Discord & Slack

> **Last updated:** 2026-02-13 (v2 — dev-reviewed corrections applied)
> **Status:** Planning (not started)
> **Depends on:** P2 #15-17 Bridge Adapters (✅ COMPLETE)
> **Dev review:** v3 — 11 corrections applied (Discord Gateway, inbound filtering, Slack verification/subtypes/retries, dedup keys, rate limits, thread handling, enum strategy, multi-agent channels, ops/monitoring)

---

## Current State

### What Exists Today

| Channel | Webhook Handler | Outbound | UI Setup | Bridge Adapter | Status |
|---------|----------------|----------|----------|----------------|--------|
| **Telegram (BYOB)** | ✅ `api/webhooks/telegram/[channelId]` | ✅ Direct API | ✅ Bot token form | ✅ Bridge ready | **Production** |
| **Telegram (Hosted)** | ✅ `api/webhooks/telegram/hosted` | ✅ Direct API | ✅ One-click connect | ✅ Bridge ready | **Production** |
| **WhatsApp** | ✅ `api/webhooks/whatsapp/[channelId]` | ✅ Direct API | ⚠️ Minimal | ❌ No bridge | **Partial** |
| **Web** | ❌ No real handler | ⚠️ Stub only | ❌ None | ❌ No bridge | **Stub** |
| **Discord** | ❌ None | ❌ None | ❌ None | ✅ Bridge ready | **Adapter only** |
| **Slack** | ❌ None | ❌ None | ❌ None | ✅ Bridge ready | **Adapter only** |

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    NEXT.JS APP                       │
│                                                     │
│  Webhook Routes          Channel Setup UI           │
│  ┌─────────────┐        ┌──────────────────┐       │
│  │ /api/webhooks│        │ Assistant Detail  │       │
│  │ /telegram/   │        │ → Channels Tab   │       │
│  │ /whatsapp/   │        │ → Add Channel    │       │
│  │ /discord/  ← NEW     │ → Discord/Slack ← NEW   │
│  │ /slack/    ← NEW     └──────────────────┘       │
│  └──────┬──────┘                                    │
│         │ INSERT into assistant_inbound_events       │
│         ▼                                           │
│  ┌─────────────┐                                    │
│  │  Supabase   │                                    │
│  │  Queue      │                                    │
│  └──────┬──────┘                                    │
│         │                                           │
└─────────┼───────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│                    WORKER                            │
│                                                     │
│  Inbound Pipeline                                   │
│  ┌────────────────────────────────────────┐         │
│  │ Dedup → Lock → Rate → Policy → Agent  │         │
│  │ → Encrypt → Store → Usage             │         │
│  └────────────────────┬───────────────────┘         │
│                       │                             │
│  Outbound Processor   │                             │
│  ┌────────────────────▼───────────────────┐         │
│  │ switch(channel_type)                    │         │
│  │   telegram → sendTelegramMessage()      │         │
│  │   whatsapp → sendWhatsAppMessage()      │         │
│  │   discord  → DiscordBridge ← NEW        │         │
│  │   slack    → SlackBridge   ← NEW        │         │
│  └────────────────────────────────────────┘         │
│                                                     │
│  Bridge Adapters (✅ DONE)                          │
│  ┌────────────────────────────────────────┐         │
│  │ OpenClawBridgeContract                  │         │
│  │ ├── TelegramOpenClawBridge              │         │
│  │ ├── DiscordOpenClawBridge               │         │
│  │ └── SlackOpenClawBridge                 │         │
│  └────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────┘
```

---

## Phase A: Database Schema (Migration 067)

### A1. Extend channel_type enum

Current enum: `'telegram' | 'whatsapp' | 'web'`
New enum: `'telegram' | 'whatsapp' | 'web' | 'discord' | 'slack'`

```sql
-- Migration 067: Add Discord and Slack channel types
-- Step 1: Add new enum values (if using PostgreSQL enum)
-- Note: If channel_type is TEXT, no migration needed — just update validation

-- If channel_type is an enum:
ALTER TYPE channel_type_enum ADD VALUE IF NOT EXISTS 'discord';
ALTER TYPE channel_type_enum ADD VALUE IF NOT EXISTS 'slack';

-- If channel_type is TEXT with CHECK constraint, update the constraint:
-- ALTER TABLE assistant_channels DROP CONSTRAINT IF EXISTS chk_channel_type;
-- ALTER TABLE assistant_channels ADD CONSTRAINT chk_channel_type 
--   CHECK (channel_type IN ('telegram', 'whatsapp', 'web', 'discord', 'slack'));
```

### A2. Channel secrets structure

Each channel type stores different secrets in `encrypted_secrets`:

| Channel | Required Secrets | Optional Secrets |
|---------|-----------------|------------------|
| **Telegram** | `bot_token` | — |
| **WhatsApp** | `access_token`, `phone_number_id` | — |
| **Discord** | `bot_token` | `application_id`, `guild_id` |
| **Slack** | `bot_token` | `app_id`, `signing_secret` |

No schema change needed — secrets are stored as encrypted JSON in `encrypted_secrets` table.

### A3. Channel config structure

`channel_config` (JSONB) stores channel-specific non-secret configuration:

```typescript
// Discord channel_config
interface DiscordChannelConfig {
  guild_id?: string       // Server ID
  channel_id?: string     // Default channel to respond in
  thread_support?: boolean // Whether to use threads for conversations
}

// Slack channel_config  
interface SlackChannelConfig {
  team_id?: string        // Workspace ID
  channel_id?: string     // Default channel
  thread_ts_mode?: 'always' | 'never' | 'auto' // Thread reply behavior
}
```

---

## Phase B: Inbound Handlers

### B1. Discord Inbound — Gateway Listener (NOT HTTP Webhook)

> **🚨 Critical correction (dev review):** Discord Interactions (HTTP POST with signature + PING/PONG) only handle **slash commands and button interactions** — NOT regular "user typed a message in a channel" events. For MESSAGE_CREATE events, you MUST use the **Discord Gateway (WebSocket)**.

**Architecture:** Long-running Gateway listener (lives in worker or as separate Railway service)

```typescript
// worker/src/channels/discord/DiscordGatewayListener.ts
// Uses discord.js or raw WebSocket to Discord Gateway

import { Client, GatewayIntentBits, Events } from 'discord.js'

export function createDiscordGatewayListener(params: {
  supabase: SupabaseClient
  channelRegistry: Map<string, { channelId: string; guildId?: string }>
}) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // Privileged intent — must enable in Discord Developer Portal
    ],
  })

  client.on(Events.MessageCreate, async (message) => {
    // Skip bot messages
    if (message.author.bot) return

    // Look up which assistant channel this Discord channel maps to
    const registration = channelRegistry.get(message.channelId)
    if (!registration) return // Not a monitored channel

    await insertAssistantInboundEvent({
      channel_id: registration.channelId,
      external_message_id: message.id,                    // Dedup key
      external_chat_id: message.channelId,                // Discord channel
      external_user_id: message.author.id,
      message_text: message.content,
      message_data: {
        guild_id: message.guildId,
        // Thread handling: Discord threads have their own channel_id
        parent_channel_id: message.channel.isThread() 
          ? message.channel.parentId 
          : undefined,
        thread_id: message.channel.isThread() 
          ? message.channelId 
          : undefined,
      },
    })
  }) 

  return client
}
```

**Inbound Filtering Policy (dev review — CRITICAL to not annoy servers):**

The Gateway listener must NOT respond to every message. MVP rules:

```typescript
const shouldProcess = (message: Message, config: DiscordChannelConfig): boolean => {
  // 1. Bot is @mentioned
  if (message.mentions.has(client.user!.id)) return true
  // 2. Message starts with configured prefix (e.g. !lucid)
  if (config.prefix && message.content.startsWith(config.prefix)) return true
  // 3. Channel is explicitly "dedicated" (config flag)
  if (config.dedicated_channel) return true
  // 4. Message is inside a thread the bot is already participating in
  if (message.channel.isThread() && config.thread_support) return true
  return false
}
// Always ignore: bot messages (including itself), message edits (unless edit-support enabled)
```

**Deployment options:**
1. **Inside worker** — Start Gateway listener alongside queue poller (simpler, but couples lifecycle)
2. **Separate Railway service** — Dedicated `discord-gateway` service (cleaner, independent scaling)
3. **Recommendation:** Start inside worker for MVP, extract later if needed

**Ops/Monitoring (dev review):**
- Log clearly on connect/disconnect/reconnect (discord.js handles reconnects automatically)
- Expose a "ready" health marker so alerting can fire if disconnected too long
- Track `client.ws.ping` for latency monitoring
- Log `Events.ShardReady`, `Events.ShardDisconnect`, `Events.ShardReconnecting`

**Optional add-on: Interactions endpoint for `/ask` commands**

If you later want explicit `/ask` slash commands, add an HTTP endpoint:

**Route:** `src/app/api/webhooks/discord/interactions/route.ts`

This is separate from Gateway and handles Discord Interactions (signature verification + PING/PONG). But it does NOT replace Gateway for regular messages.

### B2. Slack Webhook Handler

**Route:** `src/app/api/webhooks/slack/[channelId]/route.ts`

> **Important constraint (dev review):** Slack Events API expects **one Request URL per Slack app**. Our route shape `/api/webhooks/slack/[channelId]` means **1 Slack app per assistant channel (BYOB)**. Document this in UI copy so users don't try to reuse one Slack app across many assistants.

Slack uses **Events API** (HTTP POST with request signing):

```typescript
export async function POST(request: NextRequest, { params }) {
  const { channelId } = await params
  const body = await request.text()
  
  // 1. Replay protection: reject requests older than 5 minutes
  const timestamp = request.headers.get('x-slack-request-timestamp')
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return new NextResponse('Request too old', { status: 403 })
  }
  
  // 2. Verify Slack signature (HMAC-SHA256)
  const signature = request.headers.get('x-slack-signature')
  const channel = await getAssistantChannelForWebhook(channelId, 'slack')
  if (!channel) return NextResponse.json({ ok: true })
  
  const secrets = decryptSecrets(channel.encrypted_secrets)
  
  // Build base string: v0:{timestamp}:{raw_body}
  const baseString = `v0:${timestamp}:${body}`
  const expectedSig = 'v0=' + crypto
    .createHmac('sha256', secrets.signing_secret)
    .update(baseString)
    .digest('hex')
  
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expectedSig))) {
    return new NextResponse('Invalid signature', { status: 401 })
  }
  
  const payload = JSON.parse(body)
  
  // 3. Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }
  
  // 4. Handle Slack retries (log but still return 200 — dedup handles it)
  const retryNum = request.headers.get('x-slack-retry-num')
  if (retryNum) {
    console.log(`[slack-webhook] Retry #${retryNum}: ${request.headers.get('x-slack-retry-reason')}`)
  }
  
  // 5. Handle message events
  // IMPORTANT: Only process plain messages. Ignore subtypes (message_changed, message_deleted, etc.)
  if (payload.event?.type === 'message' && !payload.event?.subtype && !payload.event?.bot_id && payload.event?.text) {
    const event = payload.event
    
    await insertAssistantInboundEvent({
      channel_id: channelId,
      // Dedup key: use Slack's event_id (top-level) — Slack may retry deliveries
      external_message_id: payload.event_id || event.client_msg_id || event.ts,
      external_chat_id: event.channel,
      external_user_id: event.user,
      message_text: event.text,
      message_data: {
        // Thread handling: thread_ts is the thread key in Slack
        thread_id: event.thread_ts,
        event_id: payload.event_id, // For dedup tracking
      },
    })
  }
  
  return NextResponse.json({ ok: true })
}
```

### B3. Dependencies & Verification

```bash
# Discord: discord.js for Gateway listener
npm install discord.js --save

# Slack: No external dep needed — Node.js crypto handles HMAC-SHA256
# No tweetnacl needed (Discord Gateway handles auth via bot token, not Ed25519)
```

### B4. Dedup Key Recommendations (dev review)

| Channel | Dedup Key (`external_message_id`) | Rationale |
|---------|----------------------------------|-----------|
| **Telegram** | `message.message_id` (string) | Unique per chat, monotonically increasing |
| **WhatsApp** | `message.id` | Meta-assigned UUID |
| **Discord** | `message.id` (snowflake) | Globally unique Discord snowflake ID |
| **Slack** | `payload.event_id` (preferred) or `event.ts` | `event_id` handles Slack retries; `ts` is unique per channel |

**Existing `insertAssistantInboundEvent` signature** (from `src/lib/db/index.ts`):
```typescript
insertAssistantInboundEvent({
  channel_id: string,           // Our internal channel UUID
  external_message_id: string,  // Platform message ID (dedup key)
  external_user_id: string,     // Platform user ID
  external_chat_id: string,     // Platform chat/channel ID
  message_text?: string | null, // Message content
  message_data?: Record<string, unknown>, // Extra metadata (thread_id, guild_id, etc.)
})
```

Upsert uses `onConflict: 'channel_id,external_message_id'` with `ignoreDuplicates: true` — natural dedup.

### B5. Thread Handling (dev review)

| Channel | Thread Model | Storage Strategy |
|---------|-------------|-----------------|
| **Discord** | Thread = separate channel_id | `external_chat_id` = actual channel where msg happened (thread_id if thread); store `parent_chat_id` in `message_data` so outbound can respond in correct thread vs parent |
| **Slack** | Thread = `thread_ts` within same channel | Store `thread_ts` in `message_data`; `external_chat_id` stays as channel ID |
| **Telegram** | Reply chain via `reply_to_message_id` | Already handled in existing integration |

---

## Phase C: Outbound Processor Integration

### C1. Wire bridges into outbound processor

Update `worker/src/processors/outbound.ts` to use bridge adapters for Discord/Slack:

```typescript
// In processOutboundEvent(), add cases:

case 'discord':
  externalMessageId = await sendDiscordMessage(
    secrets,
    typedChannel.external_channel_id!,
    event.message_text,
    event.reply_to_external_id
  )
  break

case 'slack':
  externalMessageId = await sendSlackMessage(
    secrets,
    typedChannel.external_channel_id!,
    event.message_text,
    event.reply_to_external_id
  )
  break
```

### C2. Discord send function

```typescript
async function sendDiscordMessage(
  secrets: Record<string, string>,
  channelId: string,
  text: string,
  replyToId?: string | null
): Promise<string> {
  const { bot_token } = secrets
  if (!bot_token) throw new Error('Discord bot token not configured')

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${bot_token}`,
      },
      body: JSON.stringify({
        content: text,
        ...(replyToId && {
          message_reference: { message_id: replyToId },
        }),
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Discord API error: ${error.message || response.statusText}`)
  }

  const data = await response.json()
  return data.id
}
```

### C3. Slack send function

```typescript
async function sendSlackMessage(
  secrets: Record<string, string>,
  channelId: string,
  text: string,
  threadTs?: string | null
): Promise<string> {
  const { bot_token } = secrets
  if (!bot_token) throw new Error('Slack bot token not configured')

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bot_token}`,
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      ...(threadTs && { thread_ts: threadTs }),
    }),
  })

  const data = await response.json()
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`)
  }

  return data.ts // Slack message timestamp is the unique ID
}
```

### C4. Outbound Rate Limit Handling (dev review)

```typescript
// Discord: respect Retry-After header on 429
if (!response.ok) {
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after')
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 1000
    // Re-queue with delay or exponential backoff
    throw new RetryableError(`Discord rate limited`, { retryAfterMs: waitMs })
  }
  const error = await response.json()
  throw new Error(`Discord API error: ${error.message || response.statusText}`)
}

// Slack: check ok field + error type
if (!data.ok) {
  // Hard-fail on auth errors (don't retry)
  if (['invalid_auth', 'account_inactive', 'token_revoked'].includes(data.error)) {
    throw new PermanentError(`Slack auth error: ${data.error}`)
  }
  // Retry on transient errors
  throw new RetryableError(`Slack API error: ${data.error}`)
}
```

### C5. Future: Bridge adapter integration

The bridges created in P2 #15-17 are designed for **streaming + editing** use cases (e.g., live typing indicators, progressive message updates). For MVP, direct API calls (C2/C3 above) are sufficient.

**Later migration path:**
1. Replace direct API calls with bridge adapters
2. Enable streaming for supported channels
3. Add editing support for progressive AI responses

---

## Phase D: Frontend UI (Next.js App)

### D1. Update channel type selector

**File:** `src/app/(app)/[workspace-slug]/assistants/[id]/assistant-detail-client.tsx`

```typescript
// Update the channel type select options:
<SelectItem value="telegram">🤖 Telegram Bot (BYOB)</SelectItem>
<SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
<SelectItem value="discord">🎮 Discord Bot</SelectItem>  // NEW
<SelectItem value="slack">💬 Slack App</SelectItem>       // NEW
<SelectItem value="web">🌐 Web Chat</SelectItem>
```

### D2. Discord setup form

When `channelType === 'discord'`:

```tsx
<div className="space-y-2">
  <Label>Discord Bot Token</Label>
  <Input
    type="password"
    placeholder="MTIz...abc"
    value={discordBotToken}
    onChange={(e) => setDiscordBotToken(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Get your bot token from the{' '}
    <a href="https://discord.com/developers/applications" target="_blank">
      Discord Developer Portal
    </a>
  </p>
  
  <Label>Discord Channel ID</Label>
  <Input
    placeholder="123456789012345678"
    value={discordChannelId}
    onChange={(e) => setDiscordChannelId(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Right-click a channel → Copy Channel ID (Developer Mode must be on)
  </p>
</div>
```

### D3. Slack setup form

When `channelType === 'slack'`:

```tsx
<div className="space-y-2">
  <Label>Slack Bot Token</Label>
  <Input
    type="password"
    placeholder="xoxb-..."
    value={slackBotToken}
    onChange={(e) => setSlackBotToken(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Get your bot token from{' '}
    <a href="https://api.slack.com/apps" target="_blank">
      Slack App Management
    </a>
  </p>
  
  <Label>Slack Signing Secret</Label>
  <Input
    type="password"
    placeholder="abc123..."
    value={slackSigningSecret}
    onChange={(e) => setSlackSigningSecret(e.target.value)}
  />
  
  <Label>Slack Channel ID</Label>
  <Input
    placeholder="C1234567890"
    value={slackChannelId}
    onChange={(e) => setSlackChannelId(e.target.value)}
  />
</div>
```

### D4. Channel badge variants

```typescript
const channelBadgeVariant = (type: string) => {
  switch (type) {
    case 'telegram': return 'default'
    case 'whatsapp': return 'secondary'
    case 'discord': return 'outline'   // NEW
    case 'slack': return 'outline'      // NEW
    case 'web': return 'secondary'
    default: return 'outline'
  }
}

// Channel icons:
{ch.channel_type === 'telegram' && '🤖 '}
{ch.channel_type === 'whatsapp' && '📱 '}
{ch.channel_type === 'discord' && '🎮 '}   // NEW
{ch.channel_type === 'slack' && '💬 '}      // NEW
{ch.channel_type === 'web' && '🌐 '}
```

### D5. Update API channel creation

**File:** `src/app/api/assistants/[id]/channels/route.ts`

```typescript
// Update schema:
const createChannelSchema = z.object({
  channelType: z.enum(['telegram', 'whatsapp', 'web', 'discord', 'slack']),
  botToken: z.string().optional(),
  phoneNumber: z.string().optional(),
  signingSecret: z.string().optional(),    // NEW: Slack signing secret
  channelId: z.string().optional(),        // NEW: Discord/Slack channel ID
  applicationId: z.string().optional(),    // NEW: Discord application ID
})

// Add Discord/Slack validation:
if (validated.channelType === 'discord') {
  if (!validated.botToken) {
    return NextResponse.json(
      { error: 'botToken is required for Discord channel' },
      { status: 400 },
    )
  }
  secrets.bot_token = validated.botToken
  if (validated.applicationId) secrets.application_id = validated.applicationId
}

if (validated.channelType === 'slack') {
  if (!validated.botToken || !validated.signingSecret) {
    return NextResponse.json(
      { error: 'botToken and signingSecret are required for Slack channel' },
      { status: 400 },
    )
  }
  secrets.bot_token = validated.botToken
  secrets.signing_secret = validated.signingSecret
}
```

---

## Phase E: Setup Guides (In-App + Docs)

### E1. Discord Bot Setup Guide

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application → Name it
3. Go to Bot → Reset Token → Copy bot token
4. Under Privileged Gateway Intents: Enable **Message Content Intent**
5. Go to OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Use Slash Commands`
6. Copy invite URL → Add bot to your server
7. In Lucid: Paste bot token + channel ID
8. Set webhook URL to: `https://your-domain.com/api/webhooks/discord/{channelId}`

### E2. Slack App Setup Guide

1. Go to [Slack API](https://api.slack.com/apps) → Create New App
2. From Scratch → Name + Workspace
3. Go to OAuth & Permissions → Add Bot Token Scopes:
   - `chat:write`, `channels:history`, `channels:read`, `groups:history`
4. Install to Workspace → Copy Bot User OAuth Token
5. Go to Basic Information → Copy Signing Secret
6. Go to Event Subscriptions:
   - Enable Events
   - Request URL: `https://your-domain.com/api/webhooks/slack/{channelId}`
   - Subscribe to bot events: `message.channels`, `message.groups`
7. In Lucid: Paste bot token + signing secret + channel ID

---

## Implementation Order & Estimates

| Step | Description | Effort | Dependencies |
|------|-------------|--------|-------------|
| **A1** | DB migration (TEXT + CHECK, not enum — see note) | 0.5h | None |
| **B1** | Discord Gateway listener (the real work) | 4h | A1 |
| **B2** | Slack webhook handler + signature verify + url_verification | 2h | A1 |
| **C1-C3** | Outbound processor (Discord + Slack send) | 2h | A1 |
| **C4** | Rate limit retry logic (429 handling) | 1h | C1-C3 |
| **D1-D4** | UI updates (forms + badges + helper copy) | 3h | A1 |
| **D5** | API channel creation updates | 1h | A1 |
| **E1-E2** | Setup guides | 1h | B1, B2 |
| **Testing** | One happy-path test per channel + dedup test | 2h | All above |
| **Total** | | **~16.5h** (~2.5 days) | |

> **DB migration note (dev review):** If `channel_type` is a Postgres enum, `ALTER TYPE ... ADD VALUE` has deployment caveats (can't run inside a transaction in some migration runners). Using **TEXT + CHECK constraint** is often smoother for "growing list" columns. Zero drama, easy to add new channels later.

### Recommended order:

1. **A1** → Database migration (unblocks everything)
2. **C1-C3** → Outbound processor (worker can send to Discord/Slack)
3. **B1** → Discord Gateway listener (this is the real work — WebSocket, not HTTP)
4. **B2** → Slack webhook handler
5. **D1-D5** → UI updates (users can configure channels)
6. **E1-E2** → Documentation
7. **Testing** → Integration tests

---

## Migration Strategy: Existing Telegram

**The existing Telegram integration remains unchanged.** The bridge adapters are a parallel path for future improvements:

| Aspect | Current (Keep) | Future (Bridge) |
|--------|---------------|-----------------|
| **Outbound** | Direct `sendTelegramMessage()` | `TelegramOpenClawBridge` with streaming |
| **Streaming** | Not supported | Live typing + progressive edits |
| **Chunking** | Manual in outbound | Bridge handles automatically |
| **Error handling** | Basic try/catch | Exponential backoff + soft failure |

**When to migrate:** After Discord/Slack are proven working with direct API calls, then optionally migrate all channels to use bridge adapters for consistent streaming/editing behavior.

---

## Security Considerations

### Webhook verification

| Channel | Verification Method | Library |
|---------|-------------------|---------|
| Telegram | `x-telegram-bot-api-secret-token` header + SHA256 hash | Built-in crypto |
| WhatsApp | `x-hub-signature-256` header + HMAC-SHA256 | Built-in crypto |
| Discord | `x-signature-ed25519` + `x-signature-timestamp` + Ed25519 | `tweetnacl` or Node crypto |
| Slack | `x-slack-signature` + `x-slack-request-timestamp` + HMAC-SHA256 | Built-in crypto |

### Rate limiting

All webhook handlers must:
1. Return 200/OK quickly (within 3 seconds for Slack, 5 seconds for Discord)
2. Process messages async (insert into queue, worker picks up)
3. Not expose internal errors in response bodies

### Secret storage

All channel secrets (bot tokens, signing secrets) are encrypted at rest using the existing `encrypted_secrets` table + AES-256-GCM encryption.

---

## Open Questions

1. **Discord: Gateway deployment model?**
   - Inside worker process (simpler, coupled lifecycle)
   - Separate Railway service (cleaner, independent scaling)
   - **Recommendation:** Inside worker for MVP, extract later if scaling demands it
   - **Resolved:** Gateway is REQUIRED for regular messages. HTTP Interactions endpoint is optional add-on for `/ask` slash commands only.

2. **Slack: Socket Mode vs Events API?**
   - Events API (HTTP) requires public URL
   - Socket Mode (WebSocket) works behind firewalls
   - **Recommendation:** Events API (consistent with our webhook pattern)
   - **Constraint:** 1 Slack app per assistant channel (BYOB). Document in UI.

3. **Thread support?**
   - Discord: Auto-create threads for conversations?
   - Slack: Always reply in thread vs in channel?
   - **Recommendation:** Default to thread replies, configurable per channel

4. **Hosted mode for Discord/Slack?**
   - Like Telegram hosted mode (one shared bot)?
   - **Recommendation:** Not for MVP. BYOB only. Hosted mode later.

---

## Production Gotchas Checklist (MUST READ)

**These are the top 5 operational issues that will bite you in production if not handled:**

### 1. Discord Gateway: Inbound Filtering Policy

**Problem:** If you respond to every message in a channel, you'll annoy servers instantly.

**Solution:** See B1 "Inbound Filtering Policy" section — only respond when:
- Bot is @mentioned, OR
- Message starts with configured prefix (e.g. !lucid), OR
- Message is inside a configured thread, OR
- Channel is explicitly "dedicated" (config flag)

Always ignore: bot messages (including itself), message edits (unless edit-support enabled).

### 2. Discord Threads & Routing: Store Both IDs Explicitly

**Problem:** Losing the ability to respond in the same thread vs parent channel.

**Solution:** See B5 "Thread Handling" table:
- `external_chat_id` = actual channel ID where message happened (thread ID if thread)
- `parent_chat_id` = parent channel ID (if thread) stored in `message_data`

This prevents responding in wrong context.

### 3. Slack Event Nuance: Ignore Message Subtypes

**Problem:** Slack message events include subtypes like `message_changed`, `message_deleted`, `bot_message` which cause duplicate processing.

**Solution:** See B2 Slack handler — only process when:
- `event.type === 'message'`
- `!event.subtype`
- `!event.bot_id`
- `event.text` exists

Also: store `thread_ts` if present (already in handler).

### 4. Slack Retries: Handle Both Dedup and "Retry Header"

**Problem:** Slack will retry with headers `X-Slack-Retry-Num` and `X-Slack-Retry-Reason`. Need to handle gracefully.

**Solution:** See B2 Slack handler — log retry headers but still return 200 quickly. Dedup handles duplicate processing via `event_id` key.

### 5. Discord Reconnect/Resume Behavior (Operational Reliability)

**Problem:** Blind spots when Gateway disconnects in production.

**Solution:** See B1 "Ops/Monitoring" section:
- Clear logs on connect/disconnect/reconnect (discord.js handles automatically)
- Expose a "ready" health marker (alert if disconnected too long)
- Track `client.ws.ping` for latency monitoring
- Log `Events.ShardReady`, `Events.ShardDisconnect`, `Events.ShardReconnecting`

---

## Multi-Agent / Multi-Channel Architecture

Each **assistant** (agent) can have **multiple channels** of any type. The existing `assistant_channels` table already supports this (many channels → one assistant via `assistant_id` FK).

```
Assistant A (Customer Support Bot)
├── Telegram channel (BYOB)
├── Discord channel (guild #support)
└── Slack channel (workspace #help)

Assistant B (Sales Bot)
├── Slack channel (workspace #sales)
└── Web chat (embedded widget)

Assistant C (Internal Ops Bot)
├── Discord channel (guild #ops, dedicated mode)
└── Telegram channel (BYOB, different bot token)
```

**Key design points:**
- Each channel row has its own `id`, `channel_type`, `channel_config`, and encrypted secrets
- Multiple assistants can each have their own Discord/Slack channels (different bot tokens, or same bot different channels)
- The Discord Gateway listener maintains a `channelRegistry: Map<discordChannelId, internalChannelId>` mapping ALL active Discord channels across ALL assistants
- For Slack, each assistant channel gets its own Slack app (BYOB constraint) with its own webhook URL
- UI already supports listing/creating/deleting multiple channels per assistant — just needs Discord/Slack forms added
- **One bot token can serve multiple channels** within the same Discord server (different guilds need different tokens)
- Users can create as many assistants as their plan allows, each with independent channel configurations
