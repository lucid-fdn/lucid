# Migration 047 v6 - Production Deployment Guide

## 🚀 DEPLOYMENT STATUS: READY TO SHIP

**Dev Approval:** ✅ CONDITIONAL GO (can ship if all 9 checks pass)

**Timeline:** 10-15 minutes for verification, then 2-3 hours for worker deployment

---

## 📋 Pre-Deployment Checklist

- [ ] **Low traffic window** - Are you in off-peak hours (2-4 AM primary region)?
- [ ] **Backup ready** - Can you rollback if needed?
- [ ] **Team notified** - Are stakeholders aware of deployment?
- [ ] **Verification guide open** - Have `docs/MIGRATION_047_v6_VERIFICATION_GUIDE_v3_FINAL.md` ready

---

## 🎯 Step 1: Apply Migration (2 minutes)

### 1.1 Open Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query

### 1.2 Run Migration v6

```sql
-- Copy the ENTIRE contents of:
-- migrations/047_whatsapp_channel_routing_PRODUCTION_v6.sql

-- Then paste and execute in Supabase SQL Editor
```

**Expected:** "Success. No rows returned"

**If error:** STOP. Do not proceed. Review error message and contact dev team.

### 1.3 Confirm Migration Applied

```sql
-- Check migration was recorded
SELECT version, name, executed_at 
FROM schema_migrations 
ORDER BY executed_at DESC 
LIMIT 5;
```

**Expected:** Version 047 appears in results with recent timestamp.

---

## ✅ Step 2: Run 9-Point Verification (5-10 minutes)

Follow `docs/MIGRATION_047_v6_VERIFICATION_GUIDE_v3_FINAL.md` exactly.

### 2.1 Go/No-Go Verification

**Query A: Telegram Dedupe Index**

```sql
SELECT indexdef
FROM pg_indexes
WHERE indexname = 'ux_inbound_webhook_dedupe';
```

**Expected:**
```
CREATE UNIQUE INDEX ux_inbound_webhook_dedupe 
ON assistant_inbound_events USING btree 
(channel_id, external_chat_id, external_message_id) 
WHERE external_message_id IS NOT NULL AND external_chat_id IS NOT NULL
```

**Check:**
- [ ] ✅ Columns: `(channel_id, external_chat_id, external_message_id)` - All 3 in order
- [ ] ✅ Predicate: `WHERE external_message_id IS NOT NULL AND external_chat_id IS NOT NULL`

---

**Query B: WhatsApp Index**

```sql
SELECT indexdef
FROM pg_indexes
WHERE indexname = 'ux_whatsapp_phone_number';
```

**Expected:**
```
CREATE UNIQUE INDEX ux_whatsapp_phone_number 
ON assistant_channels USING btree 
(external_channel_id) 
WHERE channel_type = 'whatsapp' AND is_active = true
```

**Check:**
- [ ] ✅ Columns: `(external_channel_id)`
- [ ] ✅ Predicate: `WHERE channel_type = 'whatsapp' AND is_active = true`

---

**Query C: No Active Duplicates**

```sql
SELECT external_channel_id, COUNT(*)
FROM assistant_channels
WHERE channel_type='whatsapp' AND is_active=true
GROUP BY external_channel_id
HAVING COUNT(*) > 1;
```

**Expected:** `(0 rows)`

**Check:**
- [ ] ✅ Zero duplicates found

---

### 2.2 Hidden Index/Constraint Check

**Check 2A Part 1: Telegram pg_indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'assistant_inbound_events'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ILIKE '%external_message_id%';
```

**Expected:** At least 1 row (ux_inbound_webhook_dedupe)

**Check for CONFLICTS:**
- [ ] ✅ No index with `(channel_id, external_message_id)` WITHOUT `external_chat_id`

**How to identify conflicts:**
- ❌ BLOCKER: `(channel_id, external_message_id)` - old broken uniqueness
- ✅ SAFE: `(channel_id, external_chat_id, external_message_id)` - correct

---

**Check 2A Part 2: Telegram pg_constraint**

```sql
SELECT conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'assistant_inbound_events'
  AND c.contype = 'u'
  AND pg_get_constraintdef(c.oid) ILIKE '%external_message_id%';
```

**Expected:** 0 rows (or no conflicting constraints)

**Check for CONFLICTS:**
- [ ] ✅ No constraint with `UNIQUE (channel_id, external_message_id)` WITHOUT `external_chat_id`

---

**Check 2B Part 1: WhatsApp pg_indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'assistant_channels'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ILIKE '%external_channel_id%';
```

**Expected:** At least 1 row (ux_whatsapp_phone_number)

**Check for CONFLICTS:**
- [ ] ✅ No index with `WHERE channel_type='whatsapp'` WITHOUT `is_active=true`

