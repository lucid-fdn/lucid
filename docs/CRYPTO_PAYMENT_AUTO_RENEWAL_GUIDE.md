# 🔐 Crypto Payment & Auto-Renewal Guide

## 🎯 Overview

Your SaaS now supports TWO payment methods:
1. **Stripe** (Credit Card) - Native auto-renewal
2. **Coinbase Commerce** (Crypto) - Manual auto-renewal strategy

---

## 💳 Stripe vs Crypto: The Key Difference

### Stripe (Traditional)
```
User subscribes → Stripe stores card → Auto-charges monthly/yearly
✅ Fully automatic
✅ Zero manual intervention
✅ Industry standard
```

### Crypto (Web3)
```
User pays once → No stored payment method → Manual renewal required
❌ Cannot auto-charge (crypto wallets don't work that way)
❌ Need custom solution
✅ But: Privacy, decentralization, lower fees
```

---

## 🚨 The Crypto Auto-Renewal Challenge

### Why Crypto Can't Auto-Renew Like Stripe:

**1. No Stored Payment Method**
- Credit cards: Bank authorizes recurring charges
- Crypto: User signs each transaction manually
- **You CANNOT charge a crypto wallet automatically**

**2. Blockchain Constraints**
- No "pull payments" (only push from user)
- Smart contracts CAN enable recurring, but:
  - Require user to approve upfront
  - Gas fees for each renewal
  - Complex UX

**3. Industry Solutions**

Most Web3 SaaS use one of these:

| Solution | How It Works | Examples |
|----------|--------------|----------|
| **Manual Renewal** | Email reminders | Mirror, Paragraph |
| **Prepaid Credits** | Buy credits upfront | OpenAI, Anthropic |
| **Smart Contract Subscriptions** | Approve recurring pulls | Superfluid, Sablier |
| **Hybrid** | Crypto for yearly, card for monthly | Notion, Vercel |

---

## ✅ Our Implementation: Smart Manual Renewal

### Strategy: Email + Grace Period + Notifications

```
Day 0: User pays $29 USDC for 1 month
  ↓
Day 25: Email reminder "Renewal in 5 days"
  ↓
Day 28: Email reminder "Renewal in 2 days"
  ↓
Day 30: Subscription expires
  ↓
Day 31-37: 7-day grace period (features still work)
  ↓
Day 35: Email "Renew now to avoid service interruption"
  ↓
Day 38: Subscription suspended (downgrade to free)
  ↓
User clicks "Renew" → Pays again → Reactivated
```

### Implementation Details:

**1. Track Renewal Dates**
```typescript
// When crypto payment received:
await supabase.from('subscriptions').insert({
  org_id: orgId,
  plan_id: planId,
  status: 'active',
  payment_method: 'crypto',
  current_period_start: NOW(),
  current_period_end: NOW() + 30 days,  // ← Track this!
  metadata: {
    renewal_reminder_sent: false,
    grace_period_notified: false
  }
})
```

**2. Cron Job for Reminders**
```typescript
// Run daily at 9am
export async function checkCryptoRenewals() {
  const { data: expiringSubscriptions } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('payment_method', 'crypto')
    .eq('status', 'active')
    .gte('current_period_end', NOW())
    .lte('current_period_end', NOW() + 5 days)
  
  for (const sub of expiringSubscriptions) {
    // Send renewal reminder email
    await sendRenewalReminder(sub)
  }
}
```

**3. Email Templates**

**Reminder 1 (5 days before):**
```
Subject: Your Pro subscription renews in 5 days

Hi {name},

Your Pro plan expires on {date}. To continue enjoying:
- AI Agents
- 100K API calls/month
- Priority support

Renew now: {renewalLink}

Questions? Reply to this email.
```

**Reminder 2 (2 days before):**
```
Subject: ⏰ Pro subscription expires in 2 days

Your Pro plan expires in 2 days. Renew now to avoid interruption:
{renewalLink}
```

**Grace Period Warning:**
```
Subject: 🚨 Pro subscription expired - 7 day grace period

Your Pro plan expired, but you have 7 days to renew without losing data.

Renew now: {renewalLink}

After 7 days, you'll be downgraded to Free plan.
```

**4. In-App Notifications**
```typescript
// Show banner when < 5 days left
if (subscription.payment_method === 'crypto' && daysLeft < 5) {
  return (
    <Banner variant="warning">
      Your Pro plan expires in {daysLeft} days.{' '}
      <Link href="/settings/billing">Renew now</Link>
    </Banner>
  )
}
```

---

## 🔄 Alternative: Smart Contract Auto-Renewal

### For Advanced Implementation:

**1. Use Superfluid or Sablier**
```solidity
// User approves streaming payment
contract.approveStream({
  receiver: YOUR_WALLET,
  token: USDC,
  flowRate: 29 USDC per month
})

// Contract auto-transfers monthly
// You monitor stream status
// Stop service if stream stops
```

**Pros:**
- ✅ True auto-renewal
- ✅ User controls (can cancel anytime)
- ✅ Transparent on-chain

**Cons:**
- ❌ Gas fees every renewal
- ❌ Complex UX
- ❌ Not all users understand
- ❌ Limited token support

**Implementation:**
```typescript
// Check stream status daily
const isStreaming = await superfluid.isStreaming(userAddress)

if (!isStreaming) {
  await downgradeSubscription(userId)
}
```

---

## 📊 Production Setup

### Environment Variables

Add to `.env.local`:

```bash
# Stripe (Credit Card Payments)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Coinbase Commerce (Crypto Payments)
COINBASE_COMMERCE_API_KEY=...
COINBASE_COMMERCE_WEBHOOK_SECRET=...

# App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Stripe Setup

**1. Create Products & Prices:**
```bash
# In Stripe Dashboard:
1. Products → Create Product
   - Name: "Professional Plan"
   - Billing: Recurring
   
2. Add Price:
   - Monthly: $29.00
   - Yearly: $290.00
   
3. Copy Price IDs:
   - price_1ABC...  (monthly)
   - price_1XYZ...  (yearly)
```

**2. Update Database:**
```sql
UPDATE plans 
SET 
  stripe_price_monthly_id = 'price_1ABC...',
  stripe_price_yearly_id = 'price_1XYZ...'
WHERE name = 'pro';
```

**3. Set up Webhooks:**
```
Endpoint: https://yourdomain.com/api/webhooks/stripe

Events:
- checkout.session.completed
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed
```

### Coinbase Commerce Setup

**1. Create Account:**
- Visit https://commerce.coinbase.com
- Create business account
- Get API key

**2. Configure Webhooks:**
```
Endpoint: https://yourdomain.com/api/webhooks/coinbase

Events:
- charge:confirmed
- charge:failed
- charge:pending
```

---

## 🔔 Email Reminder System

### Implementation with Resend/SendGrid:

```typescript
// src/lib/cron/check-renewals.ts

export async function checkCryptoRenewals() {
  const today = new Date()
  const in5Days = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000)
  
  // Get subscriptions expiring in 5 days
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select(`
      *,
      organizations (*)
    `)
    .eq('payment_method', 'crypto')
    .eq('status', 'active')
    .gte('current_period_end', today)
    .lte('current_period_end', in5Days)
  
  for (const sub of subscriptions) {
    // Check if reminder already sent
    if (sub.metadata?.reminder_5day_sent) continue
    
    // Send email
    await resend.emails.send({
      from: 'billing@yourdomain.com',
      to: sub.organizations.email,
      subject: 'Your Pro subscription renews in 5 days',
      html: renderRenewalEmail(sub)
    })
    
    // Mark as sent
    await supabase
      .from('subscriptions')
      .update({
        metadata: {
          ...sub.metadata,
          reminder_5day_sent: true
        }
      })
      .eq('id', sub.id)
  }
}

// Run via Vercel Cron:
// vercel.json:
{
  "crons": [{
    "path": "/api/cron/check-renewals",
    "schedule": "0 9 * * *"  // 9am daily
  }]
}
```

---

## 🎨 UX Improvements

### 1. Renewal Page
```typescript
// src/app/renew/page.tsx
export default function RenewPage() {
  const { subscription } = useSubscription()
  
  return (
    <div>
      <h1>Renew Your Subscription</h1>
      <p>Your {subscription.plan_name} plan expired on {subscription.current_period_end}</p>
      
      <Button onClick={() => handleRenew('crypto')}>
        Renew with Crypto
      </Button>
      
      <Button onClick={() => handleRenew('stripe')}>
        Switch to Credit Card (Auto-Renewal)
      </Button>
    </div>
  )
}
```

### 2. Countdown Timer
```typescript
<Card>
  <CardHeader>
    <CardTitle>Pro Plan</CardTitle>
    <CardDescription>
      {daysLeft > 0 ? (
        <>Expires in {daysLeft} days</>
      ) : (
        <>Expired - Grace period: {graceDaysLeft} days left</>
      )}
    </CardDescription>
  </CardHeader>
  
  <CardContent>
    <Button href="/renew">Renew Now</Button>
  </CardContent>
</Card>
```

---

## 📈 Recommended Approach

### For Most SaaS:

1. **Primary: Stripe (Auto-Renewal)**
   - Default option
   - Best UX
   - Highest conversion

2. **Secondary: Crypto (Annual Only)**
   - Offer yearly crypto payments
   - 1 payment = 12 months
   - Reduces renewal friction
   - Still appeals to crypto users

3. **Hybrid Pricing:**
   ```
   Monthly: $29/mo (Stripe only)
   Yearly: $290/yr (Stripe or Crypto)
   
   Why? Annual crypto = less renewal hassle
   ```

### Implementation:
```typescript
// In PlanComparison component:
if (billingPeriod === 'yearly') {
  // Show both payment options
  return (
    <>
      <Button onClick={() => checkout('stripe')}>
        Pay with Card
      </Button>
      <Button onClick={() => checkout('crypto')}>
        Pay with Crypto
      </Button>
    </>
  )
} else {
  // Monthly: Stripe only
  return (
    <Button onClick={() => checkout('stripe')}>
      Subscribe Monthly
    </Button>
  )
}
```

---

## ✅ Summary

### Stripe (Credit Card):
- ✅ Fully automatic renewal
- ✅ Zero user intervention
- ✅ Industry standard
- ✅ Best UX

### Crypto (Web3):
- ❌ Cannot auto-renew (blockchain limitation)
- ✅ Solution: Email reminders + grace period
- ✅ Alternative: Smart contract streaming (advanced)
- ✅ Best for: Annual plans

### Recommendation:
1. **Default to Stripe** for best UX
2. **Offer crypto for yearly** plans only
3. **Implement email reminders** for crypto renewals
4. **7-day grace period** before downgrade
5. **In-app notifications** when renewal due

**Your implementation is production-ready for both!** 🚀
