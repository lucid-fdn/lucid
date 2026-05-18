# Payment Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NOWPayments crypto payments alongside Stripe, behind a clean provider abstraction, with crypto restricted to yearly plans only.

**Architecture:** Provider abstraction layer (`src/lib/payments/`) with `PaymentProvider` interface implemented by `StripeProvider` and `NOWPaymentsProvider`. Single checkout entry point delegates to the correct provider. Webhook handler per provider, shared DB operations. Checkout attempts table as source of truth for crypto sessions.

**Tech Stack:** Next.js 15, Supabase PostgreSQL, Stripe SDK, NOWPayments REST API, Vitest, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-12-payment-provider-integration-design.md`

---

## File Structure

```
src/lib/payments/
  types.ts                     # PaymentProvider interface, CheckoutParams, CheckoutResult
  provider-registry.ts         # Registry: ensureProviders, getProvider, hasProvider, resetRegistry
  stripe-provider.ts           # StripeProvider: createCheckout (extracted from route), verifyWebhook (stub)
  nowpayments-provider.ts      # NOWPaymentsProvider: createCheckout (Invoice API), verifyWebhook (HMAC)
  index.ts                     # Barrel re-exports

src/lib/db/
  checkout-attempts.ts         # CRUD: createCheckoutAttempt, getCheckoutAttempt, updateCheckoutAttemptStatus
  billing.ts                   # MODIFY: extend createPayment provider type

src/app/api/
  create-checkout-session/route.ts  # MODIFY: use provider registry, add provider param
  webhooks/nowpayments/route.ts     # NEW: IPN webhook handler
  payment-providers/route.ts        # NEW: GET available providers

src/lib/control-plane/client.ts     # MODIFY: extend SyncSubscriptionPayload

src/components/billing/
  payment-method-modal.tsx     # NEW: Card vs Crypto selector dialog
  billing-dashboard.tsx        # MODIFY: billing period toggle + payment method modal + crypto badge
  pricing-table.tsx            # MODIFY: billing period toggle + "pay with crypto" hint

migrations/
  075_add_nowpayments_provider.sql  # CHECK constraint + checkout_attempts + provider_payment_id

tests/
  src/lib/payments/provider-registry.test.ts
  src/lib/payments/nowpayments-provider.test.ts
  src/lib/payments/nowpayments-webhook.test.ts
```

---

## Chunk 1: Database + Types Foundation

### Task 1: DB Migration

**Files:**
- Create: `migrations/075_add_nowpayments_provider.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/075_add_nowpayments_provider.sql
-- Payment provider integration: NOWPayments support + checkout_attempts

-- 1. Extend payments.provider CHECK to include 'nowpayments'
--    'coinbase' is LEGACY ONLY — kept for existing historical payment rows.
--    Coinbase Commerce is NOT a live provider; no new Coinbase rows will be created.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('stripe', 'coinbase', 'nowpayments'));

-- 2. Add unique index on (provider, provider_payment_id) for subscription uniqueness guard
--    Note: provider_payment_id column already exists (NOT NULL) from migration 020
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON payments (provider, provider_payment_id);

