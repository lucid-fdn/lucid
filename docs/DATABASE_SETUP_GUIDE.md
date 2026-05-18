# Database Setup Guide - Complete SQL Order

**Problem:** `ERROR: relation "profiles" does not exist`

**Solution:** Run schemas in correct order!

---

## 🗄️ Correct Order to Run SQL

### Step 1: User Management Schema FIRST
**File:** `apps/web/supabase_user_management_schema.sql`

```sql
-- This creates the profiles table!
-- Run this FIRST in Supabase SQL Editor

-- Copy entire content from:
-- apps/web/supabase_user_management_schema.sql

-- Creates:
-- ✅ profiles table
-- ✅ identity_links table
-- ✅ user_wallets table
```

### Step 2: Notification Schema SECOND
**File:** `apps/web/supabase_notifications_schema.sql`

```sql
-- This references profiles table
-- Run this SECOND in Supabase SQL Editor

-- Copy entire content from:
-- apps/web/supabase_notifications_schema.sql

-- Creates:
-- ✅ notifications table (references profiles)
-- ✅ notification_preferences table (references profiles)
-- ✅ Functions and triggers
```

### Step 3: Push Subscriptions THIRD

```sql
-- Add this for push notifications
-- Run this THIRD in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint (prevent duplicate subscriptions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_unique 
  ON push_subscriptions(user_id, (subscription->>'endpoint'));

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user 
  ON push_subscriptions(user_id);

-- RLS Policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;

COMMENT ON TABLE push_subscriptions IS 'Push notification subscriptions (Web Push API)';
```

---

## ✅ Complete SQL Script (Copy-Paste Ready)

### In Supabase SQL Editor, run these 3 steps:

```sql
-- ============================================================================
-- STEP 1: USER MANAGEMENT (creates profiles table)
-- ============================================================================

-- [Copy ENTIRE content from apps/web/supabase_user_management_schema.sql here]

-- ============================================================================
-- STEP 2: NOTIFICATIONS (uses profiles table)
-- ============================================================================

-- [Copy ENTIRE content from apps/web/supabase_notifications_schema.sql here]

-- ============================================================================
-- STEP 3: PUSH SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_unique 
  ON push_subscriptions(user_id, (subscription->>'endpoint'));

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user 
  ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;
```

---

## 🔍 Verify Tables Were Created

```sql
-- Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'profiles',
  'identity_links',
  'user_wallets',
  'notifications',
  'notification_preferences',
  'push_subscriptions'
);

-- Should return 6 tables
```

---

## 📧 Email Configuration (Centralized)

### Created: `apps/web/src/lib/emails/config.ts`

```typescript
export const EMAIL_ADDRESSES = {
  CONTACT: 'contact@form.lucid.foundation',
  WAITINGLIST: 'waitinglist@lucid.foundation',
  NOTIFICATIONS: 'notifications@lucid.foundation',
  ALERTS: 'alerts@lucid.foundation',
  NO_REPLY: 'no-reply@lucid.foundation',
  SYSTEM: 'system@lucid.foundation',
};
```

### Usage:

```typescript
// In contact form
import { EMAIL_ADDRESSES } from '@/lib/emails/config';

await resend.emails.send({
  from: EMAIL_ADDRESSES.CONTACT,
  to: email,
  // ...
});

// In waitinglist
from: EMAIL_ADDRESSES.WAITINGLIST,

// In notifications
from: EMAIL_ADDRESSES.NOTIFICATIONS,
```

### Your .env.local:

```bash
# Single Resend API key for all emails ✅
RESEND_API_KEY=re_xxxxx

# Optional: Override default notification email
EMAIL_FROM=notifications@lucid.foundation

# All emails work under one Resend account!
# Just verify lucid.foundation domain in Resend dashboard
```

---

## ✅ Summary

### SQL Order (Critical!)
```
1. supabase_user_management_schema.sql     ← Creates profiles
2. supabase_notifications_schema.sql       ← Uses profiles
3. push_subscriptions (SQL above)          ← Uses profiles
```

### Email Centralization
```
✅ Created: /lib/emails/config.ts
✅ Single source of truth for all email addresses
✅ One Resend API key
✅ Multiple "from" addresses (all valid)
✅ Easy to update in one place
```

### What You Have
```
✅ Centralized email config
✅ Updated notification config to use lucid.foundation
✅ Clear SQL execution order
✅ All errors resolved
```

### Next Steps
```
1. Run SQL in correct order (3 steps above)
2. Generate VAPID keys: npx web-push generate-vapid-keys
3. Add keys to .env.local
4. Verify emails in Resend dashboard
5. Test!
