# Migration Plan: Railway → Google Cloud Pub/Sub + Cloud Run (Managed Autoscaling)

## Overview

Migrate from Railway worker polling to **Pub/Sub + Cloud Run** with **managed autoscaling**, keeping Supabase as the system of record and your claim/idempotency pattern.

---

## Current Architecture

```
┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Vercel     │───▶│  Supabase   │◀───│   Railway    │
│   (API)      │    │  (Polling)  │    │   (Worker)  │
└──────────────┘    └─────────────┘    └──────────────┘
```

---

## Target Architecture (Google)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Vercel (Producer)                              │
│  ┌────────────────┐   ┌────────────────────────────────────────────┐  │
│  │ API Routes      │──▶│ Write to Supabase (system of record)       │  │
│  │                 │   │ Publish message → Pub/Sub                  │  │
│  └────────────────┘   └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              Pub/Sub                                  │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐ │
│  │ topic-high-priority          │   │ topic-low-priority           │ │
│  │ (chat turns)                 │   │ (background tasks)          │ │
│  └──────────────────────────────┘   └──────────────────────────────┘ │
│            │                                  │                        │
│            ▼                                  ▼                        │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐ │
│  │ sub-high → Cloud Run service │   │ sub-low → Cloud Run service │ │
│  │ worker-high (autoscale)      │   │ worker-low (autoscale)      │ │
│  └──────────────────────────────┘   └──────────────────────────────┘ │
│            │                                  │                        │
│            └───────────────┬──────────────────┘                        │
│                            ▼                                           │
│                    ┌───────────────────────────┐                      │
│                    │ Supabase (System of Record)│                      │
│                    │ claim_event / mark_done    │                      │
│                    └───────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────┘

Optional:
- Dead-letter topic (DLQ) on subscription → alert + mark failed in DB
- Separate Cloud Run "gateway" service for Discord WebSockets (always-on)
```

---

## Migration Checklist

## Phase 1: Google Infrastructure Setup

- [ ] **1.1** Create GCP project
- [ ] **1.2** Create Service Accounts:

  - `vercel-producer-sa` (publish to Pub/Sub)
  - `worker-high-sa` (Supabase access only)
  - `worker-low-sa` (Supabase access only)
- [ ] **1.3** Create Pub/Sub topics:

  - `topic-high-priority`
  - `topic-low-priority`
- [ ] **1.4** Create Pub/Sub subscriptions:

  - `sub-high` (push to Cloud Run `worker-high`)
  - `sub-low` (push to Cloud Run `worker-low`)
- [ ] **1.5** Configure retries + DLQ:

  - Use **Dead Letter Topic** per subscription (after N delivery attempts)
  - Set **max delivery attempts = N** (e.g. 10) → then DLQ topic
- [ ] **1.6** Configure Pub/Sub → Cloud Run auth:

  - Use **OIDC token** from Pub/Sub push service account
  - Cloud Run: **require authentication** (don't leave public)
- [ ] **1.7** Store secrets in Secret Manager:

  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
- [ ] **1.8** Cloud Logging + Error Reporting for workers

---

## Phase 2: Producer (Vercel → Pub/Sub)

**Goal:** after inserting into Supabase, publish `{ eventId, eventType }` to Pub/Sub.

- [ ] **2.1** Option A (simplest): call Pub/Sub directly from Vercel using a service account (short-lived token via workload identity federation or a minimal key for MVP)
- [ ] **2.2** Option B: expose a tiny Cloud Run "enqueue" endpoint (auth required) that publishes to Pub/Sub
  *(This mirrors your AWS "enqueue Lambda", but on GCP)*

**Message body example:**

```json
{ "eventId": "...", "eventType": "inbound", "priority": "high" }
```

---

## Phase 3: Database Schema (Same as AWS plan)

✅ Keep your existing RPCs:

- `claim_event`
- `renew_event_lease` (optional on GCP)
- `mark_event_done`
- `mark_event_failed`

No change required here.

---

## Phase 4: Worker Code Changes (Much simpler)

Key difference vs SQS:

- Pub/Sub delivers the message via HTTP to Cloud Run.
- You **don't write a polling loop**.
- You **don't manage receipt handles**.
- You **ACK by returning HTTP 2xx**.
- You **NACK by returning non-2xx** (Pub/Sub retries automatically).

### Cloud Run Worker Handler (Concept)

**Flow:**

1. Receive push message (contains `eventId`, `eventType`)
2. `claim_event(eventId)`
3. If claim returns **false** → **return 200 immediately** (ACK), because another worker already owns it
4. Process
5. `mark_event_done`
6. Return **200**

If it fails: return **500** → retry → eventually DLQ.

**Heartbeat?**

- Usually not needed for short jobs.
- If you have multi-minute jobs, you can keep `renew_event_lease` (DB) but you no longer have "visibility timeout" like SQS; retries are handled by Pub/Sub delivery.

---

## Phase 5: Deployment (Cloud Run)

Create 2 Cloud Run services:

- [ ] `worker-high` (handles `sub-high`)
- [ ] `worker-low` (handles `sub-low`)

Scaling config:

- `min-instances`: 0 or 1 (0 cheaper, 1 faster/less cold start)
- `max-instances`: set caps like your AWS max tasks
- `concurrency`: set per instance (ex: 1–10) depending on workload
- `timeout`: set to expected max (e.g. 5–15 min). If trading action can exceed this, keep it in the **always-on trading executor** service

---

## Phase 6: Observability & Alerting

- [ ] DLQ subscription → Cloud Run / Cloud Function to:

  - call `mark_event_failed`
  - send alert (Slack/PagerDuty)
- [ ] Log-based alerts on repeated failures

---

## Phase 7: Testing & Cutover (Same idea)

- [ ] Run Cloud Run workers alongside Railway
- [ ] Publish a subset of events to Pub/Sub
- [ ] Monitor
- [ ] Cut over fully
- [ ] Keep Railway for a week
- [ ] Decommission

---

## Environment Variables (Cloud Run)

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

WORKER_NAME=worker-high
MAX_CONCURRENT=5   # if you keep in-process concurrency
```