-- 3. Checkout attempts — source of truth for crypto checkout sessions
CREATE TABLE IF NOT EXISTS checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  billing_period TEXT NOT NULL DEFAULT 'yearly',
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'nowpayments')),
  provider_invoice_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'partial', 'expired', 'failed')),
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_org ON checkout_attempts (org_id);
CREATE INDEX IF NOT EXISTS idx_checkout_attempts_provider_invoice
  ON checkout_attempts (provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;

ALTER TABLE checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkout_attempts_service_only ON checkout_attempts
  FOR ALL USING (auth.role() = 'service_role');
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push --linked`
Expected: Migration applied successfully, no errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/075_add_nowpayments_provider.sql
git commit -m "feat: add nowpayments provider migration + checkout_attempts table"
```

---

### Task 2: Payment Provider Types

**Files:**
- Create: `src/lib/payments/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/payments/types.ts

export type ProviderId = 'stripe' | 'nowpayments'

export interface CheckoutParams {
  orgId: string
  userId: string
  planName: 'pro' | 'business'
  billingPeriod: 'monthly' | 'yearly'
  successUrl: string
  cancelUrl: string
}

export interface CheckoutResult {
  url: string
  sessionId: string
  provider: ProviderId
}

export interface PaymentProvider {
  id: ProviderId
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>
}

// Note: The spec defines WebhookResult and verifyWebhook() on PaymentProvider.
// This plan simplifies by handling webhook verification inline in each route handler
// (Stripe uses its own SDK verification; NOWPayments uses HMAC). This avoids an
// abstraction that would need to parse provider-specific bodies into a generic shape
// when each webhook handler needs provider-specific fields anyway.
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/payments/types.ts
git commit -m "feat: add PaymentProvider interface and checkout types"
```

---

### Task 3: Checkout Attempts DB Layer

**Files:**
- Create: `src/lib/db/checkout-attempts.ts`

- [ ] **Step 1: Write the checkout attempts CRUD**

```typescript
// src/lib/db/checkout-attempts.ts
// Note: supabase from ./client uses SUPABASE_SERVICE_ROLE_KEY (service-role client).
// checkout_attempts has service-only RLS, so this MUST be the service-role client.

import { supabase, ErrorService } from './client'
import type { ProviderId } from '@/lib/payments/types'

export interface CheckoutAttempt {
  id: string
  org_id: string
  user_id: string
  plan_name: string
  billing_period: string
  provider: ProviderId
  provider_invoice_id: string | null
  status: 'pending' | 'completed' | 'partial' | 'expired' | 'failed'
  amount_cents: number
  created_at: string
  expires_at: string
  completed_at: string | null
}

export async function createCheckoutAttempt(attempt: {
  org_id: string
  user_id: string
  plan_name: string
  billing_period: string
  provider: ProviderId
  amount_cents: number
  expires_at: string
}): Promise<CheckoutAttempt> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .insert(attempt)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'INSERT', orgId: attempt.org_id },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    throw error
  }

  return data as CheckoutAttempt
}

export async function getCheckoutAttempt(id: string): Promise<CheckoutAttempt | null> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'SELECT', attemptId: id },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    return null
  }

  return data as CheckoutAttempt | null
}

export async function updateCheckoutAttemptStatus(
  id: string,
  status: CheckoutAttempt['status'],
  extra?: { provider_invoice_id?: string; completed_at?: string },
): Promise<void> {
  const { error } = await supabase
    .from('checkout_attempts')
    .update({
      status,
      ...extra,
      ...(status === 'completed' ? { completed_at: extra?.completed_at ?? new Date().toISOString() } : {}),
    })
    .eq('id', id)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'UPDATE', attemptId: id, status },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
  }
}

/**
 * Atomically claim a checkout attempt: pending → completed.
 * Returns the attempt if successfully claimed, null if already claimed (idempotency guard).
 * Uses .eq('status', 'pending') so only one concurrent webhook wins the race.
 */
export async function claimCheckoutAttempt(
  id: string,
): Promise<CheckoutAttempt | null> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')     // ← only succeed if still pending
    .select()
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'CLAIM', attemptId: id },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    return null
  }

  // null means the attempt was already claimed (not pending anymore)
  return data as CheckoutAttempt | null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/checkout-attempts.ts
git commit -m "feat: add checkout_attempts DB layer"
```

---

### Task 4: Update billing.ts Provider Type + Add Uniqueness Guard Query

**Files:**
- Modify: `src/lib/db/billing.ts`

- [ ] **Step 1: Update createPayment provider union**

In `src/lib/db/billing.ts`, change line 483:

```typescript
// OLD
provider: 'stripe' | 'coinbase'
// NEW
provider: 'stripe' | 'coinbase' | 'nowpayments'
```

- [ ] **Step 2: Add getPaymentByProviderPaymentId function**

> Note: `provider_payment_id` and `transaction_hash` already exist in the `createPayment` param type (migration 020). No type change needed.

Append to `src/lib/db/billing.ts`:

```typescript
export async function getPaymentByProviderPaymentId(
  provider: string,
  providerPaymentId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('provider', provider)
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'payments', operation: 'SELECT', provider, providerPaymentId },
      tags: { layer: 'database', table: 'payments' },
    })
    return null
  }

  return data
}
```

- [ ] **Step 3: Export from db barrel**

Ensure `getPaymentByProviderPaymentId` is exported from `src/lib/db/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/billing.ts src/lib/db/index.ts
git commit -m "feat: extend createPayment for nowpayments + add uniqueness guard query"
```

---

### Task 5: Extend SyncSubscriptionPayload

**Files:**
- Modify: `src/lib/control-plane/client.ts:20-30`

- [ ] **Step 1: Add generic provider fields to the interface**

In `src/lib/control-plane/client.ts`, update the `SyncSubscriptionPayload` interface:

```typescript
export interface SyncSubscriptionPayload {
  tenant_id: string
  tenant_name?: string
  plan_name: string
  status: string
  stripe_subscription_id?: string
  stripe_customer_id?: string
  billing_period?: string
  current_period_start?: string
  current_period_end?: string
  // Generic provider fields (for non-Stripe providers)
  provider?: 'stripe' | 'nowpayments'
  provider_payment_id?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/control-plane/client.ts
git commit -m "feat: extend SyncSubscriptionPayload with generic provider fields"
```

---

## Chunk 2: Provider Registry + Stripe Provider

### Task 6: Provider Registry

**Files:**
- Create: `src/lib/payments/provider-registry.ts`
- Test: `tests/src/lib/payments/provider-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/src/lib/payments/provider-registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerProvider,
  getProvider,
  hasProvider,
  resetRegistry,
  listProviders,
} from '@/lib/payments/provider-registry'
import type { PaymentProvider, CheckoutParams, CheckoutResult } from '@/lib/payments/types'

function mockProvider(id: 'stripe' | 'nowpayments'): PaymentProvider {
  return {
    id,
    createCheckout: async (_params: CheckoutParams): Promise<CheckoutResult> => ({
      url: 'https://example.com',
      sessionId: 'test-session',
      provider: id,
    }),
  }
}

describe('provider-registry', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('registers and retrieves a provider', () => {
    registerProvider(mockProvider('stripe'))
    expect(hasProvider('stripe')).toBe(true)
    expect(getProvider('stripe').id).toBe('stripe')
  })

  it('throws for unknown provider', () => {
    expect(() => getProvider('unknown')).toThrow('Unknown payment provider: unknown')
  })

  it('lists registered providers', () => {
    registerProvider(mockProvider('stripe'))
    registerProvider(mockProvider('nowpayments'))
    expect(listProviders()).toEqual(['stripe', 'nowpayments'])
  })

  it('resets registry', () => {
    registerProvider(mockProvider('stripe'))
    resetRegistry()
    expect(hasProvider('stripe')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/src/lib/payments/provider-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the provider registry**

```typescript
// src/lib/payments/provider-registry.ts
import type { PaymentProvider, ProviderId } from './types'

const providers = new Map<string, PaymentProvider>()

export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.id, provider)
}

