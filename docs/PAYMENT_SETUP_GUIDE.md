# Payment Setup Guide

Complete guide to setting up Stripe and Coinbase Commerce payments.

---

## 📋 Prerequisites

- Stripe account (https://dashboard.stripe.com)
- Coinbase Commerce account (https://commerce.coinbase.com)
- Domain with SSL certificate
- Access to `.env.local` file

---

## 1️⃣ Stripe Setup

### Step 1: Get Stripe API Keys

1. Go to https://dashboard.stripe.com
2. Click **Developers** → **API keys**
3. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

### Step 2: Get Webhook Secret

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

### Step 3: Add to .env.local

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

---

## 2️⃣ Coinbase Commerce Setup

### Step 1: Get API Key

1. Go to https://commerce.coinbase.com
2. Click **Settings** → **API keys**
3. Click **Create an API key**
4. Give it a name (e.g., "Production")
5. Copy the API key (shown once!)

### Step 2: Get Webhook Secret

1. In Coinbase Commerce, go to **Settings** → **Webhook subscriptions**
2. Click **Add an endpoint**
3. Set endpoint URL: `https://yourdomain.com/api/webhooks/coinbase`
4. Select events:
   - `charge:confirmed`
   - `charge:failed`
   - `charge:pending`
5. Click **Add endpoint**
6. Copy the **Shared Secret**

### Step 3: Add to .env.local

```bash
# Coinbase Commerce
COINBASE_API_KEY=your_api_key_here
COINBASE_WEBHOOK_SECRET=your_shared_secret_here
```

---

## 3️⃣ Site URL

Add your site URL to .env.local:

```bash
# Site URL
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

**Note:** For local development, use `http://localhost:3000`

---

## 4️⃣ Complete .env.local Example

```bash
# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Coinbase Commerce
COINBASE_API_KEY=...
COINBASE_WEBHOOK_SECRET=...
```

---

## 5️⃣ Install Dependencies

```bash
# Install Stripe
npm install stripe

# Install Coinbase Commerce
npm install coinbase-commerce-node
```

---

## 6️⃣ Testing

### Test Stripe (Development Mode)

1. Use test credit card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any 3-digit CVC
4. Any postal code

### Test Coinbase (Testnet)

1. Enable testnet in Coinbase Commerce settings
2. Use testnet addresses for payments
3. Monitor webhook events in dashboard

---

## 7️⃣ Production Checklist

### Before Going Live:

- [ ] Replace test API keys with live keys
- [ ] Update webhook URLs to production domain
- [ ] Test webhook delivery
- [ ] Enable SSL certificate
- [ ] Test payment flows end-to-end
- [ ] Set up error monitoring (Sentry)
- [ ] Configure email notifications
- [ ] Test subscription cancellation
- [ ] Test failed payment handling
- [ ] Review security settings

### Stripe Production:

- [ ] Get live API key (`sk_live_...`)
- [ ] Create live webhook endpoint
- [ ] Enable required payment methods
- [ ] Set up tax collection (if applicable)
- [ ] Configure receipt emails
- [ ] Test with real card (small amount)

### Coinbase Production:

- [ ] Get production API key
- [ ] Create production webhook
- [ ] Test with small crypto amount
- [ ] Monitor transaction confirmations
- [ ] Set up settlement preferences

---

## 8️⃣ Monitoring

### Webhook Logs

Check your logs for webhook events:

```bash
# Stripe webhooks
[webhook/stripe] Event: checkout.session.completed
[webhook/stripe] Subscription created: org_123 plan_456

# Coinbase webhooks
[webhook/coinbase] Event: charge:confirmed
[webhook/coinbase] Subscription created: org_123 plan_456
```

### Common Issues

**Webhook not receiving events:**
- Check endpoint URL is correct
- Verify SSL certificate is valid
- Check firewall settings
- Review webhook logs in dashboard

**Signature verification fails:**
- Verify webhook secret is correct
- Check for trailing spaces in .env
- Ensure raw body is being used

**Payment succeeds but no subscription:**
- Check database connection
- Review webhook handler logs
- Verify metadata is being passed correctly

---

## 9️⃣ Security Best Practices

1. **Never commit .env.local to git**
2. **Use different keys for dev/staging/prod**
3. **Rotate keys periodically**
4. **Enable webhook signature verification**
5. **Set up rate limiting**
6. **Monitor for suspicious activity**
7. **Use HTTPS only in production**
8. **Implement proper error handling**
9. **Log all payment events**
10. **Set up alerts for failed payments**

---

## 🆘 Support

### Stripe Support:
- Docs: https://stripe.com/docs
- Support: https://support.stripe.com

### Coinbase Commerce Support:
- Docs: https://commerce.coinbase.com/docs
- Support: https://help.coinbase.com/commerce

---

## ✅ Quick Start (Development)

1. Copy `.env.example` to `.env.local`
2. Add Stripe test keys
3. Add Coinbase test keys
4. Add `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
5. Run `npm install stripe coinbase-commerce-node`
6. Start dev server: `npm run dev`
7. Test checkout flow
8. Monitor webhook events

That's it! Your payment system is ready for testing. 🎉