---

## What you delete vs AWS plan (big simplification)

Delete/replace these sections entirely:

- **AWS API Gateway + Lambda**
- **SQS queues + visibility timeout logic**
- **ECS cluster / task definitions / services**
- **Autoscaling policies on queue age**
- **All SQS polling code** (`ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`)
- **Most of the heartbeat logic** (only keep DB lease renew if truly needed)

Replace with:

- Pub/Sub topic + subscription (push)
- Cloud Run service autoscaling knobs
- Simple HTTP handler that ACK/NACK via status code
- DLQ topic + small handler to mark failed + alert

---

## Fastest Possible Version

**1 Cloud Run worker (no high/low split yet) + 1 topic + 1 subscription + DLQ**.
Split high/low later when you have real load patterns.

---

## V1 Launch Fast (Minimal Version)

If your priority is speed + simplicity, here's the stripped-down version:

### Delete / Postpone (for v1)

- ❌ **High/low split** (2 topics, 2 subs, 2 Cloud Run services) → start with **1 topic + 1 subscription + 1 worker**
- ❌ **Any "enqueue service" (Option B)** → start with **Option A only** (publish from Vercel)
- ❌ **`renew_event_lease` heartbeat** → skip unless jobs regularly exceed a few minutes
- ❌ **Discord gateway mention** → keep out of this doc; it's a separate always-on service plan

### Keep (Must-Have)

- ✅ Pub/Sub **topic**
- ✅ Pub/Sub **push subscription → Cloud Run**
- ✅ **DLQ** (dead-letter topic) + tiny handler to `mark_event_failed` + alert
- ✅ Supabase RPCs: `claim_event`, `mark_event_done`, `mark_event_failed`
- ✅ Cloud Run settings: `max-instances` cap + `concurrency`

### The Real Minimal Architecture

```
Vercel → Supabase insert → Pub/Sub publish → Cloud Run worker → Supabase mark done
(+ DLQ topic + tiny DLQ handler)
```

### Critical: Handle Duplicate Delivery

If `claim_event(...)` returns **false** → **return 200 immediately** (ACK), because another worker already owns it.

### For Trading / Financial Features

This architecture works for trading with 2 conditions:

1. **Workers must be idempotent** - `claim_event` is the source of truth (retries/duplicates don't create duplicate trades)
2. **Hard safety gate** - before executing any trade, check in DB "already executed?" (unique constraint / idempotency key per order/signal)

If trading jobs can run long (streaming, waiting fills, monitoring positions), keep trading execution as a **long-running container service** and use Pub/Sub only to enqueue short commands (place/cancel/update).

---

### Minimum Changes for Trading Safety

To make this "trading-safe", add these constraints:

1. **Keep each worker run short enough for Pub/Sub push**
   - Pub/Sub push has an **ack deadline max 600s (10 min)**
   - Rule: make trading jobs **step-based** (place/cancel/update) and keep each step under a few minutes
   - Anything like "wait fill / monitor position" should be a **separate always-on executor** (not Pub/Sub)

2. **Duplicate delivery is normal — claim_event is your gate**
   - Pub/Sub push is **at-least-once** (ACK by returning HTTP 2xx)
   - If `claim_event(...)` returns **false** → **return 200 immediately** (another worker owns it)

3. **Add hard idempotency key (must-have)**
   - DB unique constraint: `(broker, account_id, idempotency_key)` or `(strategy_run_id, action_id)`
   - Worker checks "already executed?" before any trade side-effect
   - This prevents duplicate orders even under retries/redeliveries

4. **Ordering / serialization per account**
   - If order matters per account: set **Cloud Run concurrency=1** OR enable **Pub/Sub message ordering** with `orderingKey = accountId`

---

### Pub/Sub Push Payload Note

Cloud Run receives Pub/Sub push with `message.data` **base64-encoded**. Your handler must decode it correctly:

```typescript
// Example handler
const message = JSON.parse(Buffer.from(event.message.data, 'base64').toString())
```

---

### DLQ Max Delivery Attempts

You can set **max delivery attempts** (up to **100**) before messages go to dead-letter topic. Configure in subscription settings.

This is the fastest path to production.