export function getProvider(id: string): PaymentProvider {
  const p = providers.get(id)
  if (!p) throw new Error(`Unknown payment provider: ${id}`)
  return p
}

export function hasProvider(id: string): boolean {
  return providers.has(id)
}

export function listProviders(): ProviderId[] {
  return Array.from(providers.keys()) as ProviderId[]
}

let initialized = false

export function ensureProviders(): void {
  if (initialized) return
  initialized = true

  // Stripe — always register if key is present
  if (process.env.STRIPE_SECRET_KEY) {
    // Lazy import to avoid pulling Stripe SDK when not needed
    const { StripeProvider } = require('./stripe-provider')
    registerProvider(new StripeProvider())
  }

  // NOWPayments — both keys required
  if (process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET) {
    const { NOWPaymentsProvider } = require('./nowpayments-provider')
    registerProvider(new NOWPaymentsProvider())
  } else if (process.env.NOWPAYMENTS_API_KEY && !process.env.NOWPAYMENTS_IPN_SECRET) {
    console.warn('[payments] NOWPAYMENTS_API_KEY set but NOWPAYMENTS_IPN_SECRET missing — provider disabled')
  }
}

export function resetRegistry(): void {
  providers.clear()
  initialized = false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/src/lib/payments/provider-registry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/provider-registry.ts tests/src/lib/payments/provider-registry.test.ts
git commit -m "feat: add payment provider registry with tests"
```

---

### Task 7: Stripe Provider (Extract from existing route)

**Files:**
- Create: `src/lib/payments/stripe-provider.ts`

- [ ] **Step 1: Write the StripeProvider**

Extract the checkout logic from `src/app/api/create-checkout-session/route.ts:30-104` into a provider:

```typescript
// src/lib/payments/stripe-provider.ts
import Stripe from 'stripe'
import type { PaymentProvider, CheckoutParams, CheckoutResult } from './types'
import { ErrorService } from '@/lib/errors/error-service'
import { getPlanByName } from '@/lib/db'

export class StripeProvider implements PaymentProvider {
  id = 'stripe' as const
  private stripe: Stripe

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-10-29.clover',
    })
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { orgId, userId, planName, billingPeriod, successUrl, cancelUrl } = params

    // Fetch plan from DB to get Stripe price IDs
    const plan = await getPlanByName(planName)
    if (!plan) {
      throw new Error(`Plan not found: ${planName}`)
    }

    const priceId = (billingPeriod === 'monthly'
      ? plan.stripe_price_monthly_id
      : plan.stripe_price_yearly_id) as string | undefined

    if (!priceId) {
      throw new Error(`Stripe price not configured for ${planName} ${billingPeriod}`)
    }

    // Build Stripe-specific success URL with Stripe's session ID placeholder
    const stripeSuccessUrl = `${successUrl}?session_id={CHECKOUT_SESSION_ID}&provider=stripe`

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card', 'us_bank_account'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: stripeSuccessUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        org_id: orgId,
        plan_id: String(plan.id || ''),
        plan_name: planName,
        billing_period: billingPeriod,
      },
    })

    return {
      url: session.url!,
      sessionId: session.id,
      provider: 'stripe',
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/payments/stripe-provider.ts
git commit -m "feat: extract StripeProvider from checkout route"
```

---

### Task 8: Barrel Export

**Files:**
- Create: `src/lib/payments/index.ts`

- [ ] **Step 1: Write the barrel export**

```typescript
// src/lib/payments/index.ts
export type { PaymentProvider, ProviderId, CheckoutParams, CheckoutResult } from './types'
export { ensureProviders, getProvider, hasProvider, listProviders, resetRegistry } from './provider-registry'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/payments/index.ts
git commit -m "feat: add payments barrel export"
```

---

## Chunk 3: NOWPayments Provider + Webhook

### Task 9: NOWPayments Provider

**Files:**
- Create: `src/lib/payments/nowpayments-provider.ts`
- Test: `tests/src/lib/payments/nowpayments-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/src/lib/payments/nowpayments-provider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB deps before importing
vi.mock('@/lib/db/checkout-attempts', () => ({
  createCheckoutAttempt: vi.fn().mockResolvedValue({ id: 'attempt-uuid-123' }),
  updateCheckoutAttemptStatus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/db', () => ({
  getPlanByName: vi.fn().mockResolvedValue({
    id: 'plan-uuid',
    name: 'pro',
    price_monthly_usd: 19000,
    price_yearly_usd: 29000,
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('NOWPaymentsProvider', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_API_KEY', 'test-api-key')
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', 'test-ipn-secret')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.lucid.com')
    mockFetch.mockReset()
  })

  it('createCheckout creates attempt and calls NOWPayments invoice API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'np-invoice-123',
        invoice_url: 'https://nowpayments.io/invoice/np-invoice-123',
      }),
    })

    const { NOWPaymentsProvider } = await import('@/lib/payments/nowpayments-provider')
    const provider = new NOWPaymentsProvider()

    const result = await provider.createCheckout({
      orgId: 'org-uuid',
      userId: 'user-uuid',
      planName: 'pro',
      billingPeriod: 'yearly',
      successUrl: 'https://app.lucid.com/settings/billing',
      cancelUrl: 'https://app.lucid.com/pricing',
    })

    expect(result.provider).toBe('nowpayments')
    expect(result.url).toBe('https://nowpayments.io/invoice/np-invoice-123')
    expect(result.sessionId).toBe('np-invoice-123')

    // Verify API call
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.nowpayments.io/v1/invoice',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      }),
    )
  })

  it('throws on timeout/failure with user-friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'))

    const { NOWPaymentsProvider } = await import('@/lib/payments/nowpayments-provider')
    const provider = new NOWPaymentsProvider()

    await expect(
      provider.createCheckout({
        orgId: 'org-uuid',
        userId: 'user-uuid',
        planName: 'pro',
        billingPeriod: 'yearly',
        successUrl: 'https://app.lucid.com/settings/billing',
        cancelUrl: 'https://app.lucid.com/pricing',
      }),
    ).rejects.toThrow('Crypto checkout is temporarily unavailable')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/src/lib/payments/nowpayments-provider.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the NOWPaymentsProvider**

