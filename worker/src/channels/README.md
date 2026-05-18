# Channels

Multi-channel delivery for AI agents: Telegram, Discord, WhatsApp, Slack, Teams, Web.

## Two Channel Modes (Dedicated Runtimes)

| Mode | Flag | Who Delivers | Latency |
|------|------|-------------|---------|
| **C1 — REST Relay** | `FEATURE_REST_MESSAGE_RELAY=true` | Control plane (owns channel secrets) | ~200ms (REST round-trip) |
| **C2a — Self-Sovereign** | `FEATURE_NATIVE_CHANNELS=true` | Runtime (owns bot tokens, in-process) | ~50ms (no network hop) |

Shared SaaS workers use the standard outbound event pipeline (neither C1 nor C2a).

## Managed relay adapter (Discord + Telegram + Teams, flag-gated)

For Shared + C1 outbound delivery, Discord, Telegram, and Teams can optionally be routed through the OpenClaw-backed managed relay adapter instead of the hand-rolled REST senders. The relay implementation lives on the Next.js side at `src/lib/channels/openclaw-shim/` — not in this directory — because the managed transport orchestrator is `src/lib/db/outbound-delivery.ts`.

Flags (default off, production still uses legacy REST senders):
- `FEATURE_OPENCLAW_CHANNELS_DISCORD_MANAGED`
- `FEATURE_OPENCLAW_CHANNELS_TELEGRAM_MANAGED`
- `FEATURE_OPENCLAW_CHANNELS_TEAMS_MANAGED`

See `docs/channels/support-matrix.md` for capability coverage and `docs/channels/cutover-procedure.md` for the operator flip/rollback runbook.

## Files

| File | Purpose |
|------|---------|
| `ChannelAdapter.ts` | Base adapter interface (send, formatMessage) |
| `ChannelOutput.ts` | Output abstraction (streaming vs batch delivery) |
| `WebChannelOutput.ts` | SSE streaming for web chat |
| `bridge/` | Channel bridge utilities |
| `runtime-native/` | Engine-agnostic runtime-native transport contracts + registry wrappers |
| `discord/` | Discord-specific adapter (C2a native, raw WS) |
| `msteams/` | Teams-specific adapter (C2a native, Express HTTP + Bot Framework OAuth) |
| `native/NativeChannelManager.ts` | C2a lifecycle: start → load adapters → wire inbound → stop |
| `native/ControlPlaneBridge.ts` | Event mirroring to control plane (5s batch flush) |

## C1 Flow (REST Relay)

```
Webhook → control plane stores inbound event
  → Runtime polls POST /api/runtimes/messages/claim-inbound → RunPacket[]
  → Runtime runs agent loop (NO DB access, NO channel secrets)
  → Runtime calls POST /api/runtimes/messages/complete-inbound
  → Control plane: store messages + decrypt secrets + deliver to channel
```

## C2a Flow (Self-Sovereign)

```
Channel adapter receives message in-process (Discord WS, Telegram poll, Teams HTTP)
  → ControlPlaneBridge mirrors to control plane (async, 5s batch)
  → Agent loop runs in-process → outbound adapter delivers directly
  → ControlPlaneBridge mirrors delivery event
  → Governance: pause/resume/stop via heartbeat pendingActions (~30s latency)
```

## Design Doc

`docs/plans/2026-03-30-channel-architecture-dedicated-runtimes.md`
