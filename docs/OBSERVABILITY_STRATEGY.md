# Lucid Platform — Global Observability Strategy

> **Version:** 1.1 (tightened 8 high-leverage items)  
> **Date:** 2026-02-12  
> **Status:** Active  
> **Audience:** All Lucid service developers

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  lucid-web   │     │lucid-worker │     │  lucid-l2   │     │ lucid-core  │
│  (Next.js)   │     │  (Railway)  │     │  (Gateway)  │     │  (Backend)  │
│              │     │              │     │              │     │              │
│ Sentry only  │────▶│ OTel + Sentry│────▶│ OTel + Sentry│────▶│ OTel + Sentry│
│ (errors)     │     │ (full stack) │     │ (full stack) │     │ (full stack) │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │           traceparent propagation       │                    │
       │              (W3C Trace Context)        │                    │
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                    OTLP Collector / Backend                         │
  │         (Grafana Tempo, Jaeger, Honeycomb, Axiom, etc.)            │
  └─────────────────────────────────────────────────────────────────────┘
       ▲                    ▲                    ▲                    ▲
       │                    │                    │                    │
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        Sentry (errors)                              │
  │  Projects: lucid-web | lucid-worker | lucid-l2 | lucid-core        │
  └─────────────────────────────────────────────────────────────────────┘
```

**Simple rule of thumb:**
- **OTel** = tracing backbone (distributed traces, spans, performance)
- **Sentry** = error truth (stack traces, alerting, release tracking)
- They cross-link via `trace_id` + `runId`

---

## What's Global (Shared Strategy)

### 1. Shared Package: `@lucid/observability`

All repos import from `packages/lucid-observability/` (or copy its conventions).

| Module | What it provides |
|--------|-----------------|
| `conventions.ts` | Service names, span names, attribute keys, sampling defaults |
| `hash.ts` | `hashForTelemetry()` — salted SHA-256 for identity values |
| `sanitize.ts` | `sanitizeErrorForTelemetry()`, `classifyError()` |
| `attributes.ts` | `filterAttributes()`, `safeSetAttribute()` — allowlist enforcement |
| `propagation.ts` | `injectTraceContext()`, `injectTraceContextForTarget()`, `shouldPropagateTraceContext()`, `extractTraceContext()`, `getCorrelationFields()` |
| `sentry.ts` | `enrichSentryEvent()`, `applySentryPiiScrubbing()` |

### 2. Canonical Service Names

| Constant | Value | Deployment |
|----------|-------|------------|
| `SERVICE_NAMES.LUCID_WEB` | `lucid-web` | Vercel |
| `SERVICE_NAMES.LUCID_WORKER` | `lucid-worker` | Railway |
| `SERVICE_NAMES.LUCID_L2` | `lucid-l2` | Railway |
| `SERVICE_NAMES.LUCID_CORE` | `lucid-core` | Railway |

### 3. Required Span Names (Baseline 5)

| Span Name | Parent | Service | What it covers |
|-----------|--------|---------|----------------|
| `inbound.pipeline` | root | worker | Full message processing |
| `llm.call` | inbound.pipeline | worker | Single LLM invocation |
| `tool.execute` | inbound.pipeline | worker | Single tool execution |
| `encrypt.message` | inbound.pipeline | worker | Message/memory encryption |
| `memory.extract` | inbound.pipeline | worker | Memory extraction pipeline |

### 4. Attribute Allowlist

All attribute keys are defined in `ATTR_KEYS` constant. The runtime enforcer blocks
any key not in the set. See `packages/lucid-observability/src/conventions.ts` for the
full list.

**Hard rules:**
- Identity keys (`tenant_key`, `session_key`, `user_key`) → ALWAYS hashed via `hashForTelemetry()`
- UUIDs (`message_id`, `run_id`, `conversation_id`) → OK raw in **traces and logs** (not PII)
- ⚠️ UUIDs are **HIGH CARDINALITY** — **NEVER use them as metric labels/dimensions.** They are safe for traces and logs only.
- Content (plaintext, ciphertext, prompts, tool arguments) → NEVER an attribute

### 4b. PII Boundaries by Signal Type (explicit)

- **Traces:** IDs only (hashed where identity), durations/statuses/counters only
- **Logs:** PII-safe operational hints allowed, but never prompt/response content, tool args, or request/response bodies
- **Sentry:** Same scrubbing baseline as traces + logs; never attach raw request/response bodies

### 5. Error Sanitization Contract

Every service MUST sanitize errors before telemetry:
```typescript
import { sanitizeErrorForTelemetry } from '@lucid/observability'

