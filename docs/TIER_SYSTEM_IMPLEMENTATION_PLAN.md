# Tier System Implementation Plan

## Overview

Enterprise-grade tier/pricing system with:
- ✅ Privy authentication (existing)
- ✅ Multi-payment support (Crypto, Credit Card, PayPal)
- ✅ Usage-based limits
- ✅ Feature flags per tier
- ✅ Self-serve upgrades
- ✅ Scalable architecture

---

## 1. Payment Architecture

### Payment Methods Support

#### Option A: Unified Payment Gateway (Recommended)
**Provider:** Stripe + Coinbase Commerce

| Method | Provider | Integration | Notes |
|--------|----------|-------------|-------|
| Credit Card | Stripe | Stripe Checkout | Industry standard |
| PayPal | Stripe | Stripe + PayPal | Native Stripe integration |
| Crypto | Coinbase Commerce | Webhook-based | USDC, ETH, BTC support |

**Pros:**
- Stripe handles credit card + PayPal natively
- Coinbase Commerce for crypto subscriptions
- Unified subscription management
- Battle-tested at scale

**Cons:**
- Two payment providers to integrate
- Need to sync subscription states

#### Option B: Crypto-Native with Fiat Bridge
**Provider:** Unlock Protocol + Stripe

| Method | Provider | Integration | Notes |
|--------|----------|-------------|-------|
| Crypto | Unlock Protocol | Smart contracts | On-chain subscriptions |
| Credit Card | Unlock + Stripe | Credit card checkout → crypto | Fiat to crypto bridge |
| PayPal | Stripe | Standard integration | Falls back to Stripe |

**Pros:**
- On-chain subscription proof
- Web3-native experience
- Automatic NFT membership passes

**Cons:**
- More complex architecture
- Gas fees for users
- Limited PayPal integration

#### Option C: Hybrid Multi-Provider
**Providers:** Stripe + Crypto.com Pay + PayPal Direct

**Not Recommended:** Too many integrations, complex state management

---

## 2. Recommended Architecture: Stripe + Coinbase Commerce

### Why This Stack?

1. **Stripe** - Best-in-class for credit card + PayPal
   - Handles subscriptions, invoicing, billing
   - Built-in PayPal support
   - Webhooks for all events
   - Customer portal for self-service

2. **Coinbase Commerce** - Crypto payments at scale
   - Supports USDC, ETH, BTC, and more
   - No gas fees for users (pay to address)
   - Webhooks for payment events
   - Merchant dashboard

3. **Unified State** - Single source of truth in your DB
   - All subscriptions stored in your database
   - Payment method is just a field
   - Webhooks sync state from both providers
   - Your API is the orchestration layer

---

## 3. Database Schema

