# Cron System

Background job registry with interval-based execution. Jobs are defined in `definitions.ts` and managed by `registry.ts`.

This package is for **platform maintenance cron**, not user/product routines. Product-visible scheduled work belongs to the Routine Kernel:

- contract: `contracts/routine.ts`
- app/API: `src/lib/routines/*`, `/api/routines/**`
- worker execution: `worker/src/routines/*`
- queue/admission: Pulse scheduled worker
- storage: `agent_scheduled_tasks`, `agent_scheduled_task_versions`, `agent_scheduled_task_runs`

Do not add Agent Ops, Browser, Knowledge, EHV, plugin, PM, Hermes, OpenClaw, or team-specific product schedulers here. Add a Routine target adapter and call the owning domain service instead.

## How It Works

```
index.ts startup
  → getCronJobs(supabase, config) returns CronJob[]
  → registry.startAll() → setInterval per job
  → gracefulShutdown() → registry.stopAll() → clearInterval
```

Jobs are NOT distributed — each worker process runs its own cron timers. `sharedOnly: true` jobs only run on the shared SaaS worker (skipped on dedicated runtimes). This is acceptable because these jobs are platform-owned maintenance loops. User routines use the central database + Pulse path for distributed claim, retry, run receipts, and runtime/engine-neutral execution.

## Job Definitions

| Job | Interval | Shared Only | Purpose |
|-----|----------|------------|---------|
| `summary-jobs` | 10s | No | Poll and execute conversation summary generation |
| `session-cleanup` | 6h | No | Clean stale OpenClaw session directories |
| `revenue-epoch` | 7d | Yes | Weekly Lucid Launch revenue settlement |
| `health-scores` | 1h | Yes | Compute 6-dimension agent health scores |
| `remediation` | 1min | Yes | Evaluate auto-remediation policies |
| `conversation-intel` | 1d | Yes | Daily conversation analysis (sentiment, topics) |
| `cost-optimizer` | 7d | Yes | Weekly cost optimization recommendations |
| `runtime-reconciler` | 1min | Yes | Clean stuck deploy intents, stale runtimes |
| `browser-qa-retention` | 1d | Yes | Expire Browser QA sessions and clean old artifacts/usage events |
| `knowledge-source-refresh` | 5min | Yes | Refresh due Knowledge source metadata and mark changed sources stale |
| `polymarket-balance-sync` | 5min | Yes | Sync on-chain Polymarket positions |
| `polymarket-automation` | 1min | Yes | Evaluate automation rules (stop-loss, etc.) |
| `integration-health` | 1d | Yes | Check Nango integration OAuth token health |
| `event-retention` | 1d | Yes | Clean old events beyond retention window |
| `runtime-drain` | 30s | Yes | Drain Redis Streams telemetry to Postgres |

## Files

| File | Purpose |
|------|---------|
| `definitions.ts` | Job list with intervals, handlers, shared-only flags |
| `registry.ts` | CronJob type, start/stop lifecycle, timer management |
| `health-scores.ts` | 6-dimension weighted health computation |
| `remediation.ts` | Policy evaluation + auto-actions |
| `conversation-intelligence.ts` | Sentiment, satisfaction, topic clustering |
| `cost-optimizer.ts` | Model/prompt cost reduction suggestions |
| `revenue-epoch.ts` | Lucid Launch staking reward distribution |
| `runtime-drain.ts` | Redis Streams → Postgres flush (reference for Upstash patterns) |
| `runtime-reconciler.ts` | Stuck intent cleanup, stale runtime detection |
| `browser-qa-retention.ts` | Browser QA session/artifact/usage retention cleanup |
| `../jobs/knowledge-source-refresh.ts` | Scheduled Knowledge source metadata refresh |
| `integration-health.ts` | OAuth token refresh health checks |
| `event-retention.ts` | Old event cleanup |

## Runtime Drain Operational Notes

- `runtime-drain` uses Upstash HTTP only for telemetry ingest buffering. It is separate from Pulse's TCP Redis path.
- If Upstash returns `ERR max requests limit exceeded`, `runtime-drain` now enters a 15 minute in-process backoff instead of retrying every cron interval.
- During that backoff window the cron cycle returns as skipped, which keeps worker logs readable and avoids wasting more Upstash quota.
- Normal drain behavior resumes automatically after the cooldown expires.

## Receipt Emission Operational Notes

- Worker receipt emission is fire-and-forget and remains gated by `FEATURE_RECEIPTS`.
- Receipts are posted to `${LUCID_API_BASE_URL}/v1/receipts`.
- If that endpoint returns `404`, the worker now disables receipt emission for 60 minutes in-process.
- This avoids logging the same missing-endpoint warning on every completed run while the upstream receipts API is unavailable.