span.recordException(sanitizeErrorForTelemetry(err))
```

**Never leaked:** request bodies, prompt text, response bodies, tool arguments.

### 6. Trace Propagation (Full Chain)

Internal HTTP calls MUST propagate W3C Trace Context across the **full chain**:

```
┌──────────────┐  traceparent  ┌──────────────┐  traceparent  ┌──────────────┐
│ lucid-worker │ ────────────▶ │   lucid-l2   │ ────────────▶ │  lucid-core   │
│  (Railway)   │               │  (Gateway)   │               │  (Backend)    │
└──────────────┘               └──────────────┘               └──────────────┘
```

**Each service in the chain MUST:**
1. **Extract** trace context from incoming request headers
2. **Continue** the trace by creating child spans
3. **Inject** trace context into all outgoing internal HTTP calls

```typescript
import { injectTraceContext, extractTraceContext } from '@lucid/observability'

// Outgoing: inject before every internal HTTP call
const headers = { 'Content-Type': 'application/json' }
injectTraceContext(headers, { hop: 'internal' }) // adds traceparent + tracestate
await fetch(internalUrl, { headers })

// Incoming: extract at the start of every HTTP handler
const ctx = extractTraceContext(req.headers)
const span = tracer.startSpan('handle.request', {}, ctx)
```

**Specifically:**
- `lucid-worker` MUST inject trace context into calls to `lucid-l2`
- `lucid-l2` MUST extract from worker and continue the trace
- Each service MUST extract and continue traces from any internal caller

### External Hop Policy

| Destination | Propagate traceparent? | Why |
|-------------|----------------------|-----|
| Internal services (worker → l2, worker → core) | ✅ Yes | Required for distributed tracing |
| External LLM providers (OpenAI, Anthropic, etc.) | ❌ **No** | Leaks stable correlation ID outside trust boundary |

**Run correlation header policy:**
- Internal service hops MUST forward `x-lucid-run-id`
- External provider hops MUST NOT receive `x-lucid-run-id`

For external provider calls, create a **local span** (e.g., `llm.call`) to capture timing and status, but **do not inject** `traceparent` headers into the outgoing request. This matches our privacy posture.

```typescript
// ✅ Internal: inject trace context explicitly
const internalHeaders = { 'Content-Type': 'application/json' }
injectTraceContext(internalHeaders, { hop: 'internal' })
await fetch(lucidL2Url, { headers: internalHeaders })

// ✅ Preferred: centralize decision by URL policy
const headers = { 'Content-Type': 'application/json' }
injectTraceContextForTarget(headers, targetUrl, {
  internalHosts: ['lucid-l2.internal', 'lucid-core.internal'],
})