```sql
-- ============================================================================
-- Plans (Tiers)
-- ============================================================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Plan details
  name TEXT NOT NULL UNIQUE, -- 'free', 'pro', 'enterprise'
  display_name TEXT NOT NULL, -- 'Free', 'Professional', 'Enterprise'
  description TEXT,
  
  -- Pricing (in cents for fiat)
  price_monthly_usd INTEGER, -- in cents (e.g., 2900 = $29)
  price_yearly_usd INTEGER, -- in cents (e.g., 29000 = $290)
  price_monthly_crypto TEXT, -- in USDC (e.g., '29.00')
  price_yearly_crypto TEXT, -- in USDC (e.g., '290.00')
  
  -- Features & Limits
  features JSONB NOT NULL DEFAULT '{}', -- { "ai_agents": true, "custom_domain": true }
  limits JSONB NOT NULL DEFAULT '{}', -- { "api_calls": 10000, "storage_gb": 100 }
  
  -- Payment provider IDs
  stripe_product_id TEXT,
  stripe_price_monthly_id TEXT,
  stripe_price_yearly_id TEXT,
  coinbase_product_id TEXT, -- If using Coinbase Commerce products
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Subscriptions (Org-level)
-- ============================================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  
  -- Subscription details
  status TEXT NOT NULL CHECK (status IN (
    'active', 'trialing', 'past_due', 'canceled', 'paused'
  )),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  payment_method TEXT NOT NULL CHECK (payment_method IN (
    'stripe_card', 'stripe_paypal', 'crypto'
  )),
  
  -- Period tracking
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  
  -- Payment provider IDs (nullable - only one will be set)
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  coinbase_charge_id TEXT,
  crypto_wallet_address TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(org_id, status) WHERE status = 'active' -- Only one active sub per org
);

-- ============================================================================
-- Payment History
-- ============================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Payment details
  amount INTEGER NOT NULL, -- in cents
  currency TEXT NOT NULL DEFAULT 'usd', -- 'usd', 'usdc', 'eth'
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'succeeded', 'failed', 'refunded'
  )),
  
  -- Provider details
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'coinbase')),
  provider_payment_id TEXT NOT NULL,
  provider_customer_id TEXT,
  
  -- Blockchain details (for crypto)
  transaction_hash TEXT,
  block_number BIGINT,
  wallet_address TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Usage Tracking
-- ============================================================================
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_name TEXT NOT NULL, -- 'api_calls', 'storage_mb', 'active_users'
  metric_value INTEGER NOT NULL DEFAULT 0,
  
  -- Period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one metric per org per period
  UNIQUE(org_id, metric_name, period_start, period_end)
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_subscriptions_org_id ON subscriptions(org_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_org_id ON payments(org_id);
CREATE INDEX idx_payments_provider_payment_id ON payments(provider_payment_id);
CREATE INDEX idx_usage_metrics_org_id ON usage_metrics(org_id);
CREATE INDEX idx_usage_metrics_period ON usage_metrics(period_start, period_end);

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view their org's subscription
CREATE POLICY "Users can view org subscription"
  ON subscriptions FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Only org admins can modify subscriptions
CREATE POLICY "Admins can modify org subscription"
  ON subscriptions FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Similar policies for payments and usage_metrics...

-- ============================================================================
-- Triggers
-- ============================================================================
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed Data: Plans
-- ============================================================================
INSERT INTO plans (name, display_name, description, price_monthly_usd, price_yearly_usd, price_monthly_crypto, price_yearly_crypto, features, limits, sort_order) VALUES
(
  'free',
  'Free',
  'Perfect for getting started',
  0,
  0,
  '0',
  '0',
  '{
    "ai_agents": false,
    "custom_functions": false,
    "analytics": false,
    "api_access": false,
    "custom_domain": false,
    "priority_support": false
  }'::jsonb,
  '{
    "api_calls_monthly": 1000,
    "storage_gb": 1,
    "projects": 1,
    "team_members": 1,
    "ai_queries_monthly": 100
  }'::jsonb,
  1
),
(
  'pro',
  'Professional',
  'For power users and small teams',
  2900, -- $29/mo
  29000, -- $290/yr (save $58)
  '29.00',
  '290.00',
  '{
    "ai_agents": true,
    "custom_functions": true,
    "analytics": true,
    "api_access": true,
    "custom_domain": false,
    "priority_support": true
  }'::jsonb,
  '{
    "api_calls_monthly": 100000,
    "storage_gb": 50,
    "projects": 10,
    "team_members": 5,
    "ai_queries_monthly": 10000
  }'::jsonb,
  2
),
(
  'enterprise',
  'Enterprise',
  'For large organizations',
  NULL, -- Contact sales
  NULL,
  NULL,
  NULL,
  '{
    "ai_agents": true,
    "custom_functions": true,
    "analytics": true,
    "api_access": true,
    "custom_domain": true,
    "priority_support": true,
    "sla": true,
    "dedicated_support": true,
    "custom_contracts": true
  }'::jsonb,
  '{
    "api_calls_monthly": -1,
    "storage_gb": -1,
    "projects": -1,
    "team_members": -1,
    "ai_queries_monthly": -1
  }'::jsonb,
  3
);
```

---

## 4. Centralized Access Layer

### File: `src/lib/plans/index.ts`

```typescript
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface Plan {
  id: string
  name: 'free' | 'pro' | 'enterprise'
  display_name: string
  description: string | null
  price_monthly_usd: number | null
  price_yearly_usd: number | null
  price_monthly_crypto: string | null
  price_yearly_crypto: string | null
  features: Record<string, boolean>
  limits: Record<string, number>
  is_active: boolean
  sort_order: number
}

export interface Subscription {
  id: string
  org_id: string
  plan_id: string
  plan: Plan
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
  billing_period: 'monthly' | 'yearly'
  payment_method: 'stripe_card' | 'stripe_paypal' | 'crypto'
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
}

// Cache for request deduplication
export const getPlans = cache(async (): Promise<Plan[]> => {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  
  if (error) throw error
  return data as Plan[]
})

export const getOrgSubscription = cache(async (orgId: string): Promise<Subscription | null> => {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:plans(*)
    `)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data as Subscription | null
})

// Feature access check
export function hasFeature(subscription: Subscription | null, feature: string): boolean {
  if (!subscription) return false
  return subscription.plan.features[feature] === true
}

// Limit check
export async function checkLimit(
  orgId: string,
  metric: string
): Promise<{ current: number; limit: number; allowed: boolean }> {
  const subscription = await getOrgSubscription(orgId)
  
  if (!subscription) {
    return { current: 0, limit: 0, allowed: false }
  }
  
  const limit = subscription.plan.limits[metric]
  
  // -1 means unlimited
  if (limit === -1) {
    return { current: 0, limit: -1, allowed: true }
  }
  
  const current = await getCurrentUsage(orgId, metric)
  
  return {
    current,
    limit,
    allowed: current < limit
  }
}

