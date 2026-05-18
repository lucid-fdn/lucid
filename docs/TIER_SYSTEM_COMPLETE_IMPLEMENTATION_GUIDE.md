# Tier System - Complete Implementation Guide

## Critical Corrections & Answers

### 1. ❌ Duplicate Signup Page Created (My Mistake!)

**Issue:** Created `src/app/(auth)/signup/page.tsx` without checking existing auth
**Found:** You already have `src/app/login/page.tsx` that handles all authentication!

**Solution:** 
- Delete the duplicate signup page
- Update all signup links to point to `/login` instead
- Your existing login page already has:
  - Wallet authentication
  - Email authentication
  - Google OAuth
  - Auto-redirect to `/dashboard` after auth

**Files to Update:**
```typescript
// src/app/(marketing)/pricing/page.tsx
// Change: href="/signup" 
// To: href="/login"

// src/components/billing/plan-comparison.tsx  
// Change: window.location.href = `/signup?plan=${plan}`
// To: window.location.href = `/login` (or checkout directly)
```

---

## 2. Usage Tracking - Complete Implementation Guide

### Current State
- ✅ Database tables exist (`usage_metrics`)
- ✅ API route exists (`/api/usage`)
- ✅ Functions exist (`getUsageStatus`, `incrementUsageMetric`)
- ❌ **NOT YET TRACKING** - You need to add tracking calls!

### How to Implement Usage Tracking

#### Option A: Manual Tracking (Recommended for MVP)

Track usage at the point where actions occur:

```typescript
// Example 1: Track API calls
// In your API routes:
import { incrementUsageMetric } from '@/lib/db'

export async function POST(request: Request) {
  const { orgId } = await request.json()
  
  // Your API logic here...
  
  // Track the API call
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  
  await incrementUsageMetric(
    orgId,
    'api_calls_monthly',
    1, // increment by 1
    periodStart,
    periodEnd
  )
  
  // Return response
}
```

```typescript
// Example 2: Track Storage Usage
// When user uploads a file:
import { incrementUsageMetric } from '@/lib/db'

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File
  const fileSizeMB = file.size / (1024 * 1024)
  
  // Upload file logic...
  
  // Track storage
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  
  await incrementUsageMetric(
    orgId,
    'storage_gb',
    Math.ceil(fileSizeMB / 1024), // Convert to GB
    periodStart,
    periodEnd
  )
}
```

```typescript
// Example 3: Track AI Queries
// When user makes AI request:
await incrementUsageMetric(
  orgId,
  'ai_queries_monthly',
  1,
  periodStart,
  periodEnd
)
```

#### Option B: Middleware Tracking (More Automated)

```typescript
// middleware.ts or custom middleware
export async function trackUsage(
  orgId: string,
  metricName: string,
  amount: number = 1
) {
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  
  await incrementUsageMetric(orgId, metricName, amount, periodStart, periodEnd)
}

// Then in your API routes:
import { trackUsage } from '@/lib/tracking'

export async function POST(request: Request) {
  // ... your logic ...
  
  await trackUsage(orgId, 'api_calls_monthly')
  
  return response
}
```

#### Option C: Show Demo Data (Quick Solution)

If you want to show the UI working immediately:

```typescript
// In BillingDashboard component
const usage = {
  status: {
    api_calls_monthly: { current: 245, limit: 1000 },
    storage_gb: { current: 0.3, limit: 1 },
    ai_queries_monthly: { current: 12, limit: 100 }
  }
}
```

### Where to Add Tracking

**Identify your billable events:**
1. **API Calls** - Any endpoint that counts as usage
2. **Storage** - File uploads, data storage
3. **AI Queries** - AI agent calls, GPT requests
4. **Team Members** - When adding users (one-time)
5. **Projects** - When creating projects (one-time)