// ❌ External: no trace injection, local span only
const span = tracer.startSpan('llm.call')
const response = await fetch(openaiUrl, { headers: authHeaders })
span.end()
```

### 7. Sampling Policy

**Head Sampling (in-app):**

| Environment | Default Ratio | Override Env Var |
|-------------|---------------|------------------|
| production | 0.1 (10%) | `OTEL_TRACES_SAMPLER_ARG` |
| staging | 1.0 (100%) | `OTEL_TRACES_SAMPLER_ARG` |
| development | 1.0 (100%) | `OTEL_TRACES_SAMPLER_ARG` |
| test | 0.0 (0%) | `OTEL_TRACES_SAMPLER_ARG` |

**⚠️ Head sampling CANNOT guarantee error traces are kept.**

**Tail Sampling (at the collector/backend):**
For 100% error trace retention, configure tail sampling at the OTLP collector or backend:
- Retain 100% of traces containing `otel.status = ERROR` spans
- Retain 100% of traces with latency > p99 threshold
- This is configured in Grafana Tempo, Honeycomb, or your OTel Collector — not in app code

### 8. Export Path

All services export to ONE OTLP endpoint:
```
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer xxx
```

### 9. Log Correlation Fields

Every structured log line MUST include:
```json
{
  "trace_id": "4bf92f3577b34da6...",
  "span_id": "00f067aa0ba902b7",
  "run_id": "550e8400-e29b-41d4...",
  "service": "lucid-worker",
  "environment": "production"
}
```

Use `getCorrelationFields()` from the shared package.

### 9b. Metrics Label Policy (cardinality guardrail)

**Allowed metric labels only:**
- `service`
- `environment`
- `provider_name`
- `channel_type`
- `status_code_bucket`
- `model_family`

**Forbidden metric labels:**
- `run_id`, `message_id`, `conversation_id`
- raw tenant/session/user keys
- hashed identity keys (`*_hash`) in metric dimensions

---

## What's Per-Repo (Local Implementation)

### SDK Initialization

Each service initializes its own OTel SDK. The worker example:
```typescript
// worker/src/observability/tracing.ts
import { SERVICE_NAMES } from '@lucid/observability'

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAMES.LUCID_WORKER,
    ...
  }),
  spanProcessors: [new BatchSpanProcessor(exporter)],
})
sdk.start()
```

### Service-Specific Instrumentation

- **Worker:** Queue consumer, inbound/outbound processors, agent loop
- **Lucid-L2:** HTTP proxy calls, model routing, provider fallback
- **Lucid-Web:** API route handlers (lighter — Sentry + Vercel Analytics primary)
- **Lucid-Core:** Database operations, shared business logic

### Sentry Projects

| Project Slug | Service | Platform |
|-------------|---------|----------|
| `lucid-web` | Next.js frontend + API | Vercel |
| `lucid-worker` | Event processor | Railway |
| `lucid-l2` | LLM gateway | Railway |
| `lucid-core` | Backend services | Railway |

All under the **same Sentry org** with consistent:
- Release tags (`SENTRY_RELEASE`)
- Environment naming (`production`, `staging`, `development`)
- PII scrubbing rules (use `applySentryPiiScrubbing()`)

---

## Sentry Integration Pattern

### Per-Service Setup

```typescript
import * as Sentry from '@sentry/node'
import { enrichSentryEvent, applySentryPiiScrubbing, SERVICE_NAMES, getLucidEnv } from '@lucid/observability'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: getLucidEnv(),     // ← LUCID_ENV, not NODE_ENV
  release: process.env.SENTRY_RELEASE,
  
  // ⚠️ Sentry tracesSampleRate MUST stay 0 — OTel is the tracing source of truth.
  // Setting this >0 causes double ingestion, doubled costs, and conflicting trace data.
  tracesSampleRate: 0,
  
  beforeSend(event, hint) {
    // 1. Scrub PII
    applySentryPiiScrubbing(event)
    
    // 2. Cross-link to OTel trace (strict contract)
    enrichSentryEvent(event, {
      runId: getCurrentRunId(),
      serviceName: SERVICE_NAMES.LUCID_WORKER,
      environment: getLucidEnv(),
    })
    
    return event
  },
})
```

### Strict Cross-Linking Contract

Every Sentry project MUST set these exact fields via `enrichSentryEvent()`:

**Tags (top-level, filterable in Sentry search):**
| Tag | Value | Example |
|-----|-------|---------|
| `trace_id` | OTel trace ID (32-char hex) | `4bf92f3577b34da6a3ce929d0e0e4736` |
| `run_id` | Lucid run ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `service` | Canonical service name | `lucid-worker` |
| `environment` | LUCID_ENV value | `production` |

**Contexts (structured, visible in event detail):**
| Context | Fields |
|---------|--------|
| `otel` | `trace_id`, `span_id`, `run_id` |
| `lucid` | `service`, `environment` |

### Cross-Linking: Error → Trace → Log

```
Sentry Error (LUCID-WORKER-123)
  → tags.trace_id = "4bf92f..."
  → tags.run_id = "550e8400..."
  → tags.service = "lucid-worker"
  → tags.environment = "production"
  → contexts.otel = { trace_id, span_id, run_id }
  → contexts.lucid = { service, environment }
    → OTel Trace View (Grafana/Jaeger)
      → span: inbound.pipeline
        → child: llm.call (provider=lucid-l2, duration=1200ms)
        → child: encrypt.message (mode=APP_LAYER)
    → Structured Logs (filtered by trace_id)
      → [worker] Processing message (trace_id=4bf92f...)
      → [worker] LLM call complete (trace_id=4bf92f...)