async function getCurrentUsage(orgId: string, metric: string): Promise<number> {
  const supabase = createClient()
  
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  const { data } = await supabase
    .from('usage_metrics')
    .select('metric_value')
    .eq('org_id', orgId)
    .eq('metric_name', metric)
    .gte('period_start', periodStart.toISOString())
    .lte('period_end', periodEnd.toISOString())
    .single()
  
  return data?.metric_value || 0
}

// Increment usage
export async function incrementUsage(
  orgId: string,
  metric: string,
  amount: number = 1
): Promise<void> {
  const supabase = createClient()
  
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  await supabase.rpc('increment_usage_metric', {
    p_org_id: orgId,
    p_metric_name: metric,
    p_amount: amount,
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString()
  })
}
```

---

## 5. Integration with Privy

### Privy + Subscription State

```typescript
// src/contexts/subscription-context.tsx
'use client'

import React from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWorkspace } from './workspace-context'
import { getOrgSubscription, hasFeature, checkLimit } from '@/lib/plans'

interface SubscriptionContextValue {
  subscription: Subscription | null
  loading: boolean
  hasFeature: (feature: string) => boolean
  checkLimit: (metric: string) => Promise<{ current: number; limit: number; allowed: boolean }>
  refresh: () => Promise<void>
}

const SubscriptionContext = React.createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { authenticated } = usePrivy()
  const { workspace } = useWorkspace()
  const [subscription, setSubscription] = React.useState<Subscription | null>(null)
  const [loading, setLoading] = React.useState(true)
  
  const refresh = React.useCallback(async () => {
    if (!authenticated || !workspace?.org?.id) {
      setSubscription(null)
      setLoading(false)
      return
    }
    
    try {
      const sub = await getOrgSubscription(workspace.org.id)
      setSubscription(sub)
    } catch (error) {
      console.error('Failed to fetch subscription:', error)
    } finally {
      setLoading(false)
    }
  }, [authenticated, workspace?.org?.id])
  
  React.useEffect(() => {
    refresh()
  }, [refresh])
  
  const contextValue: SubscriptionContextValue = {
    subscription,
    loading,
    hasFeature: (feature) => hasFeature(subscription, feature),
    checkLimit: (metric) => checkLimit(workspace?.org?.id || '', metric),
    refresh
  }
  
  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = React.useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider')
  }
  return context
}
```

---

## 6. Payment Flow Implementation

### Stripe Credit Card + PayPal

```typescript
// src/app/api/checkout/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

export async function POST(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { planId, billingPeriod, orgId, paymentMethod } = await request.json()
  
  // Get plan details
  const plan = await getPlan(planId)
  
  // Create or get Stripe customer
  const customer = await getOrCreateStripeCustomer(orgId, userId)
  
  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    payment_method_types: paymentMethod === 'paypal' ? ['card', 'paypal'] : ['card'],
    line_items: [{
      price: billingPeriod === 'monthly' 
        ? plan.stripe_price_monthly_id 
        : plan.stripe_price_yearly_id,
      quantity: 1
    }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
    metadata: {
      orgId,
      planId,
      billingPeriod
    }
  })
  
  return NextResponse.json({ sessionId: session.id, url: session.url })
}
```

### Crypto Payment (Coinbase Commerce)

```typescript
// src/app/api/checkout/crypto/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { Client } from 'coinbase-commerce-node'

const coinbase = Client.init(process.env.COINBASE_COMMERCE_API_KEY!)

export async function POST(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { planId, billingPeriod, orgId } = await request.json()
  
  const plan = await getPlan(planId)
  const amount = billingPeriod === 'monthly' 
    ? plan.price_monthly_crypto 
    : plan.price_yearly_crypto
  
  // Create charge
  const charge = await coinbase.resources.Charge.create({
    name: `${plan.display_name} - ${billingPeriod}`,
    description: `Subscription to ${plan.display_name} plan`,
    pricing_type: 'fixed_price',
    local_price: {
      amount: amount,
      currency: 'USD'
    },
    metadata: {
      orgId,
      planId,
      billingPeriod,
      userId
    },
    redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`
  })
  
  return NextResponse.json({ 
    chargeId: charge.id, 
    hostedUrl: charge.hosted_url,
    addresses: charge.addresses
  })
}
```

---

## 7. Implementation Steps

### Phase 1: Database & Core Logic (Week 1)
1. ✅ Create migration: `migrations/020_plans_subscriptions.sql`
2. ✅ Seed plans data
3. ✅ Create `src/lib/plans/index.ts` - Core functions
4. ✅ Add RLS policies
5. ✅ Test queries

### Phase 2: Context & UI (Week 1-2)
1. ✅ Create `SubscriptionProvider`
2. ✅ Add to `WorkspaceContext`
3. ✅ Create plan comparison page
4. ✅ Create upgrade flow UI
5. ✅ Add usage meters

### Phase 3: Stripe Integration (Week 2)
1. ✅ Set up Stripe account
2. ✅ Create products in Stripe
3. ✅ Implement checkout API routes
4. ✅ Implement webhook handler
5. ✅ Test car
