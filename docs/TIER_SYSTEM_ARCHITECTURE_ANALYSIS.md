# Tier System Architecture Analysis

## 1. Centralized Server-Side Data Fetching ✅

**YES**, we use a centralized, server-side system:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Server-Side (Centralized)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. src/lib/db/index.ts                                     │
│     ├─ getWorkspace(userId, orgId)                         │
│     │  └─ Fetches: org + project + env + subscription      │
│     ├─ getOrgSubscription(orgId)                           │
│     └─ getUsageStatus(orgId)                               │
│                                                              │
│  2. Server Components (RSC)                                 │
│     ├─ app/(studio)/layout.tsx                             │
│     │  └─ Pre-fetches workspace on server                  │
│     └─ app/(studio)/settings/billing/page.tsx              │
│        └─ Fetches subscription on server                   │
│                                                              │
│  3. API Routes (Server)                                     │
│     ├─ /api/subscriptions - Get org subscription           │
│     ├─ /api/usage - Get usage metrics                      │
│     └─ /api/workspace - Get full workspace                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           │
           ├─> Passed as props to Client Components
           │
┌─────────────────────────────────────────────────────────────┐
│ Client-Side (Receives Pre-fetched Data)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. WorkspaceProvider (Context)                             │
│     └─ Receives server-fetched data as props               │
│                                                              │
│  2. useSubscription() Hook                                  │
│     └─ Returns: hasFeature, getLimit, planName, etc.       │
│                                                              │
│  3. UI Components                                           │
│     └─ Read from context (no direct API calls)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Server fetches data first** (in RSC or API route)
2. **Passes to client** via props or API response
3. **Client uses** context/hooks to access data
4. **No client-side DB queries** (secure!)

---

## 2. Current Issues & Fixes Needed

### Issue 1: Billing Date Shows Future Date ❌

**Problem:** Shows "10/10/2026" for free plans  
**Cause:** Migration sets free plans to expire in 1 year:
```sql
current_period_end = NOW() + INTERVAL '1 year'
```

**Fix:** Free plans should not show billing date

### Issue 2: Usage Data Not Real ❌

**Problem:** Usage shows 0 for everything  
**Cause:** No real usage tracking happening yet

**Fix:** Need to actually track usage or show realistic demo data

### Issue 3: Billing History Empty ❌

**Problem:** No invoices/payments shown  
**Cause:** User hasn't made any payments yet (expected for free)

**Fix:** Show appropriate message based on plan

### Issue 4: Pricing Buttons Not Dynamic ❌

**Problem:** All plans show generic "Get Started" or "Upgrade"  
**Cause:** Pricing page doesn't know current user's plan

**Fix:** Fetch user's plan on server, pass to pricing page

### Issue 5: Signup Page 404 ❌

**Problem:** /signup doesn't exist  
**Cause:** Not created yet

**Fix:** Create signup page with Privy integration

---

## 3. Recommended Fixes

### Priority 1: Fix Billing Page Data

**File:** `src/app/(studio)/settings/billing/page.tsx`

```typescript
// Current: workspace has subscription data
// But subscription might not have all fields we expect

// Fix: Enhance getWorkspace to include full subscription
async function getUserWorkspace(userId: string) {
  // ... get org ...
  
  // Get subscription with plan details
  const subscription = await getOrgSubscription(orgId)
  
  // Get usage metrics
  const usage = await getUsageStatus(orgId)
  
  return {
    org,
    project,
    env,
    subscription, // Full subscription data
    usage // Real usage data
  }
}
```

### Priority 2: Make Pricing Dynamic

**File:** `src/app/(marketing)/pricing/page.tsx`

```typescript
// Fetch user's current plan on server
export default async function PricingPage() {
  const userId = await getUserId() // May be null if not logged in
  let currentPlan = null
  
  if (userId) {
    // Get user's org and current plan
    const workspace = await getUserWorkspace(userId)
    currentPlan = workspace?.subscription?.plan_name
  }
  
  return (
    <PlanComparison 
      plans={plans}
      currentPlan={currentPlan} // Pass current plan!
      showCrypto={true}
    />
  )
}
```

### Priority 3: Create Signup Page

**File:** `src/app/(auth)/signup/page.tsx`

```typescript
'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useSearchParams } from 'next/navigation'

export default function SignupPage() {
  const { login } = usePrivy()
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan') // Get plan from URL
  const period = searchParams.get('period')
  
  return (
    <div>
      <h1>Sign Up</h1>
      
      {plan && (
        <div>Selected: {plan} - {period}</div>
      )}
      
      <button onClick={() => login()}>
        Sign Up with Privy
      </button>
    </div>
  )
}
```

### Priority 4: Dynamic Button Logic

**File:** `src/components/billing/plan-comparison.tsx`

```typescript
// In PlanCard rendering:
const getButtonText = () => {
  if (isCurrentPlan) return 'Current Plan'
  if (!currentPlan) return plan.name === 'free' ? 'Get Started' : 'Start Free Trial'
  if (plan.name === 'free') return 'Downgrade'
  if (plan.name === 'enterprise') return 'Contact Sales'
  // User on free, viewing pro
  return 'Upgrade to Pro'
}

const getButtonDisabled = () => {
  // Disable current plan
  if (isCurrentPlan) return true
  // Disable free if logged in (they already have it)
  if (currentPlan && plan.name === 'free') return true
  return false
}
```

---

## 4. UX Recommendations

### Unified Signup Flow ✅

**Recommendation:** Create ONE signup page that works for:
1. Users from navbar "Sign Up" → Show plan selection
2. Users from pricing page → Pre-select plan
3. Users from any other CTA → Show plan selection

**Implementation:**
```
/signup
  ├─ ?plan=pro&period=monthly (from pricing)
  └─ No params (from navbar) → Show plan selector

Flow:
1. User clicks signup
2. Privy auth modal
3. After auth success:
   - If plan selected: redirect to checkout
   - If no plan: redirect to dashboard (free plan)
```

### Billing Page Improvements

1. **Free Plan:**
   - Hide "Next Billing Date"
   - Show "Upgrade to unlock more features"
   - Usage shows limits clearly

2. **Paid Plans:**
   - Show next billing date
   - Show usage with progress bars
   - Show payment history

3. **Usage Tracking:**
   - Either track real usage
   - Or show demo/placeholder data clearly

---

## 5. Summary

### What We Have ✅
- Centralized server-side data fetching
- Database schema with subscriptions
- API routes for data access
- Context system for client-side access

### What Needs Fixing ❌
1. Billing page showing wrong date for free plans
2. Usage data not connected to real metrics
3. Pricing buttons not dynamic
4. Signup page doesn't exist
5. Billing history needs conditional rendering

### Next Steps
1. Fix billing page data display
2. Make pricing page user-aware
3. Create signup page with Privy
4. Add dynamic button logic
5. Connect real usage tracking (or show demo data)

---

## 6. Code Changes Required

### Files to Modify:
1. `src/app/(studio)/settings/billing/page.tsx` - Fix data fetching
2. `src/components/billing/billing-dashboard.tsx` - Fix date display
3. `src/app/(marketing)/pricing/page.tsx` - Add user awareness
4. `src/components/billing/plan-comparison.tsx` - Dynamic buttons
5. `src/app/(auth)/signup/page.tsx` - CREATE NEW

### Estimated Time:
- Fix billing page: 30 min
- Dynamic pricing: 20 min
- Create signup: 45 min
- Testing: 30 min
**Total: ~2 hours**