```

---

## Env Vars (All Services)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LUCID_ENV` | **Yes** | falls back to `NODE_ENV` | Canonical environment: `production`, `staging`, `development`, `test`. Do NOT rely on `NODE_ENV`. |
| `OTEL_ENABLED` | No | `false` | Enable OTel tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | If enabled | `http://localhost:4318` | OTLP endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | If auth needed | — | `key=value,key=value` |
| `OTEL_SERVICE_NAME` | No | per-service default | Override service name |
| `OTEL_TRACES_SAMPLER_ARG` | No | per-env default | Head sampling ratio 0.0–1.0 |
| `OTEL_HASH_SALT` | **Yes in prod** | `lucid-otel-v1` | Salt for identity hashing. **MUST be set when LUCID_ENV=production.** |
| `SENTRY_DSN` | Yes | — | Sentry project DSN |
| `SENTRY_RELEASE` | Recommended | — | Release version tag (also used as `service.version`) |

---

## Adding a New Service

1. Add the service name to `SERVICE_NAMES` in `packages/lucid-observability/src/conventions.ts`
2. Add the Sentry project slug to `SENTRY_PROJECTS`
3. Add dependency: `"@lucid/observability": "file:../packages/lucid-observability"`
4. Initialize OTel SDK (copy pattern from `worker/src/observability/tracing.ts`)
5. Initialize Sentry (copy pattern above)
6. Add `injectTraceContextForTarget()` (or `injectTraceContext(..., { hop })`) to all outgoing HTTP calls
7. Add `getCorrelationFields()` to all structured log lines

---

## Adding a New Span

1. Add the span name to `SPAN_NAMES` in `conventions.ts`
2. Add any new attribute keys to `ATTR_KEYS`
3. Create a `start*Span()` helper in the service's local tracing module
4. Wire it into the code path
5. Document in this file

---

## Checklist for Audit / Review

- [ ] `LUCID_ENV` set in all deployment targets (not relying on `NODE_ENV`)?
- [ ] All identity values hashed (128-bit / 32 hex chars) in telemetry?
- [ ] `OTEL_HASH_SALT` set to a unique secret in production?
- [ ] No content (prompts, responses, tool args) in span attributes?
- [ ] UUIDs (`run_id`, `message_id`) NOT used as metric labels?
- [ ] Error sanitization applied before `recordException()`?
- [ ] `traceparent` propagated on ALL internal HTTP calls (worker → L2 → core)?
- [ ] Each service extracts + continues traces from incoming headers?
- [ ] Structured logs include `trace_id`, `span_id`, `run_id`?
- [ ] Sentry events include strict cross-link contract (tags + contexts)?
- [ ] Head sampling configured per environment?
- [ ] Tail sampling configured at collector for 100% error trace retention?
- [ ] PII scrubbing applied in Sentry `beforeSend`?
- [ ] OTel Resource includes `service.namespace=lucid` + `service.version`?
- [ ] `traceparent` NOT sent to external providers (OpenAI, Anthropic, etc.)?
- [ ] Regression test asserts `traceparent` is never sent to external provider requests?
- [ ] Regression test asserts `x-lucid-run-id` is forwarded only to internal service hops?
- [ ] Sentry `tracesSampleRate` = 0 (OTel is sole tracing source)?
- [ ] `configureHashSalt()` called at process startup (before any spans)?
- [ ] Log correlation fields read from active OTel context (not cached/stale)?
