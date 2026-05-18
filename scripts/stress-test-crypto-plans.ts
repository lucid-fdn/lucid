#!/usr/bin/env npx tsx
/**
 * Crypto Payment Plan Correctness Test
 *
 * Verifies that each plan paid via crypto creates the correct subscription:
 * - Pro yearly → subscription with pro plan_id, yearly period, correct amount, 1-year period
 * - Business yearly → subscription with business plan_id, yearly period, correct amount, 1-year period
 * - Payment record has correct provider, amount, currency
 * - Existing subscription is canceled on upgrade
 *
 * Usage:
 *   npx tsx scripts/stress-test-crypto-plans.ts
 */

import crypto from 'crypto'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(__dirname, '..', '.env.local') })

// ============================================================================
// Config
// ============================================================================

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3000'

const WEBHOOK_URL = `${BASE_URL}/api/webhooks/nowpayments`
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET!

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.trimEnd()
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!.trimEnd()

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

async function sendWebhook(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const signature = signPayload(body, IPN_SECRET)
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

async function supabaseQuery(table: string, params: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  return res.json()
}

async function supabaseDelete(table: string, params: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
}

async function createCheckoutAttempt(planName: string, amountCents: number): Promise<string> {
  const id = crypto.randomUUID()
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
      org_id: TEST_ORG_ID,
      user_id: TEST_USER_ID,
      plan_name: planName,
      billing_period: 'yearly',
      provider: 'nowpayments',
      status: 'pending',
      amount_cents: amountCents,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create checkout attempt: ${res.status} ${err}`)
  }
  return id
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
// Cleanup — remove test subscriptions/payments before and after
// ============================================================================

async function cleanupOrg(): Promise<void> {
  // Delete payments for this org (depends on subscriptions, so delete first)
  await supabaseDelete('payments', `org_id=eq.${TEST_ORG_ID}&provider=eq.nowpayments&provider_payment_id=like.stress_plan_*`)
  // Delete subscriptions (crypto test ones)
  await supabaseDelete('subscriptions', `org_id=eq.${TEST_ORG_ID}&payment_method=eq.crypto`)
  // Delete checkout attempts
  await supabaseDelete('checkout_attempts', `org_id=eq.${TEST_ORG_ID}&provider=eq.nowpayments&plan_name=in.(pro,business)`)
  // Delete webhook events
  await supabaseDelete('webhook_events', `event_id=like.stress_plan_*`)
}

// ============================================================================
// Tests
// ============================================================================

async function testPlanCreation(planName: string, expectedAmountCents: number, expectedPlanId: string) {
  console.log(`\n\x1b[1m  Testing ${planName.toUpperCase()} yearly ($${expectedAmountCents / 100})\x1b[0m`)

  // 1. Create checkout attempt
  const attemptId = await createCheckoutAttempt(planName, expectedAmountCents)
  const paymentId = `stress_plan_${planName}_${Date.now()}`

  // 2. Send "finished" webhook
  const payload = {
    payment_id: paymentId,
    payment_status: 'finished',
    order_id: attemptId,
    pay_amount: 0.015, // BTC amount (doesn't matter for our test)
    pay_currency: 'btc',
    price_amount: expectedAmountCents / 100,
    price_currency: 'usd',
    actually_paid: 0.015,
    outcome_amount: expectedAmountCents / 100,
    outcome_currency: 'usd',
  }

  const res = await sendWebhook(payload)
  assert(res.status === 200, `Webhook returns 200`, `got ${res.status}: ${JSON.stringify(res.body)}`)

  // 3. Wait a beat for DB writes
  await new Promise(r => setTimeout(r, 500))

  // 4. Verify subscription was created
  const subs = await supabaseQuery(
    'subscriptions',
    `org_id=eq.${TEST_ORG_ID}&payment_method=eq.crypto&order=created_at.desc&limit=1`,
  ) as Array<Record<string, unknown>>

  assert(subs.length > 0, `Subscription created for ${planName}`, `found ${subs.length} subscriptions`)

  if (subs.length > 0) {
    const sub = subs[0]
    assert(sub.plan_id === expectedPlanId,
      `Correct plan_id (${planName})`,
      `expected ${expectedPlanId}, got ${sub.plan_id}`)

    assert(sub.status === 'active',
      `Status is active`,
      `got ${sub.status}`)

    assert(sub.billing_period === 'yearly',
      `Billing period is yearly`,
      `got ${sub.billing_period}`)

    assert(sub.payment_method === 'crypto',
      `Payment method is crypto`,
      `got ${sub.payment_method}`)

    // Verify period is ~1 year
    const start = new Date(sub.current_period_start as string)
    const end = new Date(sub.current_period_end as string)
    const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    assert(daysDiff >= 364 && daysDiff <= 366,
      `Period is ~1 year (${daysDiff} days)`,
      `got ${daysDiff} days`)
  }

  // 5. Verify payment record
  const payments = await supabaseQuery(
    'payments',
    `org_id=eq.${TEST_ORG_ID}&provider=eq.nowpayments&provider_payment_id=eq.${paymentId}`,
  ) as Array<Record<string, unknown>>

  assert(payments.length === 1, `Payment record created`, `found ${payments.length}`)

  if (payments.length > 0) {
    const pmt = payments[0]
    assert(pmt.amount === expectedAmountCents,
      `Payment amount correct ($${expectedAmountCents / 100})`,
      `expected ${expectedAmountCents}, got ${pmt.amount}`)

    assert(pmt.currency === 'usd',
      `Payment currency is USD`,
      `got ${pmt.currency}`)

    assert(pmt.status === 'succeeded',
      `Payment status is succeeded`,
      `got ${pmt.status}`)

    assert(pmt.provider === 'nowpayments',
      `Payment provider is nowpayments`,
      `got ${pmt.provider}`)
  }

  // 6. Verify checkout attempt was claimed
  const attempts = await supabaseQuery(
    'checkout_attempts',
    `id=eq.${attemptId}`,
  ) as Array<Record<string, unknown>>

  if (attempts.length > 0) {
    assert(attempts[0].status === 'completed',
      `Checkout attempt marked completed`,
      `got ${attempts[0].status}`)
  }

  return subs[0] as Record<string, unknown> | undefined
}

async function testUpgradeFlow() {
  console.log(`\n\x1b[1m  Testing UPGRADE Pro → Business\x1b[0m`)

  // Get current subscription (should be Pro from previous test)
  const preSubs = await supabaseQuery(
    'subscriptions',
    `org_id=eq.${TEST_ORG_ID}&payment_method=eq.crypto&status=eq.active&order=created_at.desc&limit=1`,
  ) as Array<Record<string, unknown>>

  assert(preSubs.length === 1, `Pre-upgrade: has active Pro subscription`, `found ${preSubs.length}`)

  if (preSubs.length > 0) {
    assert(preSubs[0].plan_id === PRO_PLAN_ID,
      `Pre-upgrade: is Pro plan`,
      `got plan_id ${preSubs[0].plan_id}`)
  }

  // Now pay for Business — should cancel Pro and create Business
  const attemptId = await createCheckoutAttempt('business', 99000)
  const paymentId = `stress_plan_upgrade_${Date.now()}`

  const payload = {
    payment_id: paymentId,
    payment_status: 'finished',
    order_id: attemptId,
    pay_amount: 0.5,
    pay_currency: 'eth',
    price_amount: 990,
    price_currency: 'usd',
    actually_paid: 0.5,
  }

  const res = await sendWebhook(payload)
  assert(res.status === 200, `Upgrade webhook returns 200`, `got ${res.status}`)

  await new Promise(r => setTimeout(r, 500))

  // Verify old Pro subscription was canceled
  const oldSubs = await supabaseQuery(
    'subscriptions',
    `org_id=eq.${TEST_ORG_ID}&payment_method=eq.crypto&status=eq.canceled&order=created_at.desc&limit=1`,
  ) as Array<Record<string, unknown>>

  assert(oldSubs.length >= 1,
    `Old Pro subscription was canceled`,
    `found ${oldSubs.length} canceled subscriptions`)

  // Verify new Business subscription is active
  const newSubs = await supabaseQuery(
    'subscriptions',
    `org_id=eq.${TEST_ORG_ID}&payment_method=eq.crypto&status=eq.active&order=created_at.desc&limit=1`,
  ) as Array<Record<string, unknown>>

  assert(newSubs.length === 1,
    `New Business subscription is active`,
    `found ${newSubs.length}`)

  if (newSubs.length > 0) {
    assert(newSubs[0].plan_id === BUSINESS_PLAN_ID,
      `New subscription is Business plan`,
      `got plan_id ${newSubs[0].plan_id}`)
  }
}

async function testIdempotentPayment() {
  console.log(`\n\x1b[1m  Testing IDEMPOTENCY — same payment doesn't create duplicate subscription\x1b[0m`)

  // Clean first
  await cleanupOrg()

  const attemptId = await createCheckoutAttempt('pro', 29000)
  const paymentId = `stress_plan_idemp_${Date.now()}`

  const payload = {
    payment_id: paymentId,
    payment_status: 'finished',
    order_id: attemptId,
    pay_amount: 0.015,
    pay_currency: 'btc',
    price_amount: 290,
    price_currency: 'usd',
    actually_paid: 0.015,
  }

  // Send same webhook 5 times
  const results = await Promise.all([
    sendWebhook(payload),
    sendWebhook(payload),
    sendWebhook(payload),
    sendWebhook(payload),
    sendWebhook(payload),
  ])

  await new Promise(r => setTimeout(r, 500))

  // Should have exactly 1 active subscription
  const subs = await supabaseQuery(
    'subscriptions',
    `org_id=eq.${TEST_ORG_ID}&payment_method=eq.crypto&status=eq.active`,
  ) as Array<Record<string, unknown>>

  assert(subs.length === 1,
    `Only 1 subscription created from 5 concurrent webhooks`,
    `found ${subs.length}`)

  // Should have exactly 1 payment
  const payments = await supabaseQuery(
    'payments',
    `org_id=eq.${TEST_ORG_ID}&provider=eq.nowpayments&provider_payment_id=eq.${paymentId}`,
  ) as Array<Record<string, unknown>>

  assert(payments.length === 1,
    `Only 1 payment record from 5 concurrent webhooks`,
    `found ${payments.length}`)

  const duplicates = results.filter(r => r.body.duplicate === true).length
  console.log(`    ${duplicates}/5 detected as duplicate`)
}

// ============================================================================
// Plan IDs (fetched at startup)
// ============================================================================

let PRO_PLAN_ID: string
let BUSINESS_PLAN_ID: string

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`\x1b[1m\x1b[36mCrypto Plan Correctness Test\x1b[0m`)
  console.log(`Target: ${WEBHOOK_URL}`)
  console.log(`Org: ${TEST_ORG_ID}`)

  // Verify server
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) })
  } catch {
    console.error(`\n\x1b[31mERROR: Cannot reach ${BASE_URL}\x1b[0m`)
    process.exit(1)
  }

  // Fetch plan IDs
  const plans = await supabaseQuery('plans', 'select=id,name&name=in.(pro,business)') as Array<{ id: string; name: string }>
  PRO_PLAN_ID = plans.find(p => p.name === 'pro')!.id
  BUSINESS_PLAN_ID = plans.find(p => p.name === 'business')!.id
  console.log(`Pro plan:      ${PRO_PLAN_ID}`)
  console.log(`Business plan: ${BUSINESS_PLAN_ID}`)

  try {
    // Clean slate
    await cleanupOrg()

    // Test 1: Pro yearly via crypto
    console.log('\n\x1b[1m1. Plan Creation\x1b[0m')
    await testPlanCreation('pro', 29000, PRO_PLAN_ID)

    // Test 2: Upgrade to Business
    console.log('\n\x1b[1m2. Plan Upgrade\x1b[0m')
    await testUpgradeFlow()

    // Test 3: Idempotency — same payment doesn't create duplicate
    console.log('\n\x1b[1m3. Idempotent Payment\x1b[0m')
    await testIdempotentPayment()

    // Test 4: Clean slate — Business from scratch
    console.log('\n\x1b[1m4. Business Direct\x1b[0m')
    await cleanupOrg()
    await testPlanCreation('business', 99000, BUSINESS_PLAN_ID)

  } finally {
    console.log('\n\x1b[90mCleaning up test data...\x1b[0m')
    await cleanupOrg()
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
  cleanupOrg().finally(() => process.exit(1))
})