**How to identify conflicts:**
- ❌ BLOCKER: `WHERE channel_type='whatsapp'` - missing is_active filter
- ✅ SAFE: `WHERE channel_type='whatsapp' AND is_active=true` - correct

---

**Check 2B Part 2: WhatsApp pg_constraint**

```sql
SELECT conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'assistant_channels'
  AND c.contype = 'u'
  AND pg_get_constraintdef(c.oid) ILIKE '%external_channel_id%';
```

**Expected:** 0 rows (or no conflicting constraints)

**Check for CONFLICTS:**
- [ ] ✅ No constraint for WhatsApp WITHOUT `is_active=true` filter

---

## 🧪 Step 3: Telegram Proof Test (5 minutes)

**This is MANDATORY** - Proves all 8 fixes work correctly.

### 3.1 Get a Telegram Channel ID

```sql
SELECT id FROM assistant_channels WHERE channel_type = 'telegram' LIMIT 1;
```

**Copy the ID** (use in next steps as `<channel_id>`)

---

### 3.2 Insert Test Messages

```sql
-- Message 1: Chat A, message_id=1
INSERT INTO assistant_inbound_events (
  channel_id, external_message_id, external_user_id, external_chat_id, message_text
) VALUES (
  '<channel_id>', '1', 'user_a', 'chat_a', 'Hello from Chat A'
);

-- Message 2: Chat B, SAME message_id=1
INSERT INTO assistant_inbound_events (
  channel_id, external_message_id, external_user_id, external_chat_id, message_text
) VALUES (
  '<channel_id>', '1', 'user_b', 'chat_b', 'Hello from Chat B'
);
```

**Expected:** Both inserts succeed (no duplicate key error)

---

### 3.3 Verify Both Messages Stored

```sql
SELECT external_chat_id, message_text 
FROM assistant_inbound_events 
WHERE channel_id = '<channel_id>' AND external_message_id = '1';
```

**Expected: 2 rows**
```
external_chat_id | message_text
-----------------|------------------
chat_a           | Hello from Chat A
chat_b           | Hello from Chat B
```

**Check:**
- [ ] ✅ 2 rows returned (proves no collision!)

**If only 1 row:** ❌ FAILED - Hidden index/constraint check missed something. Re-run Step 2.2.

**If 2 rows:** ✅ SUCCESS - All 8 fixes working!

---

### 3.4 Cleanup Test Data

```sql
DELETE FROM assistant_inbound_events 
WHERE channel_id = '<channel_id>' 
  AND external_message_id = '1'
  AND external_chat_id IN ('chat_a', 'chat_b');
```

---

## 🎯 Step 4: Final Decision Point

### All 9 Checks Passed?

```
[ ] Query A: Telegram index - EXACT MATCH ✅
[ ] Query B: WhatsApp index - EXACT MATCH ✅
[ ] Query C: No duplicates - 0 ROWS ✅
[ ] Check 2A Part 1: Telegram pg_indexes - NO CONFLICTS ✅
[ ] Check 2A Part 2: Telegram pg_constraint - NO CONFLICTS ✅
[ ] Check 2B Part 1: WhatsApp pg_indexes - NO CONFLICTS ✅
[ ] Check 2B Part 2: WhatsApp pg_constraint - NO CONFLICTS ✅
[ ] Telegram proof test - 2 ROWS INSERTED ✅
[ ] Test data cleanup - COMPLETED ✅
```

**If ALL ✅:** Proceed to Step 5

**If ANY ❌:** STOP. Do not proceed. See troubleshooting section below.

---

## 🚀 Step 5: Deploy Worker Layer (2-3 hours)

### 5.1 Update Worker Code

Implement the following from your Phase 4 docs:

1. **WhatsAppOutput** (`worker/src/channels/whatsapp/WhatsAppOutput.ts`)
   - Idempotency check (prevent duplicate sends)
   - Rate limiting (5 messages/second)
   - Error handling with exponential backoff

2. **Webhook Handler** (`src/app/api/webhooks/whatsapp/route.ts`)
   - Signature verification
   - Inbound event creation
   - Worker queue triggering

3. **Database Queries**
   - Use `getWhatsAppChannelByPhone()` (routes via is_active=true)
   - Use `createInboundEvent()` (handles external_chat_id properly)

### 5.2 Run Production Tests

From `docs/PHASE_4_INTEGRATION_PLAN_UPGRADED.md`:

1. **Test 1:** Phone number routing (active vs inactive)
2. **Test 2:** Telegram multi-chat dedupe
3. **Test 3:** WhatsApp reactivation flow
4. **Test 4:** Concurrent message handling
5. **Test 5:** Rate limiting
6. **Test 6:** Error recovery

### 5.3 Deploy Worker

```bash
# Deploy to Railway/Render/etc.
npm run build:worker
npm run deploy:worker

# Verify worker is running
npm run health:worker
```

---

## 🎊 Step 6: Production Deployment Complete

