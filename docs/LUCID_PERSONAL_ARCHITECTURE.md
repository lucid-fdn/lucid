# Lucid Personal - AI Assistants Architecture (Updated)

> **Status:** Plan (Ready for Implementation)
> **Last Updated:** February 3, 2026
> **Architecture:** Event-Driven + OpenClaw Orchestration + Lucid-L2 Models

## Overview

Lucid Personal extends LucidMerged to provide personal AI assistants that live in WhatsApp/Telegram. This document describes the final architecture decisions combining the best of event-driven infrastructure with OpenClaw's maintained orchestration layer.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LUCIDMERGED (Vercel)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐│
│   │ Dashboard UI       │    │ Webhook Handlers   │    │ API Routes         ││
│   │ (Next.js Pages)    │    │ /api/webhooks/*    │    │ /api/assistants/*  ││
│   └─────────┬──────────┘    └─────────┬──────────┘    └─────────┬──────────┘│
│             │                         │                          │           │
│             │                         │ INSERT                   │           │
│             │                         │ inbound_events           │           │
│             │                         ▼                          │           │
│             │              ┌──────────────────────┐              │           │
│             └──────────────►       SUPABASE       ◄──────────────┘           │
│                            │  (PostgreSQL + RLS)  │                          │
│                            └──────────┬───────────┘                          │
│                                       │                                      │
└───────────────────────────────────────┼──────────────────────────────────────┘
                                        │
                                        │ Poll + Process (adaptive)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WORKER (Railway/Fly.io)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────┐           │
│   │                   OPENCLAW AGENT (Library Mode)             │           │
│   │  - Orchestration: Loop, tool calling, retries, streaming    │           │
│   │  - NOT Gateway/CLI - NO fork/extract core-lite              │           │
│   ├─────────────────────────────────────────────────────────────┤           │
│   │                                                             │           │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │           │
│   │  │ModelAdapter  │  │StorageAdapter│  │ToolRegistry  │     │           │
│   │  │  ↓           │  │  ↓           │  │  ↓           │     │           │
│   │  │Lucid-L2 API  │  │Supabase      │  │Built-in +    │     │           │
│   │  │(100+ models) │  │(sessions/    │  │Nango         │     │           │
│   │  │              │  │ memory)      │  │(optional n8n)│     │           │
│   │  └──────────────┘  └──────────────┘  └──────────────┘     │           │
│   └─────────────────────────────────────────────────────────────┘           │
│                                                                              │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │ Inbound         │    │ Outbound        │    │ HTTP Server     │        │
│   │ Processor       │    │ Processor       │    │ (Health+Trigger)│        │
│   │                 │    │                 │    │                 │        │
│   │ • Claim event   │    │ • Claim event   │    │ GET /health     │        │
│   │ • OpenClaw run  │    │ • Send message  │    │ POST /trigger   │        │
│   │ • Store response│    │ • Mark sent     │    │ (resets polling)│        │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Architecture Decisions

### 1. Channel Provisioning Modes (Managed vs BYO)

**Default Mode: Lucid-Managed Channels**
- Users get instant access through Lucid-owned channels
- No bot tokens or API keys required from users
- Lucid provisions and manages all channel infrastructure
- Best for onboarding and getting started quickly

**Advanced Mode: Bring Your Own (BYO)**
- Power users connect their own Telegram bots
- Or WhatsApp Business API accounts (WABA)
- Or Slack workspace apps
- Full control and customization
- Users store encrypted credentials in `encrypted_secrets` table

```typescript
// Example: Creating a BYO Telegram channel
const channel = await createChannel({
  assistant_id: assistantId,
  channel_type: 'telegram',
  mode: 'byo', // User provides their own bot token
  credentials: {
    bot_token: 'user-provided-token',
    secret_token: 'webhook-secret'
  }
});

// Example: Creating a Lucid-managed channel
const channel = await createChannel({
  assistant_id: assistantId,
  channel_type: 'telegram',
  mode: 'managed', // Lucid provisions everything
  // No credentials needed
});
```

### 2. OpenClaw as Orchestration Layer (NOT Replacement)

**OpenClaw is used as a library (Agent/Runner), not Gateway/CLI, and we do not fork/extract core-lite.**

```typescript
// worker/src/processors/inbound.ts
import { OpenClawAgent } from '@openclaw/agent'; // NPM dependency

const agent = new OpenClawAgent({
  model: new LucidL2Adapter({
    baseURL: process.env.LUCID_API_BASE_URL,
    model: assistant.lucid_model
  }),
  storage: new SupabaseStorageAdapter({
    client: supabase,
    assistantId: assistant.id
  }),
  tools: new ToolRegistry({
    // Your own interface, not n8n-specific
    builtIn: [
      new HttpTool(),
      new CalendarTool({ nango }),
      new EmailTool({ nango })
    ]
  })
});

// OpenClaw handles: loop, tool calling, retries, streaming
// Lucid-L2 provides: model inference for 100+ LLMs
const response = await agent.run({
  message: inboundEvent.message_text,
  userId: inboundEvent.external_user_id
});
```

**Flow:**
```
Webhook → Outbox → Worker → OpenClaw Agent → (Model calls via Lucid-L2) + Tools → Reply
```

**Key Points:**
- OpenClaw doesn't replace Lucid-L2, it uses it
- Lucid-L2 remains the model provider
- OpenClaw handles orchestration logic
- No Gateway/CLI mode (library only)
- No core-lite extraction
- **Pin OpenClaw version/commit + upgrade cadence** (e.g., monthly)

**What OpenClaw Provides:**
- ✅ Agent loop (message → think → act → respond)
- ✅ Tool calling orchestration
- ✅ Retry logic and error handling
- ✅ Streaming response handling

**What You Still Build:**
- ❌ Channel adapters (OpenClaw doesn't include these)
- ✅ Webhook normalization (Telegram/WhatsApp → standard format)
- ✅ Outbox insert (Vercel → Supabase)
- ✅ Outbound sender (Worker → Telegram/WhatsApp APIs)
- ✅ Channel-specific logic (QR codes, formatting, media)

*Note: If OpenClaw adds channel connectors later, you can wrap/use them, but don't assume they exist.*

### 3. Tool System (NOT n8n-Dependent)

**Tools are your own registry interface. n8n (if/when present) is one implementation, not a dependency.**

```typescript
// worker/src/adapters/tools.ts

// Your interface
interface Tool {
  name: string;
  description: string;
  execute(params: unknown): Promise<unknown>;
}

// Registry owns the interface
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  constructor(config: { builtIn: Tool[] }) {
    config.builtIn.forEach(tool => this.register(tool));
    
    // n8n is OPTIONAL
    if (process.env.N8N_API_URL) {
      this.register(new N8NToolExecutor({
        apiUrl: process.env.N8N_API_URL
      }));
    }
  }
  
  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
  
  getTools() {
    return Array.from(this.tools.values());
  }
}

// Built-in tools (no external dependencies)
class HttpTool implements Tool {
  name = 'http_fetch';
  async execute(params: { url: string }) {
    return fetch(params.url);
  }
}

class CalendarTool implements Tool {
  constructor(private nango: Nango) {}
  name = 'calendar_add_event';
  async execute(params: { title: string; date: string }) {
    const connection = await this.nango.getConnection('google-calendar', userId);
    // ...
  }
}

// n8n is ONE implementation (optional)
class N8NToolExecutor implements Tool {
  name = 'n8n_workflow';
  async execute(params: { workflowId: string; data: unknown }) {
    return fetch(`${this.apiUrl}/workflows/${params.workflowId}`, {
      method: 'POST',
      body: JSON.stringify(params.data)
    });
  }
}
```

### 4. Adaptive Polling (Fix Hot-Loop Footgun)

**Problem:** 500ms/300ms polling = 172,800 queries/day (Postgres hammer)

**Solution:** Webhook trigger for latency + adaptive polling as fallback

```typescript
// worker/src/index.ts

let pollInterval = 200; // Start fast after webhook trigger
const MIN_INTERVAL = 200;
const MAX_INTERVAL = 5000;

// Webhook trigger resets polling (low latency)
app.post('/trigger', (req, res) => {
  pollInterval = MIN_INTERVAL; // Immediate reset
  res.json({ ok: true });
});

// Adaptive polling with backoff
async function adaptivePoll() {
  try {
    // Batch claim (atomic)
    const events = await claimBatch({
      workerId: WORKER_ID,
      batchSize: 10 // Process multiple at once
    });
    
    if (events.length > 0) {
      // Work found - reset to fast polling
      pollInterval = MIN_INTERVAL;
      
      // Process with concurrency limit
      await pLimit(5)(
        events.map(event => processEvent(event))
      );
    } else {
      // No work - exponential backoff
      pollInterval = Math.min(
        pollInterval * 1.5,
        MAX_INTERVAL
      );
    }
  } catch (error) {
    console.error('[polling] Error:', error);
    pollInterval = MAX_INTERVAL; // Back off on error
  }
  
  setTimeout(adaptivePoll, pollInterval);
}

// Separate cleanup job (not continuous)
setInterval(async () => {
  const resetCount = await resetStuckEvents({
    olderThan: Date.now() - 5 * 60 * 1000 // 5 min
  });
  console.log(`[cleanup] Reset ${resetCount} stuck events`);
}, 5 * 60 * 1000); // Every 5 minutes

// Start polling
adaptivePoll();
```

**Performance Impact:**
```
Old:
- Inbound: 500ms polling = 2 queries/sec = 172,800/day
- Outbound: 300ms polling = 3.3 queries/sec = 285,120/day
- Total: 457,920 queries/day

New (example):
- Burst: 200ms after webhook trigger
- Idle: Backoff to 5s when no work
- Avg: ~5,000 queries/day (97% reduction!)
- Assumptions: 80% idle, batch size=10, trigger-first, backoff to 5s
```

### 4. Repo Layout & Deploy Boundaries

**Rule: No shared imports from Next app (only contracts/ + worker-local code)**

```
LucidMerged/
├── contracts/                # Shared types ONLY
│   ├── index.ts
│   ├── events.ts
│   ├── channels.ts
│   ├── assistants.ts
│   └── package.json
│
├── worker/                   # Separate deploy target
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── index.ts          # HTTP server + polling
│       ├── config.ts
│       ├── adapters/
│       │   ├── lucid-l2.ts   # ModelAdapter for OpenClaw
│       │   ├── supabase.ts   # StorageAdapter + DB client
│       │   └── tools.ts      # ToolRegistry interface
│       └── processors/
│           ├── inbound.ts    # OpenClaw agent.run()
│           └── outbound.ts   # Send via official APIs
│
├── src/app/                  # Next.js (Vercel deploy)
│   ├── api/webhooks/
│   │   ├── telegram/[channelId]/route.ts
│   │   └── whatsapp/[channelId]/route.ts
│   └── ...
│
└── migrations/
    └── 044_ai_assistants.sql
```

**Import Rules:**
```typescript
// ✅ GOOD (worker can import from contracts/)
import { InboundEvent } from '@/contracts/events';

// ❌ BAD (worker CANNOT import from Next app)
import { getProfile } from '@/lib/db'; // FORBIDDEN!

// ✅ GOOD (worker uses its own DB client)
import { supabase } from './adapters/supabase';
```

**Deploy Configuration:**

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "ignoreCommand": "bash -c 'git diff --quiet HEAD^ HEAD ./worker/'",
  "outputDirectory": ".next",
  "installCommand": "npm install --legacy-peer-deps"
}
```

```toml
# railway.toml (worker only)
[build]
builder = "DOCKERFILE"
dockerfilePath = "worker/Dockerfile"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
```

## Database Schema

### Core Tables

```sql
-- AI Assistants (one per user/org)
ai_assistants
├── id (uuid, PK)
├── org_id (uuid, FK → organizations)
├── name (text)
├── system_prompt (text)
├── lucid_model (text, default: 'claude-sonnet-4-20250514')
├── temperature (numeric)
├── max_tokens (integer)
├── memory_enabled (boolean)
├── memory_window_size (integer)
├── is_active (boolean)
└── created_at, updated_at

-- Channels (Telegram, WhatsApp, Web, Slack [Phase 2])
assistant_channels
├── id (uuid, PK)
├── assistant_id (uuid, FK → ai_assistants)
├── channel_type (enum: telegram, whatsapp, web, slack)
├── mode (enum: managed, byo) -- Lucid-managed vs Bring Your Own
├── external_channel_id (text)
├── encrypted_secrets_id (uuid, FK → encrypted_secrets)
├── secret_token_hash (text)
├── webhook_url (text)
├── is_active (boolean)
└── created_at, updated_at

-- Note: Slack support is planned for Phase 2
-- Phase 1 focuses on Telegram (managed + BYO) and WhatsApp (BYO only)

-- Agent Channels (auto-provisioned for cross-agent messaging)
-- channel_type = 'agent', no webhook secrets needed
-- secret_token_hash nullable (migration 083)

-- Inbound Events (webhook → worker queue)
assistant_inbound_events
├── id (uuid, PK)
├── channel_id (uuid, FK → assistant_channels)
├── external_message_id (text)
├── external_user_id (text)
├── external_chat_id (text)
├── message_text (text)
├── message_data (jsonb)
├── status (enum: pending, processing, done, failed)
├── attempts (integer)
├── max_attempts (integer)
├── locked_by (text)
├── locked_at (timestamptz)
├── locked_until (timestamptz)
├── next_attempt_at (timestamptz)
├── last_error (text)
└── created_at, processed_at

-- Outbound Events (worker → channel)
assistant_outbound_events
├── id (uuid, PK)
├── channel_id (uuid, FK → assistant_channels)
├── inbound_event_id (uuid, FK → assistant_inbound_events)
├── message_text (text)
├── reply_to_external_id (text)
├── external_message_id (text)
├── status (enum: pending, processing, sent, failed)
├── attempts (integer)
├── max_attempts (integer)
├── locked_by, locked_at, locked_until
└── created_at, sent_at
```

### Claim Functions (Atomic with Row Locking)

```sql
-- Batch claim for inbound events
CREATE OR REPLACE FUNCTION claim_next_inbound_events(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10
)
RETURNS SETOF assistant_inbound_events AS $$
BEGIN
  RETURN QUERY
  UPDATE assistant_inbound_events
  SET
    status = 'processing',
    locked_by = p_worker_id,
    locked_at = NOW(),
    locked_until = NOW() + INTERVAL '15 minutes', -- Consistent 15min lease
    attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM assistant_inbound_events
    WHERE status = 'pending'
      OR (status = 'processing' AND locked_until < NOW())
      OR (status = 'failed' AND attempts < max_attempts AND next_attempt_at < NOW())
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- Function to renew lease (for long-running operations)
CREATE OR REPLACE FUNCTION renew_event_lease(
  p_event_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE assistant_inbound_events
  SET locked_until = NOW() + INTERVAL '15 minutes'
  WHERE id = p_event_id
    AND locked_by = p_worker_id
    AND status = 'processing';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Cleanup stuck events
CREATE OR REPLACE FUNCTION reset_stuck_events(
  p_older_than_ms INTEGER DEFAULT 300000
)
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  WITH reset AS (
    UPDATE assistant_inbound_events
    SET
      status = 'pending',
      locked_by = NULL,
      locked_at = NULL,
      locked_until = NULL
    WHERE status = 'processing'
      AND locked_until < NOW() - (p_older_than_ms || ' milliseconds')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO reset_count FROM reset;
  
  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;
```

## Agent Runtime Features (Shipped 2026-03-09)

### Scheduled Tasks (Cron + One-Shot)
```
Agent calls schedule_task tool
  → Validates cron via croner (5-field + timezone/DST)
  → Inserts into agent_scheduled_tasks (Supabase outbox)
  → Worker pollScheduledTasks() claims via claim_next_scheduled_task RPC
  → Executes runEmbeddedPiAgent with task_prompt
  → On success: reschedule (cron) or mark completed (one-shot)
  → On failure: retry with exponential backoff → dead-letter after max_retries
```

### Cross-Agent Messaging
```
Agent A calls send_message_to_agent(target_id, message)
  → Org isolation check (same org only, app-level)
  → Rate limit: 30 msgs/min/org (TenantRateLimiter)
  → Loop guard: 5s cooldown per sender→target pair
  → Auto-provision 'agent' channel for target (ensureAgentChannel)
  → Insert synthetic inbound event (deterministic dedup key)
  → Target agent picks up on next pollInboundEvents() cycle
```

### Subagent Spawning
```
Agent calls spawn_subagent(task, context)
  → Depth check (max 2) + children check (max 5)
  → Budget slicing from parent
  → Isolated workspace (unique subdirectory)
  → Recursive runEmbeddedPiAgent call
  → Cleanup workspace on completion
```

### Safety & Observability
- DANGER_TOOLS deny-by-default set with SECURITY-level logging
- OTel Counter metrics: scheduler, messaging, subagent (via `worker/src/observability/metrics.ts`)
- Deterministic external_message_id for retry-safe dedup
- Service role Supabase client (bypasses RLS); org isolation is app-level only

## Message Flow

### Inbound (User → Assistant)

```
1. User sends message in Telegram/WhatsApp
2. Platform webhook hits /api/webhooks/[platform]/[channelId]
3. Webhook handler:
   a. Validates channel exists
   b. Validates secret token (hash comparison)
   c. Inserts into assistant_inbound_events (idempotent upsert)
   d. Fire-and-forget trigger to worker (resets polling)
   e. Returns 200 OK immediately
4. Worker:
   a. Claims event batch (atomic SELECT FOR UPDATE)
   b. Loads channel + assistant config
   c. Initializes OpenClaw Agent with adapters
   d. agent.run() → calls Lucid-L2 + executes tools
   e. Stores messages (user + assistant) in Supabase
   f. Creates outbound event
   g. Marks inbound as done
```

### Outbound (Assistant → User)

```
1. Worker polls outbound_events (adaptive interval)
2. Worker:
   a. Claims event batch (atomic)
   b. Loads channel with encrypted secrets
   c. Decrypts secrets (AES-256-GCM)
   d. Sends via platform API (Telegram/WhatsApp)
   e. Marks as sent with external_message_id
```

## Latency Optimization

### Hybrid Trigger + Adaptive Polling

```
Polling Strategy:
- Webhook trigger resets to 200ms (instant response)
- Exponential backoff when idle (200ms → 5s)
- Batch claim (10 events at once)
- Concurrency limit (p-limit: 5 concurrent)

Cleanup Job:
- Runs every 5 minutes (separate from polling)
- Resets stuck events (locked > 5 min)
```

### Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| Webhook → DB | <100ms | Direct insert, no processing |
| Claim → OpenClaw | <200ms | Batch claim, adaptive polling |
| Lucid-L2 response | 1-3s | Depends on model |
| Total latency | <5s | Webhook trigger + adaptive polling |

## Deployment

### Worker (Railway/Fly.io)

```bash
# Deploy to Railway
cd worker
railway login
railway link
railway up

# Environment variables
railway variables set SUPABASE_URL=...
railway variables set SUPABASE_SERVICE_ROLE_KEY=...
railway variables set LUCID_API_BASE_URL=https://api.lucid.foundation
railway variables set LUCID_API_KEY=...
railway variables set ENCRYPTION_KEY=...
railway variables set WORKER_ID=worker-1
```

### Vercel (Next.js)

```bash
# Deploy Next.js app (webhooks + UI)
vercel --prod

# Environment variables
vercel env add WORKER_URL
vercel env add WORKER_TRIGGER_SECRET
```

### Supabase Migration

```bash
# Run in Supabase SQL Editor
# migrations/044_ai_assistants.sql
```

## Security

### Secret Storage

```
Channel secrets (bot tokens, API keys) are:
1. Encrypted with AES-256-GCM before storage
2. Stored in separate `encrypted_secrets` table
3. Only decrypted in worker (never in Vercel edge)
4. Encryption key is NOT in database
```

### Webhook Validation

```
Telegram:
- Uses x-telegram-bot-api-secret-token header
- We store SHA-256 hash, compare on webhook
- No decryption needed (hash comparison)

WhatsApp Business:
- Uses Meta's verify token flow
- We store SHA-256 hash of verify token
- Payload signature validation (X-Hub-Signature-256)
```

### Row Level Security

```sql
-- Assistants scoped to organization
CREATE POLICY "Org members can manage assistants"
ON ai_assistants
USING (org_id IN (
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid()
));
```

## Cost Analysis

### Infrastructure Cost

| Item | Monthly Cost |
|------|-------------|
| Railway/Fly.io worker | $5-15 |
| Supabase (usage-based) | Variable |
| Lucid-L2 (LLM costs) | Variable |
| WhatsApp Business API | Variable |
| Vercel (existing) | $0 |
| **Worker baseline** | **~$5–$15/month** |
| **Note** | *LLM, WhatsApp, Supabase usage are separate* |

### Why This is 285x Cheaper Than Docker Approach

**Docker Per-Tenant Approach:**
- $40/month per server (40 tenants) = $1/tenant
- Plus monitoring ($20), backups ($10), ops time ($500)
- Real cost: $14.25/user

**Our Approach:**
- Managed services (zero ops time)
- Horizontally scalable (add worker instances as needed)
- Shared infrastructure (efficient resource use)
- Worker baseline: ~$5-15/month + variable usage costs

## Implementation Checklist

```markdown
### Phase 1: Infrastructure ✅
- [x] Migration 044_ai_assistants.sql deployed
- [x] Worker deployed to Railway
- [x] Webhooks functional
- [x] Adaptive polling implemented
- [x] Webhook trigger endpoint

### Phase 2: OpenClaw Integration ✅
- [x] Embedded OpenClaw Pi agent runner
- [x] PluginBridge (in-process MCP + MCPGate HTTP fallback)
- [x] ToolRegistry with deny-by-default enforcement

### Phase 3: Agent Runtime ✅ (Shipped 2026-03-09)
- [x] Scheduled tasks (cron + one-shot) via croner + outbox pattern
- [x] Cross-agent messaging via synthetic inbound events
- [x] Subagent spawning with depth/children limits
- [x] OTel metrics for scheduler, messaging, subagent
- [x] Migrations 082-083 applied to production
- [x] 80/80 tests passing

### Phase 4: UI & Launch
- [ ] Build assistant creation UI
- [ ] Add settings page
- [ ] Add memory viewer
- [ ] Launch to first 10 users
```

## Files Created/Updated

```
✅ contracts/events.ts
✅ contracts/channels.ts
✅ contracts/assistants.ts
✅ contracts/index.ts
✅ contracts/package.json
✅ migrations/044_ai_assistants.sql
✅ worker/package.json
✅ worker/tsconfig.json
✅ worker/Dockerfile
✅ worker/src/config.ts
✅ worker/src/index.ts (needs: adaptive polling + trigger endpoint)
✅ worker/src/adapters/supabase.ts
❌ worker/src/adapters/lucid-l2.ts (TODO: ModelAdapter for OpenClaw)
❌ worker/src/adapters/tools.ts (TODO: ToolRegistry)
✅ worker/src/processors/inbound.ts (needs: OpenClaw integration)
✅ worker/src/processors/outbound.ts
✅ src/app/api/webhooks/telegram/[channelId]/route.ts
✅ src/lib/db/index.ts (assistant functions added)
✅ docs/LUCID_PERSONAL_ARCHITECTURE.md (this file)
```

## References

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [Lucid-L2 Quickstart](./LUCID_L2_QUICKSTART.md)
- [Error Management](./ERROR_MANAGEMENT_SYSTEM.md)

## Summary: Why This Architecture Wins

1. **✅ Maintained OpenClaw orchestration** (library mode, not DIY)
2. **✅ Lucid-L2 provides models** (100+ LLMs, existing integration)
3. **✅ Horizontally scalable** (add worker instances; DB outbox is the coordination point)
4. **✅ Official APIs** (no ToS violations)
5. **✅ Adaptive polling** (97% fewer DB queries)
6. **✅ Tool extensibility** (not coupled to n8n)
7. **✅ ~$5–$15/mo worker baseline** *(LLM + WhatsApp fees + Supabase usage are separate)* (vs $570 for Docker approach)
8. **✅ Phase 1 in ~4 days** *(Telegram + outbox + worker + OpenClaw basic loop)* (vs 4 weeks)

**This is production-grade, scalable, and maintainable.** 🚀
