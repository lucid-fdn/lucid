# @lucid/adapters

Thin adapter layer bridging [OpenClaw](https://github.com/openclaw/openclaw) (MIT) to LucidMerged SaaS.

## What This Does

OpenClaw provides a full agent runtime (sessions, commands, Pi agent, multi-channel, TTS, etc.). This package replaces OpenClaw's default SQLite storage with **Supabase** and adds our SaaS-specific layers:

| Adapter | Purpose |
|---------|---------|
| `SupabaseSessionStore` | OpenClaw sessions stored in Supabase |
| `SupabaseMessageStore` | Message history in Supabase |
| `SupabaseConfigStore` | Assistant config from Supabase |
| `LucidL2Provider` | Our unified LLM gateway (100+ models) |
| `MultiTenantContext` | org/project/env scoping |
| `UsageTracker` | Token usage for billing |
| `SentryHook` | Error monitoring with rich context |

## Usage

```typescript
import { createLucidRuntime } from '@lucid/adapters'

const runtime = createLucidRuntime({
  supabase,
  lucidApiUrl: 'https://api.lucid-l2.com',
  lucidApiKey: 'sk-...',
  sentryDsn: 'https://...',
})

await runtime.init()

// Process an inbound message
const result = await runtime.processMessage({
  assistantId: 'asst_123',
  channelType: 'telegram',
  externalChatId: '456',
  externalUserId: '789',
  messageText: 'Hello!',
})
```

## Architecture

```
packages/
├── openclaw-core/       ← Git subtree (upstream, untouched)
│   └── src/
│       ├── agents/      Pi agent runtime
│       ├── sessions/    Session management
│       ├── commands/    /status, /reset, etc.
│       ├── channels/    Discord, Slack, Telegram, etc.
│       └── ...
│
└── lucid-adapters/      ← THIS PACKAGE (our SaaS layer)
    └── src/
        ├── storage/     Supabase implementations
        ├── providers/   Lucid-L2 provider
        ├── auth/        Multi-tenant context
        ├── billing/     Usage tracking
        ├── monitoring/  Sentry hooks
        └── runtime.ts   Bootstrap entry point
```

## Phase Roadmap

- **Phase 0** ✅ — Subtree + adapter scaffold
- **Phase 1** — Wire adapters into worker
- **Phase 2** — Enable OpenClaw commands + Pi agent
- **Phase 3** — Multi-channel (Discord, Slack, Signal)
- **Phase 4** — Advanced (TTS, Cron, Auto-reply, Media)