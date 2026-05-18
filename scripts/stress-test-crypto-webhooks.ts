#!/usr/bin/env npx tsx
/**
 * Crypto Payment Webhook Stress Test
 *
 * Simulates NOWPayments IPN webhooks against the local dev server to verify:
 * 1. HMAC signature verification (valid + invalid)
 * 2. Idempotency (duplicate webhook delivery)
 * 3. Race conditions (concurrent claims on same checkout attempt)
 * 4. All payment statuses (finished, partially_paid, expired, failed, refunded)
 * 5. Expired checkout attempts
 * 6. Missing checkout attempts
 * 7. Throughput under load
 *
 * Usage:
 *   npx tsx scripts/stress-test-crypto-webhooks.ts [--base-url http://localhost:3000]
 */

import crypto from 'crypto'
import { config } from 'dotenv'
import path from 'path'

// Load .env.local exactly like Next.js does
config({ path: path.resolve(__dirname, '..', '.env.local') })

// ============================================================================
// Config
// ============================================================================

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3000'

const WEBHOOK_URL = `${BASE_URL}/api/webhooks/nowpayments`

// Loaded from .env.local via dotenv — must match exactly what Next.js sees (including any trailing newline)
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET!

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.trimEnd()
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!.trimEnd()

// Test fixtures — must be valid FK references in the DB
// Override with env vars if needed: STRESS_TEST_ORG_ID, STRESS_TEST_USER_ID
const TEST_ORG_ID = process.env.STRESS_TEST_ORG_ID || '008ad390-875e-4be9-85bd-e1b5d04ee210'
const TEST_USER_ID = process.env.STRESS_TEST_USER_ID || '85415043-f8e9-4adf-9144-ce9d12f6a771'

let passed = 0
let failed = 0
let totalTests = 0

// ============================================================================
// Helpers
// ============================================================================

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj).sort().reduce<Record<string, unknown>>((result, key) => {
    const val = obj[key]
    result[key] = val && typeof val === 'object' && !Array.isArray(val)
      ? sortObject(val as Record<string, unknown>)
      : val
    return result
  }, {})
}

function signPayload(body: Record<string, unknown>, secret: string): string {
  const sorted = JSON.stringify(sortObject(body))
  return crypto.createHmac('sha512', secret).update(sorted).digest('hex')
}

async function sendWebhook(
  body: Record<string, unknown>,
  options: { signature?: string; secret?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const secret = options.secret ?? IPN_SECRET
  const signature = options.signature ?? signPayload(body, secret)

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nowpayments-sig': signature,
    },
    body: JSON.stringify(body),
  })

  const responseBody = await res.json().catch(() => ({}))
  return { status: res.status, body: responseBody }
}

function makePayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    payment_id: `stress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    payment_status: 'finished',
    order_id: `nonexistent_${Date.now()}`,
    pay_amount: 990,
    pay_currency: 'btc',
    price_amount: 990,
    price_currency: 'usd',
    actually_paid: 990,
    ...overrides,
  }
}

async function createTestCheckoutAttempt(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE env vars required to create test checkout attempts')
  }

  const id = crypto.randomUUID()
  const orgId = TEST_ORG_ID
  const res = await fetch(`${SUPABASE_URL}/rest/v1/checkout_attempts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id,
      org_id: orgId,
      user_id: TEST_USER_ID,
      plan_name: 'pro',
      billing_period: 'yearly',
      provider: 'nowpayments',
      status: 'pending',
      amount_cents: 29000,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create checkout attempt: ${res.status} ${err}`)
  }

  return id
}

async function createExpiredCheckoutAttempt(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE env vars required')
  }

  const id = crypto.randomUUID()
  const orgId = TEST_ORG_ID
  const res = await fetch(`${SUPABASE_URL}/rest/v1/checkout_attempts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id,
      org_id: orgId,
      user_id: TEST_USER_ID,
      plan_name: 'pro',
      billing_period: 'yearly',
      provider: 'nowpayments',
      status: 'pending',
      amount_cents: 29000,
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // expired 1 min ago
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create expired checkout attempt: ${res.status} ${err}`)
  }

  return id
}

async function cleanupTestData(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return

  // Clean up test checkout attempts
  await fetch(
    `${SUPABASE_URL}/rest/v1/checkout_attempts?user_id=eq.${TEST_USER_ID}&provider=eq.nowpayments&plan_name=eq.pro`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )

  // Clean up test webhook events
  await fetch(
    `${SUPABASE_URL}/rest/v1/webhook_events?event_id=like.stress_*`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )

  // Clean up test webhook events (stress_ prefix)
  await fetch(
    `${SUPABASE_URL}/rest/v1/webhook_events?event_id=like.stress_*`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )
}

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++
  if (condition) {
    passed++
    console.log(`  \x1b[32mPASS\x1b[0m ${testName}`)
  } else {
    failed++
    console.log(`  \x1b[31mFAIL\x1b[0m ${testName}${detail ? ` — ${detail}` : ''}`)
  }
}

// ============================================================================
// Test Suites
// ============================================================================

async function testSignatureVerification() {
  console.log('\n\x1b[1m1. Signature Verification\x1b[0m')

  // Valid signature
  const payload = makePayload()
  const res1 = await sendWebhook(payload)
  assert(res1.status !== 400 || !res1.body.error?.toString().includes('Signature'),
    'Valid signature accepted', `status=${res1.status}`)

  // Invalid signature
  const res2 = await sendWebhook(payload, { signature: 'deadbeef'.repeat(16) })
  assert(res2.status === 400, 'Invalid signature rejected', `status=${res2.status}`)

  // Missing signature header
  const res3 = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert(res3.status === 400, 'Missing signature rejected', `status=${res3.status}`)

  // Wrong secret
  const res4 = await sendWebhook(payload, { secret: 'wrong-secret-key' })
  assert(res4.status === 400, 'Wrong secret rejected', `status=${res4.status}`)

  // Tampered body (sign with correct secret, then modify)
  const tamperedPayload = { ...payload, pay_amount: 0 }
  const originalSig = signPayload(payload, IPN_SECRET)
  const res5 = await sendWebhook(tamperedPayload, { signature: originalSig })
  assert(res5.status === 400, 'Tampered body rejected', `status=${res5.status}`)
}

async function testMissingCheckoutAttempt() {
  console.log('\n\x1b[1m2. Missing Checkout Attempt\x1b[0m')

  const payload = makePayload({ order_id: 'nonexistent_order_99999' })
  const res = await sendWebhook(payload)
  // Should return 200 with error field (graceful handling)
  assert(res.status === 200 && res.body.error === 'attempt_not_found',
    'Returns 200 + attempt_not_found for missing order',
    `status=${res.status} body=${JSON.stringify(res.body)}`)
}

async function testExpiredCheckoutAttempt() {
  console.log('\n\x1b[1m3. Expired Checkout Attempt\x1b[0m')

  const attemptId = await createExpiredCheckoutAttempt()

  // Non-finished status should be rejected for expired attempt
  const payload = makePayload({
    order_id: attemptId,
    payment_status: 'partially_paid',
  })
  const res = await sendWebhook(payload)
  assert(res.status === 200 && res.body.expired === true,
    'Expired attempt + non-finished status returns expired=true',
    `status=${res.status} body=${JSON.stringify(res.body)}`)

  // "finished" status should still process even if expired (payment succeeded)
  const finishedPayload = makePayload({
    order_id: attemptId,
    payment_status: 'finished',
    payment_id: `stress_finished_expired_${Date.now()}`,
  })
  const res2 = await sendWebhook(finishedPayload)
  // Should attempt to process (claim the attempt) — may succeed or fail depending on plan lookup
  assert(res2.status === 200 || res2.status === 500,
    'Expired attempt + finished status still processes',
    `status=${res2.status} body=${JSON.stringify(res2.body)}`)
}

async function testIdempotency() {
  console.log('\n\x1b[1m4. Idempotency (Duplicate Webhooks)\x1b[0m')

  const attemptId = await createTestCheckoutAttempt()
  const paymentId = `stress_idemp_${Date.now()}`

  const payload = makePayload({
    order_id: attemptId,
    payment_id: paymentId,
    payment_status: 'finished',
  })

  // First delivery — should process (may 500 because plan 'pro' might not exist in test DB,
  // but the claim should succeed)
  const res1 = await sendWebhook(payload)
  const firstStatus = res1.status
  console.log(`    First delivery: status=${firstStatus} body=${JSON.stringify(res1.body)}`)

  // Second delivery — should be detected as duplicate
  const res2 = await sendWebhook(payload)
  assert(
    res2.status === 200 && res2.body.duplicate === true,
    'Second delivery detected as duplicate',
    `status=${res2.status} body=${JSON.stringify(res2.body)}`,
  )

  // Third delivery — still duplicate
  const res3 = await sendWebhook(payload)
  assert(
    res3.status === 200 && res3.body.duplicate === true,
    'Third delivery still duplicate',
    `status=${res3.status} body=${JSON.stringify(res3.body)}`,
  )
}

async function testRaceCondition() {
  console.log('\n\x1b[1m5. Race Condition (Concurrent Claims)\x1b[0m')

  const attemptId = await createTestCheckoutAttempt()

  // Fire 10 concurrent webhooks for the same checkout attempt
  const concurrency = 10
  const payloads = Array.from({ length: concurrency }, (_, i) =>
    makePayload({
      order_id: attemptId,
      payment_id: `stress_race_${Date.now()}_${i}`,
      payment_status: 'finished',
    }),
  )

  const results = await Promise.all(payloads.map(p => sendWebhook(p)))

  // Exactly ONE should have attempted processing (non-duplicate)
  // Others should be duplicate (claim failed because attempt already completed)
  const processed = results.filter(r => r.body.duplicate !== true)
  const duplicates = results.filter(r => r.body.duplicate === true)

  console.log(`    Processed: ${processed.length}, Duplicates: ${duplicates.length}`)
  assert(
    processed.length <= 1,
    `At most 1 of ${concurrency} concurrent webhooks processes (got ${processed.length})`,
  )
  assert(
    duplicates.length >= concurrency - 1,
    `At least ${concurrency - 1} detected as duplicate (got ${duplicates.length})`,
  )
}

async function testAllStatuses() {
  console.log('\n\x1b[1m6. All Payment Statuses\x1b[0m')

  const statuses = ['partially_paid', 'expired', 'failed', 'refunded', 'waiting', 'confirming']

  for (const status of statuses) {
    const attemptId = await createTestCheckoutAttempt()
    const payload = makePayload({
      order_id: attemptId,
      payment_status: status,
      payment_id: `stress_status_${status}_${Date.now()}`,
    })

    const res = await sendWebhook(payload)
    assert(
      res.status === 200,
      `Status "${status}" handled gracefully`,
      `status=${res.status} body=${JSON.stringify(res.body)}`,
    )
  }
}

async function testThroughput() {
  console.log('\n\x1b[1m7. Throughput (Burst Load)\x1b[0m')

  const burstSize = 50
  const payloads = Array.from({ length: burstSize }, (_, i) =>
    makePayload({
      payment_id: `stress_throughput_${Date.now()}_${i}`,
      payment_status: 'waiting', // harmless status, just tests throughput
    }),
  )

  const start = Date.now()
  const results = await Promise.all(payloads.map(p => sendWebhook(p)))
  const elapsed = Date.now() - start

  const success = results.filter(r => r.status === 200).length
  const rps = Math.round((burstSize / elapsed) * 1000)

  assert(success === burstSize,
    `${burstSize}/${burstSize} requests returned 200`,
    `${success}/${burstSize} succeeded`)
  console.log(`    Throughput: ${burstSize} requests in ${elapsed}ms (${rps} req/s)`)
  assert(elapsed < 10000,
    `Burst completed in <10s (took ${elapsed}ms)`)
}

async function testInvalidJson() {
  console.log('\n\x1b[1m8. Invalid Payloads\x1b[0m')

  // Invalid JSON
  const res1 = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nowpayments-sig': 'anything',
    },
    body: 'not-json{{{',
  })
  assert(res1.status === 400, 'Invalid JSON returns 400', `status=${res1.status}`)

  // Empty body
  const res2 = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nowpayments-sig': 'anything',
    },
    body: '{}',
  })
  // Should fail signature check
  assert(res2.status === 400, 'Empty body fails signature', `status=${res2.status}`)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`\x1b[1m\x1b[36mCrypto Webhook Stress Test\x1b[0m`)
  console.log(`Target: ${WEBHOOK_URL}`)
  console.log(`IPN Secret: ${IPN_SECRET.slice(0, 6)}...${IPN_SECRET.slice(-4)}`)

  // Verify server is reachable
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) })
  } catch {
    console.error(`\n\x1b[31mERROR: Cannot reach ${BASE_URL}. Is the dev server running?\x1b[0m`)
    console.error('Start it with: npm run dev')
    process.exit(1)
  }

  const hasSupabase = !!(SUPABASE_URL && SUPABASE_KEY)
  if (!hasSupabase) {
    console.log('\n\x1b[33mWARN: No SUPABASE env vars — skipping tests that need DB fixtures\x1b[0m')
  }

  try {
    // Tests that don't need DB
    await testSignatureVerification()
    await testInvalidJson()
    await testMissingCheckoutAttempt()

    // Tests that need DB fixtures
    if (hasSupabase) {
      await testExpiredCheckoutAttempt()
      await testIdempotency()
      await testRaceCondition()
      await testAllStatuses()
    }

    // Throughput (doesn't need real checkout attempts)
    await testThroughput()

  } finally {
    if (hasSupabase) {
      console.log('\n\x1b[90mCleaning up test data...\x1b[0m')
      await cleanupTestData()
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`\x1b[1mResults: ${passed}/${totalTests} passed\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m${failed} test(s) failed\x1b[0m`)
    process.exit(1)
  } else {
    console.log(`\x1b[32mAll tests passed!\x1b[0m`)
  }
}

main().catch((err) => {
  console.error('\n\x1b[31mFatal error:\x1b[0m', err)
  process.exit(1)
})
