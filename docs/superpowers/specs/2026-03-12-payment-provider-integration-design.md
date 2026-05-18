# Payment Provider Integration: NOWPayments + Provider Abstraction

**Date:** 2026-03-12
**Status:** Approved

## Problem

The Lucid SaaS billing system is tightly coupled to Stripe with no provider abstraction. Users can only pay with cards. Adding crypto payments requires a clean provider abstraction so that Stripe and NOWPayments (and future providers) coexist without entanglement.

## Constraints

- **Crypto payments are yearly-only** — no recurring crypto billing complexity
- **Stripe remains primary** — cards for monthly + yearly, unchanged
- **NOWPayments** — crypto for yearly plans only, 200+ coins, 0.5% fee
- **Minimal DB changes** — one migration to extend `payments.provider` CHECK constraint (keeps `'coinbase'` for legacy rows) + new `checkout_attempts` table
- **Single checkout entry point** — consolidate into `/api/create-checkout-session`

## Architecture

### Provider Abstraction Layer

```
src/lib/payments/
  ├── types.ts                  # PaymentProvider interface + shared types
  ├── provider-registry.ts      # Registry: get provider by id
  ├── stripe-provider.ts        # Stripe implementation (extracted from existing code)
  ├── nowpayments-provider.ts   # NOWPayments implementation (new)
  └── index.ts                  # Public API re-exports
```

### PaymentProvider Interface

```typescript
interface CheckoutParams {
  orgId: string
  userId: string
  planName: 'pro' | 'business'
  billingPeriod: 'monthly' | 'yearly'
  successUrl: string
  cancelUrl: string
}

interface CheckoutResult {
  url: string          // redirect URL (Stripe Checkout or NOWPayments invoice)
  sessionId: string    // provider-specific session/invoice ID
  provider: 'stripe' | 'nowpayments'
}

interface WebhookResult {
  event: string        // normalized event type
  orgId: string
  planName: string
  billingPeriod: string
  providerPaymentId: string
  status: 'succeeded' | 'failed'
  transactionHash?: string  // crypto only
}

interface PaymentProvider {
  id: 'stripe' | 'nowpayments'
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>
  verifyWebhook(req: Request): Promise<WebhookResult>
}
```

### StripeProvider

Extracted from existing `/api/create-checkout-session` and `/api/webhooks/stripe`:

- `createCheckout()` — creates Stripe Checkout Session (mode: subscription), returns Stripe URL
- `verifyWebhook()` — verifies signature via `stripe.webhooks.constructEvent()`, normalizes event
- Supports monthly + yearly billing periods
- Payment methods: card, us_bank_account

### NOWPaymentsProvider

New provider using NOWPayments Invoice API:

- `createCheckout()`:
  1. Insert a `checkout_attempts` record with `{ orgId, planName, billingPeriod, provider: 'nowpayments', status: 'pending', expires_at: now+2h }`
  2. Call `POST https://api.nowpayments.io/v1/invoice` with:
     - `price_amount`: plan yearly price in USD (DB stores cents, divide by 100 — e.g. DB `29000` → API `290` for Pro yearly)
     - `price_currency`: "usd"
     - `order_id`: `checkout_attempt.id` (UUID — the lookup key, NOT the source of truth for orgId/planName)
     - `order_description`: "Lucid {Plan} — Yearly Subscription"
     - `success_url`: redirect back to `/settings/billing?session_id={invoice_id}&provider=nowpayments`
     - `ipn_callback_url`: `{APP_URL}/api/webhooks/nowpayments`
  3. Update checkout_attempt with `provider_invoice_id` from response
  4. Return NOWPayments `invoice_url` for redirect
  - **Timeout**: 10s fetch timeout; on failure return user-friendly error: "Crypto checkout is temporarily unavailable, please try card payment"
- `verifyWebhook()` — HMAC SHA-512 verification using IPN secret key:
  - Sort POST body keys
  - `JSON.stringify` sorted object
  - Compare HMAC with `x-nowpayments-sig` header
  - Status mapping:
    - `finished` → `status: "succeeded"` (verify against checkout_attempt, create subscription + payment)
    - `partially_paid` → log warning + update checkout_attempt status to `partial`. **Never create a subscription.** Create a `pending` payment record for manual resolution only
    - `expired` → update checkout_attempt status to `expired`, record in `webhook_events`
    - `failed` / `refunded` → `status: "failed"`, update checkout_attempt, record in `webhook_events`
  - **Idempotency key**: use `payment_id` from IPN body as `event_id` in `webhook_events` table
  - **Subscription uniqueness guard**: before creating subscription, verify no active subscription already exists with the same `provider_payment_id` (prevents duplicate subscriptions from repeated `finished` webhooks for the same invoice)
