# Production Stress Test Report

**Date:** February 11, 2026  
**Node:** v20.13.1  
**Runner:** `tests/stress/runner.js`  
**Result:** ✅ 31/31 PASSED (0 failures) — 1,403ms total

---

## Test Suite Overview

| Scenario | Tests | Status | Time |
|----------|-------|--------|------|
| S1: Encryption Idempotency & Integrity | 6 | ✅ All Pass | 26ms |
| S2: BYOK Provider Detection & Fallback | 7 | ✅ All Pass | 3ms |
| S3: Concurrent Operation Idempotency | 4 | ✅ All Pass | 1,271ms |
| S4: BYOK Decryption Failure → Lucid Fallback | 4 | ✅ All Pass | <1ms |
| S5: Transaction Rollback Recovery | 4 | ✅ All Pass | 43ms |
| S6: Rate Limiting & Graceful Degradation | 6 | ✅ All Pass | 60ms |

---

## Scenario Details

### S1: Encryption Idempotency & Integrity

Tests AES-256-GCM encryption used for BYOK provider keys (`src/lib/crypto/encryption.ts`).

| Test | Result |
|------|--------|
| Encrypt → Decrypt roundtrip preserves data | ✅ |
| Same plaintext produces different ciphertexts (random IV) | ✅ |
| Tampered ciphertext fails decryption (auth tag check) | ✅ |
| Wrong encryption key fails decryption | ✅ |
| 100 concurrent encrypt/decrypt operations succeed | ✅ |
| Encryption performance: 1000 ops < 500ms (actual: 19ms) | ✅ |

**Key finding:** 1,000 encrypt operations complete in ~19ms. No bottleneck at encryption layer.

### S2: BYOK Provider Detection & Fallback

Tests model → provider mapping logic from `src/lib/ai/byok-provider.ts`.

| Test | Result |
|------|--------|
| OpenAI models detected (gpt-4o, gpt-3.5-turbo, o1) | ✅ |
| Anthropic models detected as non-compatible | ✅ |
| Groq models detected correctly | ✅ |
| Together AI models detected correctly | ✅ |
| Unknown models return null (→ Lucid fallback) | ✅ |
| Non-compatible providers (Anthropic/Google/Cohere) → Lucid | ✅ |
| 1,000 provider detections < 10ms (actual: 2ms) | ✅ |

**Key finding:** Provider detection is O(n) on prefix list but completes 1,000 lookups in 2ms. No optimization needed.

### S3: Concurrent Operation Idempotency

Tests race conditions and unique constraint enforcement for provider key operations.

| Test | Result |
|------|--------|
| Promise.allSettled handles mixed success/failure | ✅ |
| Duplicate key insertion: first wins, second errors | ✅ |
| 50 concurrent operations with mutex: no corruption | ✅ |
| Race condition detection: unprotected counter drifts | ✅ |

**Key finding:** The DB unique constraint (`unique_active_provider_key`) prevents duplicate BYOK keys. The test confirms that concurrent inserts are safe — exactly one succeeds and the other gets a unique violation error.

### S4: BYOK Decryption Failure → Lucid Fallback

Tests the fallback chain in `/api/ai/chat` when BYOK resolution fails.

| Test | Result |
|------|--------|
| Decryption error → Lucid fallback | ✅ |
| No key found → Lucid fallback | ✅ |
| Provider creation error → Lucid fallback | ✅ |
| 100 fallback resolutions < 50ms (actual: <1ms) | ✅ |

**Key finding:** The try/catch fallback in the chat route (`getBYOKModel` → `getLucidModel`) is reliable. All 3 failure modes correctly degrade to Lucid.

### S5: Transaction Rollback Recovery

Tests transaction atomicity and retry logic for multi-step DB operations.

| Test | Result |
|------|--------|
| Transaction success path | ✅ |
| Transaction failure → complete rollback | ✅ |
| Retry after rollback succeeds (3 attempts) | ✅ |
| Concurrent transactions: no phantom reads | ✅ |

**Key finding:** The savepoint/rollback pattern ensures no partial state. Transient errors are recoverable with 3-attempt retry.

### S6: Rate Limiting & Graceful Degradation

Tests rate limiting behavior and 429 response handling.

| Test | Result |
|------|--------|
| Allows requests under threshold | ✅ |
| Blocks requests over threshold | ✅ |
| Different users have separate limits | ✅ |
| Window resets after timeout | ✅ |
| 100 burst requests: correct blocking (20 allowed, 80 blocked) | ✅ |
| 429 response structure (status, error, Retry-After) | ✅ |

**Key finding:** Rate limiter correctly isolates per-user windows and resets after the configured timeout.

---

## How to Run

```bash
# Run all 6 scenarios
node tests/stress/runner.js

# Run a specific scenario (1-6)
node tests/stress/runner.js --scenario 1

# Include API endpoint tests (requires dev server on :3000)
node tests/stress/runner.js --api
```

## Report Output

JSON reports are saved to `logs/stress-test-{timestamp}.json` for CI integration.

---

## Recommendations

1. **Add to CI pipeline** — Run `node tests/stress/runner.js` as a pre-deploy check
2. **API tests** — Start dev server and run with `--api` flag for HTTP-level testing
3. **Load testing** — Consider k6/artillery for sustained load (100+ concurrent users)
4. **Monitor in production** — Use Sentry + Supabase dashboards to track:
   - BYOK fallback rate (should be < 5%)
   - Encryption latency (should be < 10ms p99)
   - Unique constraint violations (expected during race conditions)
   - 429 rate (indicates users hitting limits)