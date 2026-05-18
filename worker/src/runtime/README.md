# Runtime Seam

Deployment-mode abstractions so worker business logic is agnostic to where it runs.

## DataSink (Strategy Pattern)

The `DataSink` interface abstracts all external I/O. Worker code calls `dataSink.storeMessages()` — the implementation decides how.

| Implementation | Used By | How It Works |
|---------------|---------|-------------|
| `SupabaseDataSink` | Shared SaaS worker | Direct Supabase queries |
| `RestDataSink` | Dedicated runtimes (C1) | REST calls to control plane API |

```typescript
interface DataSink {
  storeMessages(...)           // Save agent output
  claimInboundEvents(...)      // Claim pending events
  completeInboundEvent(...)    // Mark event done + deliver outbound
  renewLease(...)              // Extend event processing lease
  failInboundEvent(...)        // Explicitly fail an event
  reportEvents(...)            // Batch event ingestion
  sendHeartbeat(...)           // Runtime health + metrics
}
```

## Files

| File | Purpose |
|------|---------|
| `data-sink.ts` | DataSink interface + SupabaseDataSink + RestDataSink |
| `heartbeat.ts` | Dedicated runtime heartbeat (30s interval, write-coalesced) |
| `event-reporter.ts` | Batch event ingestion to control plane |
| `approval-client.ts` | Poll pending approvals from control plane |
| `broadcast-subscriber.ts` | Supabase Broadcast wake signal for polling |
| `index.ts` | Runtime initialization (DataSink selection, heartbeat start) |

## Runtime Detection

```typescript
// worker/src/config.ts
IS_DEDICATED_RUNTIME = !!config.LUCID_RUNTIME_ID

// Determines:
// - Which DataSink to use (Supabase vs REST)
// - Which crons to run (sharedOnly filtering)
// - Which channel mode (C1 relay vs standard outbound)
// - Which orchestration (relay polling vs Pulse/standard polling)
```

## Design Doc

`docs/plans/2026-03-30-channel-architecture-dedicated-runtimes.md`