**Add tracking code:**
- After successful operation
- Before returning response
- Handle errors (don't track failed operations)

---

## 3. Invoices & Payments - Data Sources

### Current State
- ✅ Database tables exist (`payments`)
- ✅ API routes ready (`/api/checkout/stripe`, `/api/webhooks/stripe`)
- ❌ **NO PAYMENTS YET** - User hasn't made any payments!

### How Invoices/Payments Get Created

#### Stripe Flow (Credit Cards)
```
1. User clicks "Upgrade to Pro"
2. POST /api/checkout/stripe
   └─> Creates Stripe checkout session
3. User completes payment on Stripe
4. Stripe sends webhook to /api/webhooks/stripe
5. Webhook handler:
   ├─> Creates payment record in database
   ├─> Creates/updates subscription record
   └─> Stores invoice details
```

#### Coinbase Flow (Crypto)
```
1. User selects crypto payment
2. POST /api/checkout/coinbase
   └─> Creates Coinbase charge
3. User sends crypto
4. Coinbase sends webhook
5. Webhook handler:
   ├─> Creates payment record
   ├─> Updates subscription
   └─> Stores transaction hash
```

### Payment Records Structure

```sql
-- payments table stores:
{
  id: uuid,
  subscription_id: uuid,
  org_id: uuid,
  amount: 2900, -- in cents ($29.00)
  currency: 'usd',
  payment_method: 'stripe_card',
  status: 'succeeded',
  provider: 'stripe',
  provider_payment_id: 'pi_xxx', -- Stripe payment ID
  created_at: timestamp
}
```

### Where Data Comes From

**Source:** Stripe/Coinbase webhooks
**Handler:** `/api/webhooks/stripe` or `/api/webhooks/coinbase`
**Stored in:** `payments` table in Supabase

**Why you see "No payments yet":**
- User is on free plan
- No payments have been made
- This is **expected behavior**!

**When you'll see data:**
1. After first successful payment
2. After webhook processes
3. Data appears in billing history

---

## 4. Subscription Data Fetching - Best Practices

### Your Question: Centralized vs Per-Page?

**Industry Standard: Hybrid Approach** ✅

#### Current Implementation (Good!)

```typescript
// Root Layout (Centralized)
app/(studio)/layout.tsx
├─> Fetches user profile
├─> Fetches primary org
└─> Passes to WorkspaceProvider

// WorkspaceProvider (Context)
├─> Stores org data
├─> Stores subscription data
└─> Provides hooks: useSubscription()

// Individual Pages
├─> Use context for basic checks
└─> Fetch additional data if needed
```

#### Best Practice: When to Fetch Where

**✅ Fetch in Root Layout (Your current approach):**
- User profile
- Primary organization
- Basic subscription (plan name, status)
- **Pros:** Available everywhere, single source of truth
- **Cons:** Slight overhead on initial load

**✅ Fetch Per-Page (Add to specific pages):**
- Detailed usage metrics (billing page only)
- Payment history (billing page only)
- Invoices (billing page only)
- **Pros:** Only loaded when needed
- **Cons:** More API calls

**❌ Don't Fetch Per-Page:**
- Basic auth state
- Current plan name
- Feature flags
- **Why:** Causes waterfalls, inconsistency

### Recommendation for Pricing Page

**Current Approach (Your Question):**
```typescript
// src/app/(marketing)/pricing/page.tsx
export default async function PricingPage() {
  const plans = await getPlans()
  const currentPlan = await getCurrentUserPlan() // ← Fetches here
  
  return <PlanComparison plans={plans} currentPlan={currentPlan} />
}
```

**Alternative (Centralized):**
```typescript
// Option A: Use existing context (if available)
'use client'
export default function PricingPage() {
  const { currentPlan } = useSubscription() // From context
  
  return <PlanComparison currentPlan={currentPlan} />
}

// Option B: Hybrid (Recommended)
export default async function PricingPage() {
  const userId = await getUserId()
  const currentPlan = userId ? await getCachedPlan(userId) : null
  // ^ Uses cache, fast!
  
  return <PlanComparison currentPlan={currentPlan} />
}
```

**Industry Standard:**
1. **Auth state & basic info** → Root layout + context
2. **Page-specific data** → Fetch in page
3. **Expensive queries** → Cache aggressively
4. **Real-time data** → Fetch per-page or use webhooks

**For your pricing page:**
- ✅ Fetching per-page is FINE (it's a marketing page, not behind auth)
- ✅ You can't use auth context on marketing pages anyway
- ✅ Server-side fetch is correct approach

---

## 5. Complete Implementation Checklist

### Immediate Fixes Required

- [ ] **Delete duplicate signup page**
  ```bash
  rm src/app/(auth)/signup/page.tsx
  ```

- [ ] **Update pricing page links**
  ```typescript
  // Change /signup to /login
  src/app/(marketing)/pricing/page.tsx
  src/components/billing/plan-comparison.tsx
  ```

### Usage Tracking Implementation

- [ ] **Identify billable events** in your app
- [ ] **Add tracking calls** after each event
- [ ] **Test with real actions**
- [ ] **Verify in database** that metrics increment

### Payment Integration

- [ ] **Add Stripe API keys** to `.env.local`
- [ ] **Configure Stripe webhook** endpoint
- [ ] **Test with Stripe test mode**
- [ ] **Verify payments table** populates

### Data Architecture

- [x] **Centralized auth/subscription** (Already done!)
- [ ] **Per-page billing details** (Add to billing page)
- [ ] **Caching layer** (Optional, add if needed)

---

## 6. Quick Fixes Needed Now

### Fix 1: Remove Duplicate Signup Page

```bash
# Delete the file
rm src/app/(auth)/signup/page.tsx
```

### Fix 2: Update Pricing Page

```typescript
// src/app/(marketing)/pricing/page.tsx
// Line 81-82, Change:
<a href="/signup">Start Free Trial</a>

// To:
<a href="/login">Start Free Trial</a>
```

### Fix 3: Update PlanComparison

```typescript
// src/components/billing/plan-comparison.tsx
// Line 174-180, Change:
if (plan.name === 'enterprise') {
  window.location.href = '/contact'
} else if (plan.name === 'free') {
  window.location.href = '/signup'
} else {
  window.location.href = `/signup?plan=${plan.name}&period=${billingPeriod}`
}

// To:
if (plan.name === 'enterprise') {
  window.location.href = '/contact'
} else {
  // All plans go to login, then dashboard
  window.location.href = '/login'
}
```

---

## 7. Summary

### Your Questions Answered

**Q: Usage tracking - from what source?**
**A:** YOU must implement tracking calls in your code when events happen. Functions exist, you just need to call them!

**Q: Invoices/payments - from what source?**
**A:** From Stripe/Coinbase webhooks after users make payments. No payments yet = no data (expected!).

**Q: Better to fetch subscription in root layout?**
**A:** You're already doing it right! Pricing page is marketing (no auth), so per-page fetch is correct. Billing page uses centralized data.

**Q: Did you check for existing auth pages?**
**A:** My mistake! You have `/login` - I'll remove duplicate signup page and update links.

### What You Need to Do

1. **Delete** `/src/app/(auth)/signup/page.tsx`
2. **Update** links from `/signup` to `/login`
3. **Implement** usage tracking where events occur
4. **Test** with Stripe to see payments populate

### What's Already Working

- ✅ Centralized auth & subscription data
- ✅ Billing page shows org correctly
- ✅ Database schema complete
- ✅ API routes ready
- ✅ Webhook handlers ready
- ✅ UI components complete

---

## Next Steps

See `docs/USAGE_TRACKING_EXAMPLES.md` (creating next) for specific tracking examples in your codebase.
