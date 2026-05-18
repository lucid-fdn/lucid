# Polling Fallback — Pulse Circuit Breaker Degraded Mode

Legacy `setInterval` polling loops extracted from `index.ts`. Activates when:

1. `FEATURE_PULSE=false` — Pulse disabled, polling is the primary path
2. Redis circuit breaker opens — Pulse stops, polling auto-activates as fallback

## Module API

```typescript
import {
  startPollingFallback,
  stopPollingFallback,
  triggerInboundPoll,
  triggerOutboundPoll,
  shouldBackoff,
} from './polling/fallback.js'
```

| Function | Purpose |
|----------|---------|
| `startPollingFallback(deps)` | Start all 4 polling loops. Idempotent (stops first if running). Returns metrics handle. |
| `stopPollingFallback()` | Stop all loops, clear state. Idempotent, safe to call when not running. |
| `triggerInboundPoll()` | Immediate inbound poll via `setImmediate`. No-op if not started. |
| `triggerOutboundPoll()` | Immediate outbound poll via `setImmediate`. No-op if not started. |
| `shouldBackoff(failures)` | Exponential backoff check. Also used by relay path in `index.ts`. |

## Safety

- **Generation counter**: Each `start()` increments a generation. In-flight polls and queued `setImmediate` callbacks bail if generation changed (prevents stale work after stop-then-restart).
- **Mutex flags**: Each poll type has a mutex preventing overlapping calls.
- **Backoff**: Exponential (2^(failures-1), capped at 30 cycles) on consecutive RPC errors.

## 4 Polling Loops

| Loop | Default Interval | What It Does |
|------|-----------------|--------------|
| Inbound | 5s (or custom via `inboundIntervalMs`) | `claim_next_inbound_event` RPC → `processInboundEvent()` |
| Outbound | 3s | `claim_next_outbound_event` RPC → `processOutboundEvent()` |
| Scheduled | 30s | `claim_next_scheduled_task` RPC → `processScheduledTask()` |
| Cleanup | 5min | `reset_stuck_events` + dedup cleanup + stuck task/summary reset |