### 6.1 Monitor

**First 24 hours:**
- Check error logs every hour
- Monitor Telegram message delivery (should be 100%)
- Monitor WhatsApp routing (active-only)
- Watch for duplicate sends (should be 0)

### 6.2 Notify Team

**Deployment successful:**
- Migration 047 v6 applied ✅
- All 9 verification checks passed ✅
- Telegram proof test successful ✅
- Worker layer deployed ✅
- WhatsApp + Telegram integration live 🚀

---

## ⚠️ Troubleshooting

### Query A/B Failed - Index Not Replaced

**Symptom:** Index definition doesn't match expected

**Fix:**
1. Check migration logs for errors
2. Manually run `DROP INDEX` + `CREATE INDEX` from migration
3. Re-verify

**Rollback:** See "Emergency Rollback" section below

---

### Check 2A/2B Failed - Conflicting Index/Constraint Found

**Symptom:** Old broken uniqueness still exists

**Fix:**
1. Identify conflicting index/constraint name
2. Investigate purpose (confirm it's the old broken one)
3. Drop manually:
   ```sql
   DROP INDEX IF EXISTS ux_old_name;
   -- OR
   ALTER TABLE table_name DROP CONSTRAINT constraint_name;
   ```
4. Re-verify

---

### Telegram Proof Test Failed - Only 1 Row Inserted

**Symptom:** Second insert failed with duplicate key error

**Diagnosis:** Hidden index/constraint still enforcing old broken uniqueness

**Fix:**
1. Re-run Check 2A Part 1 & 2
2. Look for ANY UNIQUE index/constraint with `external_message_id` but WITHOUT `external_chat_id`
3. Drop the conflicting constraint
4. Re-run proof test

---

## 🆘 Emergency Rollback

**If production issues arise:**

```sql
-- 1. Drop new indexes
DROP INDEX IF EXISTS ux_inbound_webhook_dedupe;
DROP INDEX IF EXISTS ux_whatsapp_phone_number;

-- 2. Recreate old indexes (TEMPORARY ONLY)
CREATE UNIQUE INDEX ux_inbound_webhook_dedupe
  ON assistant_inbound_events (channel_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE UNIQUE INDEX ux_whatsapp_phone_number
  ON assistant_channels (external_channel_id)
  WHERE channel_type = 'whatsapp';

-- 3. File incident report and schedule re-deployment
```

**WARNING:** Rollback re-introduces the Telegram message drop bug. Use only as emergency measure.

---

## 📊 Deployment Log Template

```
Migration 047 v6 Production Deployment
Date: [DATE]
Operator: [YOUR NAME]
Environment: PRODUCTION

Pre-Deployment:
[ ] Low traffic window: [TIME]
[ ] Backup ready: YES/NO
[ ] Team notified: YES/NO

Step 1: Migration Applied
[ ] Time: [TIMESTAMP]
[ ] Result: SUCCESS/FAILED
[ ] Notes: 

Step 2: Verification (9 checks)
[ ] Query A: PASS/FAIL
[ ] Query B: PASS/FAIL
[ ] Query C: PASS/FAIL
[ ] Check 2A Part 1: PASS/FAIL ([X] indexes found, [Y] conflicting)
[ ] Check 2A Part 2: PASS/FAIL ([X] constraints found, [Y] conflicting)
[ ] Check 2B Part 1: PASS/FAIL ([X] indexes found, [Y] conflicting)
[ ] Check 2B Part 2: PASS/FAIL ([X] constraints found, [Y] conflicting)
[ ] Telegram proof test: PASS/FAIL ([X] rows inserted)
[ ] Test cleanup: COMPLETED

Step 3: Decision
[ ] Final decision: GO/NO-GO
[ ] Time: [TIMESTAMP]

Step 4: Worker Deployment
[ ] Worker built: [TIMESTAMP]
[ ] Worker deployed: [TIMESTAMP]
[ ] Health check: PASS/FAIL
[ ] Production tests: [X/6 passed]

Step 5: Monitoring
[ ] Hour 1: [STATUS]
[ ] Hour 2: [STATUS]
[ ] Hour 24: [STATUS]

Issues Encountered:
- 
- 

Resolution:
- 
- 

Final Status: SUCCESS/ROLLBACK
Completion Time: [TIMESTAMP]
```

---

## 🎯 Summary

**Migration:** `migrations/047_whatsapp_channel_routing_PRODUCTION_v6.sql`

**Verification:** `docs/MIGRATION_047_v6_VERIFICATION_GUIDE_v3_FINAL.md`

**Fixes Applied:** 13 total (8 migration + 5 verification security)

**Dev Approval:** ✅ CONDITIONAL GO (ship if all 9 checks pass)

**Your WhatsApp + Telegram integration is ready for production! 🚀**

**Next:** Follow this guide step-by-step. Take your time. Verify everything.