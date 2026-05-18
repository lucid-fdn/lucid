# 🎯 Stripe Product Setup - AI SaaS Pro Plan

## 📊 Industry-Standard AI SaaS Pricing

### Recommended Pricing (Based on Competitors):

| Plan | Monthly | Yearly | Savings |
|------|---------|--------|---------|
| **Free** | $0 | $0 | - |
| **Pro** | $29/mo | $290/yr | $58 (16%) |
| **Enterprise** | Custom | Custom | Negotiable |

### Competitor Analysis:

| Company | Pro Price | What You Get |
|---------|-----------|--------------|
| OpenAI | $20/mo | GPT-4 access, higher limits |
| Anthropic | $20/mo | Claude Pro, priority access |
| Perplexity | $20/mo | Pro search, unlimited queries |
| Jasper | $49/mo | AI writing assistant |
| Copy.ai | $49/mo | AI content generation |
| **Our Sweet Spot** | **$29/mo** | **Best value in market** |

---

## 🏗️ Step-by-Step: Create Stripe Product

### Step 1: Login to Stripe Dashboard

```
1. Go to https://dashboard.stripe.com
2. Switch to LIVE mode (top left)
   (Use TEST mode for testing first!)
```

### Step 2: Create Product

```
1. Click "Products" in left sidebar
2. Click "+ Add Product"
3. Fill in details:
```

**Product Details:**
```
Name: Professional Plan
Description: Full access to AI features with priority support

Type: Recurring
Statement descriptor: LUCID PRO (appears on credit card)
```

### Step 3: Add Monthly Price

```
Click "+ Add another price"

Pricing model: Standard pricing
Price: 29.00
Billing period: Monthly
Currency: USD

Price description: Monthly subscription
Price nickname: Pro Monthly

Save
```

**Copy the Price ID!**
```
Example: price_1ABC123xyz...
```

### Step 4: Add Yearly Price

```
Click "+ Add another price" again

Pricing model: Standard pricing
Price: 290.00
Billing period: Yearly
Currency: USD

Price description: Yearly subscription (save $58!)
Price nickname: Pro Yearly

Save
```

**Copy this Price ID too!**
```
Example: price_1XYZ789abc...
```

### Step 5: Enable Crypto Payments

```
1. Go to Settings (gear icon)
2. Click "Payment methods"
3. Scroll to "Cryptocurrency"
4. Toggle ON
5. Select:
   ☑ USDC (Recommended - stable)
   ☑ USDT (Stablecoin)
   ☑ Bitcoin
   ☑ Ethereum
6. Save
```

---

## 💾 Update Your Database

### Copy your Price IDs and Product ID

```sql
-- Update plans table with Stripe IDs
UPDATE plans 
SET 
  stripe_product_id = 'prod_ABC123...',           -- Your product ID
  stripe_price_monthly_id = 'price_1ABC123...',   -- Monthly price ID
  stripe_price_yearly_id = 'price_1XYZ789...'     -- Yearly price ID
WHERE name = 'pro';

-- Verify it worked
SELECT 
  name,
  display_name,
  price_monthly_usd,
  price_yearly_usd,
  stripe_product_id,
  stripe_price_monthly_id,
  stripe_price_yearly_id
FROM plans
WHERE name = 'pro';
```

---

## 🔔 Set Up Webhooks

### Step 1: Create Webhook Endpoint

```
1. In Stripe Dashboard → Developers → Webhooks
2. Click "+ Add endpoint"
3. Endpoint URL: https://yourdomain.com/api/webhooks/stripe
4. Description: Handle subscription events
```

### Step 2: Select Events

```
Select events to listen to:

☑ checkout.session.completed
  → User completes payment

☑ customer.subscription.created
  → New subscription created

☑ customer.subscription.updated
  → Subscription plan changed

☑ customer.subscription.deleted
  → User cancels subscription

☑ invoice.payment_succeeded
  → Successful renewal

☑ invoice.payment_failed
  → Failed renewal (retry/cancel)

☑ customer.subscription.trial_will_end
  → Trial ending soon (if you add trials)
```

### Step 3: Get Webhook Secret

```
After creating endpoint, copy:
Signing secret: whsec_ABC123...

Add to .env.local:
STRIPE_WEBHOOK_SECRET=whsec_ABC123...
```

---

## 🎨 Pro Plan Features (Recommendation)

### What Should Pro Include?

Based on AI SaaS industry standards:

```typescript
// In migrations/020_plans_subscriptions.sql
// Pro Plan features should be:

{
  "ai_agents": true,              // Create AI agents
  "custom_functions": true,       // Custom AI functions
  "analytics": true,              // Usage analytics
  "api_access": true,            // API access
  "custom_domain": false,        // Enterprise only
  "priority_support": true,      // Email support
  "team_collaboration": true,    // Up to 5 members
  "advanced_security": false     // Enterprise only
}

// Limits:
{
  "api_calls_monthly": 100000,    // 100K calls/month
  "storage_gb": 50,               // 50 GB storage
  "projects": 10,                 // 10 projects
  "team_members": 5,              // 5 team members
  "ai_queries_monthly": 10000,    // 10K AI queries
  "functions": 100                // 100 custom functions
}
```

---

## 📈 Pricing Psychology

### Why $29/mo is Perfect:

**1. Sweet Spot**
- Not too cheap (looks low quality)
- Not too expensive (accessible)
- Industry standard for AI tools

**2. Anchoring**
```
Free: $0/mo (limited)
Pro: $29/mo (best value) ← Majority choose this
Enterprise: $299+/mo (premium)
```

**3. Conversion Optimization**
```
$19/mo: Too cheap (low perceived value)
$29/mo: Perfect (trust + value) ✅
$49/mo: Expensive (fewer conversions)
```

---

## 🧪 Test Before Going Live

### Use Stripe Test Mode

```bash
# .env.local (for testing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Test Cards

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155

Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

### Test Crypto

```
Use Stripe test mode crypto
Payments auto-confirm in test mode
No real crypto needed
```

---

## 🚀 Launch Checklist

### Before Going Live:

- [ ] Created product in Stripe (LIVE mode)
- [ ] Added monthly price ($29)
- [ ] Added yearly price ($290)
- [ ] Copied all IDs
- [ ] Updated database with Price IDs
- [ ] Enabled crypto payments
- [ ] Set up webhook endpoint
- [ ] Added webhook secret to .env
- [ ] Tested in test mode
- [ ] Verified subscription creation
- [ ] Tested auto-renewal
- [ ] Switch to live keys
- [ ] Test with real card (small amount)
- [ ] Verify webhook works
- [ ] Monitor first few subscriptions

---

## 💡 Pro Tips

### 1. Trial Period (Optional)

```
In Stripe product settings:
Add trial period: 14 days

Benefits:
- Higher conversion
- User can test full features
- Industry standard
```

### 2. Yearly Discount

```
Monthly: $29/mo = $348/year
Yearly: $290/yr (save $58)

This is 16% discount
Industry standard: 15-20%
```

### 3. Usage-Based Add-ons (Future)

```
Pro Plan: $29/mo base
+ Extra 10K API calls: $9
+ Extra 10 GB storage: $5
+ Extra team member: $10

Grows revenue as users scale
```

---

## 📊 Expected Metrics

### Conversion Rates (Industry Average):

```
Free → Pro: 2-5%
Trial → Paid: 20-40%
Annual upgrade: 15-25%
```

### Your Pricing Analysis:

```
100 signups
├─ 3 convert to Pro ($29/mo)
│  = $87/month
│
├─ 1 chooses yearly ($290)
│  = $290 once
│
Total first month: $377
Monthly recurring: $87
```

At 1000 users:
```
1000 signups × 3% = 30 Pro subscribers
30 × $29 = $870/month = $10,440/year MRR
```

---

## 🎯 Your Product Summary

```
Product Name: Professional Plan
Monthly Price: $29.00 USD
Yearly Price: $290.00 USD (16% savings)

Features:
✅ AI Agents
✅ 100K API calls/month
✅ 10K AI queries/month
✅ 50 GB storage
✅ 10 projects
✅ 5 team members
✅ Priority support
✅ Analytics dashboard
✅ Custom functions

Payment Methods:
💳 Credit/Debit Card
🏦 Bank Transfer
₿ Crypto (USDC, BTC, ETH, USDT)

Auto-Renewal: Yes (Stripe subscriptions)
```

---

## 📞 Need Help?

### Stripe Support

```
1. Dashboard → Help (question mark icon)
2. Chat with support (24/7)
3. Or call: Listed in dashboard
```

### Common Issues

**Q: Price IDs not working?**
A: Make sure you're in LIVE mode, not test mode

**Q: Crypto not showing up?**
A: Enable in Settings → Payment methods → Cryptocurrency

**Q: Webhook failing?**
A: Check endpoint URL is publicly accessible (not localhost)

---

## ✅ Quick Start Commands

```bash
# 1. Create product in Stripe Dashboard
# 2. Copy Price IDs
# 3. Run this SQL:

UPDATE plans 
SET 
  stripe_product_id = 'YOUR_PRODUCT_ID',
  stripe_price_monthly_id = 'YOUR_MONTHLY_PRICE_ID',
  stripe_price_yearly_id = 'YOUR_YEARLY_PRICE_ID'
WHERE name = 'pro';
```

**That's it!** Your Pro plan is ready! 🎉