- **Yearly only** — enforced at checkout route level (400 if monthly + crypto)

### Provider Registry

```typescript
const providers = new Map<string, PaymentProvider>()

export function registerProvider(provider: PaymentProvider) {
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

// Lazy initialization — called once on first use, not at module level
let initialized = false
export function ensureProviders() {
  if (initialized) return
  initialized = true
  if (process.env.STRIPE_SECRET_KEY) registerProvider(new StripeProvider())
  if (process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET) {
    registerProvider(new NOWPaymentsProvider())
  } else if (process.env.NOWPAYMENTS_API_KEY && !process.env.NOWPAYMENTS_IPN_SECRET) {
    console.warn('[payments] NOWPAYMENTS_API_KEY set but NOWPAYMENTS_IPN_SECRET missing — provider disabled')
  }
}

// For test isolation
export function resetRegistry() {
  providers.clear()
  initialized = false
}
```

**Call sites:** `ensureProviders()` must be called at the top of:
- `POST /api/create-checkout-session`
- `GET /api/payment-providers`

**Startup validation:** NOWPayments provider only registers when **both** `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` are set. If only the API key is present, logs a warning and does not register (prevents exposing a checkout path that can't complete safely).

## API Changes

### Updated: `POST /api/create-checkout-session`

Add `provider` field to request body:

```typescript
// Request
{
  planName: 'pro' | 'business',
  billingPeriod: 'monthly' | 'yearly',
  provider: 'stripe' | 'nowpayments',  // NEW — defaults to 'stripe'
  cancelUrl?: string
}

// Validation
if (provider === 'nowpayments' && billingPeriod !== 'yearly') {
  return 400: "Crypto payments are available for yearly plans only"
}
```

Calls `ensureProviders()` first, then delegates to `getProvider(provider).createCheckout(params)`.

### New: `POST /api/webhooks/nowpayments`

```typescript
export async function POST(req: NextRequest) {
  // 1. Read raw body + x-nowpayments-sig header
  // 2. HMAC SHA-512 verify with IPN secret
  // 3. Check idempotency: use `payment_id` from body as event_id
  //    in webhook_events (provider='nowpayments', event_id=payment_id)
  // 4. Look up checkout_attempt by order_id (= checkout_attempt.id)
  //    → This is the source of truth for orgId, planName, billingPeriod
  //    → If not found or expired, log error + return 200 (don't retry)
  // 5. Switch on payment_status:
  //    'finished':
  //      a. Verify no active subscription already exists with this provider_payment_id
  //      b. Cancel existing subscription if any
  //      c. const subscription = await createSubscription({
  //           org_id: attempt.orgId, plan: attempt.planName,
  //           status: 'active', billing_period: 'yearly',
  //           payment_method: 'crypto', period = now → now+1year })
  //      d. await createPayment({
  //           subscription_id: subscription.id,  // ← use returned ID
  //           provider: 'nowpayments',
  //           provider_payment_id: body.payment_id,
  //           transaction_hash: body.transaction_hash || null })
  //      e. Update checkout_attempt status to 'completed'
  //      f. Sync to Control-Plane (pass provider='nowpayments', omit stripe_* fields)
  //    'partially_paid':
  //      a. Log warning with full IPN body for support reconciliation
  //      b. Update checkout_attempt status to 'partial'
  //      c. NEVER create subscription — only a pending payment record for manual resolution
  //    'expired':
  //      a. Update checkout_attempt status to 'expired'
  //    'failed' | 'refunded':
  //      a. Update checkout_attempt status accordingly
  // 6. Record webhook event (provider='nowpayments', event_id=payment_id)
  //    Tag with: { orgId, planName, payment_status, amount, currency } for support
  // 7. Return 200
}
```

### Deleted

- `POST /api/checkout/stripe` — dead stub
- `POST /api/checkout/coinbase` — dead stub
- `POST /api/webhooks/coinbase/route.ts` — Coinbase Commerce webhook (superseded by NOWPayments)

## UI Changes

### Billing Dashboard / Plan Upgrade Flow

When user clicks "Upgrade" on a yearly plan, show a payment method selector **before** redirecting:

```
┌──────────────────────────────────────┐
│  Choose payment method               │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │   💳 Card    │  │  🪙 Crypto   │  │
│  │              │  │              │  │
│  │ Visa, MC,    │  │ 200+ coins   │  │
│  │ AMEX, PayPal │  │ SOL, ETH,    │  │
│  │              │  │ BTC, USDC... │  │
│  └──────────────┘  └──────────────┘  │
│                                      │
│  Powered by NOWPayments  ·  0.5% fee │
└──────────────────────────────────────┘
```

**Implementation:** New `PaymentMethodModal` component in `src/components/billing/`:

- Only shown when `billingPeriod === 'yearly'`
- Monthly plans skip the modal → go directly to Stripe
- On card click → `createCheckout({ provider: 'stripe' })`
- On crypto click → `createCheckout({ provider: 'nowpayments' })`
- Feature-gated: UI shows crypto option only when `cryptoPayments` flag is true AND `/api/payment-providers` confirms NOWPayments is available (prevents showing button before env vars are configured)

### Billing Period Toggle

The current `billing-dashboard.tsx` and `pricing-table.tsx` both hardcode `billingPeriod: 'monthly'`. This work includes adding a monthly/yearly toggle (the feature flags `monthlySubscriptions`, `yearlySubscriptions`, `billingPeriodToggle` already exist and default to `true`).

- Add billing period state + toggle to `billing-dashboard.tsx` upgrade flow
- Add billing period state + toggle to `pricing-table.tsx`
- When yearly is selected AND `cryptoPayments` is available → show `PaymentMethodModal`
- When monthly is selected → go directly to Stripe

### New: `GET /api/payment-providers`

Returns available providers (based on which env vars are configured):

```typescript
// Response
{ providers: ['stripe', 'nowpayments'] }  // or just ['stripe'] if no NOWPAYMENTS_API_KEY
```

Used by UI to conditionally show crypto option.

### Pricing Table / Plan Card

- Yearly toggle: show "or pay with crypto" subtitle under yearly price
- No changes to monthly display

### Billing Dashboard — Current Plan Card

- If `payment_method === 'crypto'`, show "Paid with crypto" badge
- Show renewal date (subscription `current_period_end`)
- Near expiry (30 days before): show "Renew" button that opens same crypto checkout flow

## Subscription Lifecycle (Crypto)

```
1. User selects yearly plan → picks crypto
2. POST /api/create-checkout-session { provider: 'nowpayments', billingPeriod: 'yearly' }
3. Server creates checkout_attempt record (source of truth for orgId/planName)
4. Server creates NOWPayments invoice with order_id = checkout_attempt.id → returns invoice_url
5. User redirected to NOWPayments hosted page
6. User picks coin (SOL/ETH/BTC/USDC/...) and pays
7. NOWPayments confirms on-chain → IPN webhook fires
8. POST /api/webhooks/nowpayments
   → verify HMAC → check idempotency → look up checkout_attempt by order_id
   → verify no duplicate subscription → create subscription + payment record
   → update checkout_attempt status to 'completed'
9. Subscription active for 1 year
10. 30 days before expiry: show renewal prompt in billing dashboard
11. User clicks "Renew" → same flow (new attempt, new invoice, new payment)

Abandoned checkout expiry:
- checkout_attempts have expires_at = now+2h
- A periodic cleanup (or lazy check) marks expired attempts
- Expired attempts are ignored if a webhook arrives late
```

## Env Vars

```bash
# New
NOWPAYMENTS_API_KEY=          # From NOWPayments dashboard
NOWPAYMENTS_IPN_SECRET=       # For webhook HMAC verification

# Existing (unchanged)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=          # Used for success_url and ipn_callback_url
```

## DB Migration

```sql
-- Migration: 075_add_nowpayments_provider.sql

-- 1. Extend payments.provider CHECK to include 'nowpayments'
--    Keeps 'coinbase' for historical payment rows (no Coinbase rows will be created going forward)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('stripe', 'coinbase', 'nowpayments'));

-- 2. Add provider_payment_id column to payments for uniqueness guard
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

-- 3. Checkout attempts table — source of truth for crypto checkout sessions
CREATE TABLE IF NOT EXISTS checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  billing_period TEXT NOT NULL DEFAULT 'yearly',
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'nowpayments')),
  provider_invoice_id TEXT,          -- NOWPayments invoice_id or Stripe session_id
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'partial', 'expired', 'failed')),
  amount_cents INTEGER NOT NULL,     -- price in cents at time of checkout
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,   -- 2h for NOWPayments, session TTL for Stripe
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_org ON checkout_attempts (org_id);
CREATE INDEX IF NOT EXISTS idx_checkout_attempts_provider_invoice
  ON checkout_attempts (provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;

-- RLS: service role only (webhook handlers + checkout route)
ALTER TABLE checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkout_attempts_service_only ON checkout_attempts
  FOR ALL USING (auth.role() = 'service_role');
```

## Type Changes

In `src/lib/db/billing.ts`, update the `createPayment` provider type:
```typescript
provider: 'stripe' | 'coinbase' | 'nowpayments'  // was: 'stripe' | 'coinbase'
```

In `src/lib/control-plane/client.ts`, extend `SyncSubscriptionPayload`:
```typescript
interface SyncSubscriptionPayload {
  // existing stripe fields (optional for crypto)
  stripe_subscription_id?: string
  stripe_customer_id?: string
  // new generic fields
  provider?: 'stripe' | 'nowpayments'
  provider_payment_id?: string
  // ... rest unchanged
}
```

## Feature Flags

- `cryptoPayments` (existing, defaults `true`) — gates the crypto option in UI
- `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` both required — gates server-side provider registration + `/api/payment-providers` response

## Testing Strategy

- Unit tests for `NOWPaymentsProvider.createCheckout()` (mock HTTP)
- Unit tests for `NOWPaymentsProvider.verifyWebhook()` (HMAC verification with known secrets)
- Unit tests for provider registry (register, get, missing provider)
- Integration test for webhook handler (mock IPN payload → verify checkout_attempt lookup → subscription created)
- Integration test for duplicate webhook (same payment_id → verify no duplicate subscription)
- Integration test for partially_paid (verify NO subscription created, only pending payment record)
- Manual E2E: NOWPayments sandbox environment for test payments

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/lib/payments/types.ts` | Create | Provider interface + shared types |
| `src/lib/payments/provider-registry.ts` | Create | Registry with auto-registration |
| `src/lib/payments/stripe-provider.ts` | Create | Extract Stripe logic from existing routes |
| `src/lib/payments/nowpayments-provider.ts` | Create | NOWPayments Invoice API integration |
| `src/lib/payments/index.ts` | Create | Public re-exports |
| `src/app/api/create-checkout-session/route.ts` | Modify | Use provider registry, add `provider` param |
| `src/app/api/webhooks/nowpayments/route.ts` | Create | IPN webhook handler |
| `src/app/api/webhooks/stripe/route.ts` | Modify | Use StripeProvider.verifyWebhook() |
| `src/components/billing/payment-method-modal.tsx` | Create | Card vs Crypto selector |
| `src/components/billing/billing-dashboard.tsx` | Modify | Integrate payment method modal + crypto badge |
| `src/components/billing/pricing-table.tsx` | Modify | "or pay with crypto" hint on yearly |
| `src/lib/db/billing.ts` | Modify | Extend provider union type to include `'nowpayments'` |
| `src/lib/control-plane/client.ts` | Modify | Extend SyncSubscriptionPayload with generic provider fields |
| `src/app/api/payment-providers/route.ts` | Create | GET endpoint returning available providers |
| `src/lib/db/checkout-attempts.ts` | Create | CRUD for checkout_attempts table |
| `migrations/075_add_nowpayments_provider.sql` | Create | Extend payments.provider CHECK + checkout_attempts table + provider_payment_id column |
| `src/app/api/checkout/stripe/route.ts` | Delete | Dead stub |
| `src/app/api/checkout/coinbase/route.ts` | Delete | Dead stub |
| `src/app/api/webhooks/coinbase/route.ts` | Delete | Superseded by NOWPayments |

## Observability

All webhook failures logged via `ErrorService.captureException()` with metadata for support reconciliation:
- `orgId`, `planName`, `payment_status`, `amount`, `currency`, `payment_id`, `invoice_id`
- Tagged: `{ layer: 'api', route: 'nowpayments-webhook', provider: 'nowpayments' }`
- Partial payments get `severity: 'warning'` (not error) since they require manual intervention

## Out of Scope

- Recurring crypto billing (monthly) — yearly only for now
- NOWPayments Custody / auto-conversion to fiat
- Refunds via crypto (handle manually)
- Multi-currency display (prices stay in USD, user picks coin at NOWPayments checkout)
- Stripe Billing Portal integration