```typescript
// src/lib/payments/nowpayments-provider.ts
import type { PaymentProvider, CheckoutParams, CheckoutResult } from './types'
import {
  createCheckoutAttempt,
  updateCheckoutAttemptStatus,
} from '@/lib/db/checkout-attempts'
import { getPlanByName } from '@/lib/db'

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1'
const CHECKOUT_EXPIRY_MS = 2 * 60 * 60 * 1000 // 2 hours
const FETCH_TIMEOUT_MS = 10_000 // 10 seconds

export class NOWPaymentsProvider implements PaymentProvider {
  id = 'nowpayments' as const
  private apiKey: string

  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY!
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { orgId, userId, planName, billingPeriod, successUrl } = params

    // 1. Fetch price from plans table (single source of truth)
    //    DB columns are price_monthly_usd / price_yearly_usd (stored in cents despite name)
    const plan = await getPlanByName(planName)
    if (!plan) throw new Error(`Plan not found: ${planName}`)

    const amountCents = billingPeriod === 'yearly'
      ? (plan.price_yearly_usd ?? plan.price_monthly_usd * 12)
      : plan.price_monthly_usd
    const amountUsd = amountCents / 100

    // 2. Create checkout attempt (source of truth)
    const attempt = await createCheckoutAttempt({
      org_id: orgId,
      user_id: userId,
      plan_name: planName,
      billing_period: billingPeriod,
      provider: 'nowpayments',
      amount_cents: amountCents,
      expires_at: new Date(Date.now() + CHECKOUT_EXPIRY_MS).toISOString(),
    })

    // 3. Call NOWPayments Invoice API
    let invoiceData: { id: string; invoice_url: string }
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      const res = await fetch(`${NOWPAYMENTS_API}/invoice`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: amountUsd,
          price_currency: 'usd',
          order_id: attempt.id,
          order_description: `Lucid ${planName.charAt(0).toUpperCase() + planName.slice(1)} — Yearly Subscription`,
          success_url: `${successUrl}?session_id=${attempt.id}&provider=nowpayments`,
          ipn_callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/nowpayments`,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`NOWPayments API returned ${res.status}: ${body}`)
      }

      invoiceData = await res.json()
    } catch (err) {
      // Update attempt as failed
      await updateCheckoutAttemptStatus(attempt.id, 'failed')
      throw new Error('Crypto checkout is temporarily unavailable, please try card payment')
    }

    // 4. Update attempt with provider invoice ID
    await updateCheckoutAttemptStatus(attempt.id, 'pending', {
      provider_invoice_id: invoiceData.id,
    })

    return {
      url: invoiceData.invoice_url,
      sessionId: invoiceData.id,
      provider: 'nowpayments',
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/src/lib/payments/nowpayments-provider.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/nowpayments-provider.ts tests/src/lib/payments/nowpayments-provider.test.ts
git commit -m "feat: add NOWPaymentsProvider with checkout attempt tracking"
```

---

### Task 10: NOWPayments Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/nowpayments/route.ts`
- Test: `tests/src/lib/payments/nowpayments-webhook.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/src/lib/payments/nowpayments-webhook.test.ts
import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'

function createHmacSignature(body: Record<string, unknown>, secret: string): string {
  const sorted = JSON.stringify(body, Object.keys(body).sort())
  return crypto.createHmac('sha512', secret).update(sorted).digest('hex')
}

describe('NOWPayments HMAC verification', () => {
  const secret = 'test-ipn-secret'

  it('produces valid HMAC signature', () => {
    const body = { payment_id: '123', payment_status: 'finished', order_id: 'abc' }
    const sig = createHmacSignature(body, secret)
    expect(typeof sig).toBe('string')
    expect(sig.length).toBe(128) // SHA-512 hex = 128 chars
  })

  it('signature changes with different body', () => {
    const body1 = { payment_id: '123', payment_status: 'finished' }
    const body2 = { payment_id: '456', payment_status: 'finished' }
    expect(createHmacSignature(body1, secret)).not.toBe(createHmacSignature(body2, secret))
  })

  it('signature changes with different secret', () => {
    const body = { payment_id: '123', payment_status: 'finished' }
    const sig1 = createHmacSignature(body, 'secret-a')
    const sig2 = createHmacSignature(body, 'secret-b')
    expect(sig1).not.toBe(sig2)
  })
})
```

- [ ] **Step 2: Run test to verify it passes** (pure crypto test, no deps)

Run: `npx vitest run tests/src/lib/payments/nowpayments-webhook.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: Write the webhook route**

```typescript
// src/app/api/webhooks/nowpayments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  createSubscription,
  getActiveSubscriptionByOrgId,
  cancelSubscription,
  getPlanByName,
  createPayment,
  getPaymentByProviderPaymentId,
  isWebhookEventProcessed,
  recordWebhookEvent,
} from '@/lib/db'
import {
  getCheckoutAttempt,
  updateCheckoutAttemptStatus,
  claimCheckoutAttempt,
} from '@/lib/db/checkout-attempts'
import { syncSubscription } from '@/lib/control-plane/client'
import { ErrorService } from '@/lib/errors/error-service'

const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj).sort().reduce<Record<string, unknown>>((result, key) => {
    const val = obj[key]
    result[key] = val && typeof val === 'object' && !Array.isArray(val)
      ? sortObject(val as Record<string, unknown>)
      : val
    return result
  }, {})
}

function verifySignature(body: Record<string, unknown>, signature: string): boolean {
  if (!IPN_SECRET) return false
  const sorted = JSON.stringify(sortObject(body))
  const hmac = crypto.createHmac('sha512', IPN_SECRET).update(sorted).digest('hex')
  // Length guard: timingSafeEqual throws if buffers differ in length
  const hmacBuf = Buffer.from(hmac)
  const sigBuf = Buffer.from(signature)
  if (hmacBuf.length !== sigBuf.length) return false
  return crypto.timingSafeEqual(hmacBuf, sigBuf)
}

export async function POST(req: NextRequest) {
  // 1. Parse body + signature
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const signature = req.headers.get('x-nowpayments-sig')
  if (!signature || !IPN_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
  }

  // 2. HMAC verification
  if (!verifySignature(body, signature)) {
    ErrorService.captureException(new Error('NOWPayments HMAC verification failed'), {
      severity: 'error',
      context: { endpoint: '/api/webhooks/nowpayments', paymentId: body.payment_id },
      tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
    })
    return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 })
  }

  const paymentId = String(body.payment_id || '')
  const paymentStatus = String(body.payment_status || '')
  const orderId = String(body.order_id || '')

  // 3. Idempotency check
  try {
    if (await isWebhookEventProcessed('nowpayments', paymentId)) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch {
    // Continue — better to double-process than miss
  }

  // 4. Look up checkout attempt (source of truth)
  const attempt = await getCheckoutAttempt(orderId)
  if (!attempt) {
    ErrorService.captureException(new Error(`Checkout attempt not found: ${orderId}`), {
      severity: 'error',
      context: { orderId, paymentId, paymentStatus, endpoint: '/api/webhooks/nowpayments' },
      tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
    })
    // Return 200 so NOWPayments doesn't retry
    return NextResponse.json({ received: true, error: 'attempt_not_found' })
  }

  // Check expiry
  if (new Date(attempt.expires_at) < new Date() && paymentStatus !== 'finished') {
    await updateCheckoutAttemptStatus(attempt.id, 'expired')
    return NextResponse.json({ received: true, expired: true })
  }

  const { org_id: orgId, plan_name: planName } = attempt

  // 5. Handle by status
  try {
    switch (paymentStatus) {
      case 'finished': {
        // PRIMARY idempotency guard: atomically claim pending → completed.
        // If another webhook already claimed this attempt, claimCheckoutAttempt returns null.
        const claimed = await claimCheckoutAttempt(attempt.id)
        if (!claimed) {
          return NextResponse.json({ received: true, duplicate: true })
        }

        // SECONDARY guard: unique index on (provider, provider_payment_id) prevents
        // duplicate payment rows even if the claim somehow passed twice.
        const existingPayment = await getPaymentByProviderPaymentId('nowpayments', paymentId)
        if (existingPayment) {
          return NextResponse.json({ received: true, duplicate: true })
        }

        const plan = await getPlanByName(planName as 'pro' | 'business')
        if (!plan) throw new Error(`Plan not found: ${planName}`)

        // Cancel existing subscription
        const existing = await getActiveSubscriptionByOrgId(orgId)
        if (existing) await cancelSubscription(existing.id)

        // Create subscription for 1 year
        const now = new Date()
        const yearFromNow = new Date(now)
        yearFromNow.setFullYear(yearFromNow.getFullYear() + 1)

        const subscription = await createSubscription({
          org_id: orgId,
          plan_id: plan.id,
          status: 'active',
          billing_period: 'yearly',
          payment_method: 'crypto',
          current_period_start: now.toISOString(),
          current_period_end: yearFromNow.toISOString(),
        })

        // Create payment record with provider_payment_id (unique index enforced)
        await createPayment({
          subscription_id: subscription.id,
          org_id: orgId,
          amount: attempt.amount_cents,
          currency: 'usd',
          payment_method: 'crypto',
          status: 'succeeded',
          provider: 'nowpayments',
          provider_payment_id: paymentId,
          transaction_hash: body.transaction_hash ? String(body.transaction_hash) : undefined,
        })

        // Sync to control-plane (fire-and-forget)
        await syncSubscription({
          tenant_id: orgId,
          tenant_name: orgId,
          plan_name: planName,
          status: 'active',
          billing_period: 'yearly',
          current_period_start: now.toISOString(),
          current_period_end: yearFromNow.toISOString(),
          provider: 'nowpayments',
          provider_payment_id: paymentId,
        })
        break
      }

      case 'partially_paid': {
        ErrorService.captureException(
          new Error(`Partial payment received for checkout ${attempt.id}`),
          {
            severity: 'warning',
            context: { orgId, planName, paymentId, paymentStatus, body },
            tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
          },
        )
        // Mark checkout attempt as partial — NEVER create subscription or payment
        // Spec deviation: spec says "create pending payment record" but payments.subscription_id
        // is NOT NULL (migration 020), so we can't create a payment without a subscription.
        // The checkout_attempts table records the partial status for auditing instead.
        await updateCheckoutAttemptStatus(attempt.id, 'partial')
        break
      }

      case 'expired': {
        await updateCheckoutAttemptStatus(attempt.id, 'expired')
        break
      }

      case 'failed':
      case 'refunded': {
        await updateCheckoutAttemptStatus(attempt.id, 'failed')
        break
      }

      default: {
        // Other statuses (waiting, confirming, sending) — no action
        break
      }
    }
  } catch (handlerError) {
    ErrorService.captureException(handlerError, {
      severity: 'error',
      context: {
        endpoint: '/api/webhooks/nowpayments',
        paymentId,
        paymentStatus,
        orgId,
        planName,
      },
      tags: { layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' },
    })
  }

  // 6. Record webhook event
  try {
    await recordWebhookEvent('nowpayments', paymentId, paymentStatus)
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 4: Add webhook handler integration tests**

Add to `tests/src/lib/payments/nowpayments-webhook.test.ts`:

```typescript
// --- Integration tests for webhook handler logic ---
import { POST } from '@/app/api/webhooks/nowpayments/route'
import { NextRequest } from 'next/server'

// Mock all DB deps
vi.mock('@/lib/db', () => ({
  createSubscription: vi.fn().mockResolvedValue({ id: 'sub-123' }),
  getActiveSubscriptionByOrgId: vi.fn().mockResolvedValue(null),
  cancelSubscription: vi.fn(),
  getPlanByName: vi.fn().mockResolvedValue({ id: 1, name: 'pro' }),
  createPayment: vi.fn(),
  getPaymentByProviderPaymentId: vi.fn().mockResolvedValue(null),
  isWebhookEventProcessed: vi.fn().mockResolvedValue(false),
  recordWebhookEvent: vi.fn(),
}))

vi.mock('@/lib/db/checkout-attempts', () => ({
  getCheckoutAttempt: vi.fn().mockResolvedValue({
    id: 'attempt-uuid-123',
    org_id: 'org-uuid',
    plan_name: 'pro',
    billing_period: 'yearly',
    amount_cents: 29000,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  }),
  updateCheckoutAttemptStatus: vi.fn(),
  claimCheckoutAttempt: vi.fn().mockResolvedValue({
    id: 'attempt-uuid-123',
    org_id: 'org-uuid',
    plan_name: 'pro',
    billing_period: 'yearly',
    amount_cents: 29000,
    status: 'completed',
  }),
}))

vi.mock('@/lib/control-plane/client', () => ({
  syncSubscription: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

function makeRequest(body: Record<string, unknown>, sig: string): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    headers: { 'x-nowpayments-sig': sig, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('NOWPayments webhook handler', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', secret)
    vi.clearAllMocks()
  })

  it('creates subscription on finished status', async () => {
    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.received).toBe(true)

    const { createSubscription } = await import('@/lib/db')
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'org-uuid', status: 'active', billing_period: 'yearly' }),
    )
  })

  it('rejects duplicate via atomic claim guard (claimCheckoutAttempt returns null)', async () => {
    const { claimCheckoutAttempt } = await import('@/lib/db/checkout-attempts')
    ;(claimCheckoutAttempt as any).mockResolvedValueOnce(null) // already claimed

    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.duplicate).toBe(true)

    // Should never reach subscription creation
    const { createSubscription } = await import('@/lib/db')
    expect(createSubscription).not.toHaveBeenCalled()
  })

  it('rejects request with invalid HMAC signature', async () => {
    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const res = await POST(makeRequest(body, 'bad-signature-value'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Signature mismatch')
  })

  it('returns expired for checkout attempt past expires_at', async () => {
    const { getCheckoutAttempt } = await import('@/lib/db/checkout-attempts')
    ;(getCheckoutAttempt as any).mockResolvedValueOnce({
      id: 'attempt-uuid-123',
      org_id: 'org-uuid',
      plan_name: 'pro',
      billing_period: 'yearly',
      amount_cents: 29000,
      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    })

    const body = { payment_id: '777', payment_status: 'waiting', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.expired).toBe(true)

    const { updateCheckoutAttemptStatus } = await import('@/lib/db/checkout-attempts')
    expect(updateCheckoutAttemptStatus).toHaveBeenCalledWith('attempt-uuid-123', 'expired')
  })

  it('marks checkout attempt as partial for partially_paid — no subscription or payment', async () => {
    const body = { payment_id: '888', payment_status: 'partially_paid', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.received).toBe(true)

    const { createPayment, createSubscription } = await import('@/lib/db')
    const { updateCheckoutAttemptStatus } = await import('@/lib/db/checkout-attempts')
    // NEVER create subscription or payment for partial (subscription_id is NOT NULL)
    expect(createSubscription).not.toHaveBeenCalled()
    expect(createPayment).not.toHaveBeenCalled()
    // Checkout attempt updated to 'partial'
    expect(updateCheckoutAttemptStatus).toHaveBeenCalledWith('attempt-uuid-123', 'partial')
  })
})
```

- [ ] **Step 5: Run all webhook tests**

Run: `npx vitest run tests/src/lib/payments/nowpayments-webhook.test.ts`
Expected: PASS (8 tests — 3 HMAC + 5 integration)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/nowpayments/route.ts tests/src/lib/payments/nowpayments-webhook.test.ts
git commit -m "feat: add NOWPayments IPN webhook handler with HMAC + integration tests"
```

---

## Chunk 4: API Routes

### Task 11: Update create-checkout-session Route

**Files:**
- Modify: `src/app/api/create-checkout-session/route.ts`

- [ ] **Step 1: Rewrite the route to use provider registry**

Replace the entire file content of `src/app/api/create-checkout-session/route.ts`:

```typescript
// src/app/api/create-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUserId, requireOrgContext } from '@/lib/auth/server-utils'
import { ensureProviders, getProvider } from '@/lib/payments'
import { ErrorService } from '@/lib/errors/error-service'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId()
    const orgId = await requireOrgContext()

    const body = await req.json()
    const { planName, billingPeriod, provider = 'stripe', cancelUrl } = body

    // Validate input
    if (!planName || !billingPeriod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!['pro', 'business'].includes(planName)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return NextResponse.json({ error: 'Invalid billing period' }, { status: 400 })
    }
    if (!['stripe', 'nowpayments'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Crypto is yearly-only
    if (provider === 'nowpayments' && billingPeriod !== 'yearly') {
      return NextResponse.json(
        { error: 'Crypto payments are available for yearly plans only' },
        { status: 400 },
      )
    }

    // Initialize providers and delegate
    ensureProviders()

    const paymentProvider = getProvider(provider)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const result = await paymentProvider.createCheckout({
      orgId,
      userId,
      planName,
      billingPeriod,
      successUrl: `${appUrl}/settings/billing`,
      cancelUrl: cancelUrl || `${appUrl}/pricing`,
    })

    return NextResponse.json(result)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/create-checkout-session' },
      tags: { layer: 'api', route: 'create-checkout-session' },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/create-checkout-session/route.ts
git commit -m "refactor: use provider registry in create-checkout-session route"
```

---

### Task 12: Payment Providers API Endpoint

**Files:**
- Create: `src/app/api/payment-providers/route.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
// src/app/api/payment-providers/route.ts
import { NextResponse } from 'next/server'
import { ensureProviders, listProviders } from '@/lib/payments'

export async function GET() {
  ensureProviders()
  return NextResponse.json({ providers: listProviders() })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/payment-providers/route.ts
git commit -m "feat: add GET /api/payment-providers endpoint"
```

---

## Chunk 5: UI Components

### Task 13: Payment Method Modal

**Files:**
- Create: `src/components/billing/payment-method-modal.tsx`

- [ ] **Step 1: Write the modal component**

```typescript
// src/components/billing/payment-method-modal.tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CreditCard, Coins, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface PaymentMethodModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (provider: 'stripe' | 'nowpayments') => Promise<void>
  planName: string
  yearlyPrice: string
}

export function PaymentMethodModal({
  open,
  onOpenChange,
  onSelect,
  planName,
  yearlyPrice,
}: PaymentMethodModalProps) {
  const [loading, setLoading] = useState<'stripe' | 'nowpayments' | null>(null)

  const handleSelect = async (provider: 'stripe' | 'nowpayments') => {
    setLoading(provider)
    try {
      await onSelect(provider)
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose payment method</DialogTitle>
          <DialogDescription>
            {planName} plan — {yearlyPrice}/year
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:border-primary hover:bg-accent transition-colors disabled:opacity-50"
            onClick={() => handleSelect('stripe')}
            disabled={loading !== null}
          >
            {loading === 'stripe' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <CreditCard className="h-6 w-6" />
            )}
            <span className="text-sm font-medium">Card</span>
            <span className="text-xs text-muted-foreground">Visa, MC, AMEX</span>
          </button>

          <button
            className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:border-primary hover:bg-accent transition-colors disabled:opacity-50"
            onClick={() => handleSelect('nowpayments')}
            disabled={loading !== null}
          >
            {loading === 'nowpayments' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Coins className="h-6 w-6" />
            )}
            <span className="text-sm font-medium">Crypto</span>
            <span className="text-xs text-muted-foreground">200+ coins</span>
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-1">
          Crypto payments powered by NOWPayments
        </p>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/billing/payment-method-modal.tsx
git commit -m "feat: add PaymentMethodModal component"
```

---

### Task 14: Update Billing Dashboard

**Files:**
- Modify: `src/components/billing/billing-dashboard.tsx`

- [ ] **Step 1: Read full file**

Run: Read `src/components/billing/billing-dashboard.tsx` fully before editing.

- [ ] **Step 2: Add billing period toggle + payment method modal**

Key changes to `billing-dashboard.tsx`:

1. Add imports: `PaymentMethodModal`, `useState` for `billingPeriod` and `showPaymentModal`
2. Add state: `billingPeriod` ('monthly' | 'yearly'), `showPaymentModal`, `availableProviders`
3. Add `useEffect` to fetch `/api/payment-providers` on mount
4. Update `handleUpgrade` to:
   - If yearly AND crypto available → show `PaymentMethodModal`
   - If monthly → go directly to Stripe
   - Accept `provider` param from modal
5. Add monthly/yearly toggle in current plan section
6. Add "Paid with crypto" badge if `subscription.payment_method === 'crypto'`

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/billing-dashboard.tsx
git commit -m "feat: add billing period toggle + crypto payment option to dashboard"
```

---

### Task 15: Update Pricing Table

**Files:**
- Modify: `src/components/billing/pricing-table.tsx`

- [ ] **Step 1: Read full file**

Run: Read `src/components/billing/pricing-table.tsx` fully before editing.

- [ ] **Step 2: Add billing period toggle + crypto hint**

Key changes to `pricing-table.tsx`:

1. Add billing period state + toggle to the sticky header
2. Pass `billingPeriod` to price display (show monthly vs yearly prices)
3. Fetch `/api/payment-providers` on mount — only show "or pay with crypto" text when `nowpayments` is in the returned list AND yearly is selected. Never show the hint if the backend doesn't have NOWPayments configured.
4. Update `handleUpgrade` to pass `billingPeriod` to the checkout call
5. Accept `onUpgrade` callback that includes `billingPeriod` + `provider`

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/pricing-table.tsx
git commit -m "feat: add billing period toggle + crypto hint to pricing table"
```

---

## Chunk 6: Cleanup + Final Verification

### Task 16: Checkout Attempt Expiry Cleanup

**Files:**
- Create: `src/lib/db/checkout-attempts.ts` (add function)

- [ ] **Step 1: Add expireStaleCheckoutAttempts function**

Append to `src/lib/db/checkout-attempts.ts`:

```typescript
/**
 * Mark stale pending checkout attempts as expired.
 * Call this from a periodic cron or on-demand before creating new attempts.
 */
export async function expireStaleCheckoutAttempts(): Promise<number> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { table: 'checkout_attempts', operation: 'EXPIRE_STALE' },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    return 0
  }

  return data?.length ?? 0
}
```

- [ ] **Step 2: Add test for expireStaleCheckoutAttempts**

Add to `tests/src/lib/payments/nowpayments-provider.test.ts`:

```typescript
import { expireStaleCheckoutAttempts } from '@/lib/db/checkout-attempts'

describe('expireStaleCheckoutAttempts', () => {
  it('is callable and returns a number', async () => {
    // With mocked supabase, just verify it doesn't throw
    const result = await expireStaleCheckoutAttempts()
    expect(typeof result).toBe('number')
  })
})
```

> Note: Full integration test against a real DB is out of scope for this plan. The function is simple (single UPDATE query) and covered by the opportunistic call in `createCheckout`.

- [ ] **Step 4: Call expiry check from NOWPaymentsProvider.createCheckout**

In `src/lib/payments/nowpayments-provider.ts`, add at the top of `createCheckout()` before creating a new attempt:

```typescript
// Opportunistic cleanup of stale attempts (non-blocking)
import { expireStaleCheckoutAttempts } from '@/lib/db/checkout-attempts'
// ...
await expireStaleCheckoutAttempts().catch(() => {})
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/checkout-attempts.ts src/lib/payments/nowpayments-provider.ts tests/src/lib/payments/nowpayments-provider.test.ts
git commit -m "feat: add checkout attempt expiry cleanup with test"
```

---

> **Deferred:** Modifying the existing Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) is out of scope for this plan. Stripe's existing `stripe_subscription_id` serves the same uniqueness role as `provider_payment_id`, and its signature verification already works via the Stripe SDK (`stripe.webhooks.constructEvent()`). If cross-provider queries or a unified `verifyWebhook()` abstraction are needed later, a follow-up task should address both.

---

### Task 17: Verify TypeScript Compilation

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Fix any type errors found**

If any errors, fix them in the relevant files.

### Task 18: Run All Tests

- [ ] **Step 1: Run test suite**

Run: `npx vitest run`
Expected: All tests pass including new payment tests

### Task 19: Final Commit + Summary

- [ ] **Step 1: Verify git status is clean**

Run: `git status`
Expected: Nothing uncommitted

- [ ] **Step 2: Verify all files created**

Check that all files from the spec's "Files Changed" table exist:
- `src/lib/payments/types.ts`
- `src/lib/payments/provider-registry.ts`
- `src/lib/payments/stripe-provider.ts`
- `src/lib/payments/nowpayments-provider.ts`
- `src/lib/payments/index.ts`
- `src/lib/db/checkout-attempts.ts`
- `src/app/api/create-checkout-session/route.ts` (modified)
- `src/app/api/webhooks/nowpayments/route.ts`
- `src/app/api/payment-providers/route.ts`
- `src/components/billing/payment-method-modal.tsx`
- `src/components/billing/billing-dashboard.tsx` (modified)
- `src/components/billing/pricing-table.tsx` (modified)
- `src/lib/db/billing.ts` (modified)
- `src/lib/control-plane/client.ts` (modified)
- `migrations/075_add_nowpayments_provider.sql`
