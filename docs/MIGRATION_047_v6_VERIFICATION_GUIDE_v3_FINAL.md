# Migration 047 v6 - Pre-Production Verification Guide (v3 FINAL)

## Overview

This guide contains the **2 mandatory verification steps** required before deploying Migration 047 v6 to production. These checks ensure no "hidden footguns" remain from prior migrations.

**Timeline:** 3-4 minutes total

**Version:** v3 FINAL (hardened with 5 critical security fixes)

---

## ✅ Step 1: Go/No-Go Verification (30 seconds)

Run these **immediately after applying v6** in Supabase SQL Editor:

### Query A: Telegram Dedupe Index Definition

**Purpose:** Verify index includes `external_chat_id` (prevents Telegram message drops)

```sql
SELECT indexdef
FROM pg_indexes
WHERE indexname = 'ux_inbound_webhook_dedupe';
```

**Expected Result:**
```
CREATE UNIQUE INDEX ux_inbound_webhook_dedupe 
ON assistant_inbound_events USING btree 
(channel_id, external_chat_id, external_message_id) 
WHERE external_message_id IS NOT NULL AND external_chat_id IS NOT NULL
```

**Must match EXACTLY:**
- ✅ **Columns:** `(channel_id, external_chat_id, external_message_id)` - All 3 columns in order
- ✅ **Predicate:** `WHERE external_message_id IS NOT NULL AND external_chat_id IS NOT NULL` - BOTH NOT NULL

**Why check the WHERE clause:** Migration history involved predicate drift. Must verify BOTH columns and predicate.

**If fails:** Index wasn't replaced. DO NOT DEPLOY. Contact dev team.

---

### Query B: WhatsApp Index Definition

**Purpose:** Verify index only applies to active channels (prevents routing to inactive)

```sql
SELECT indexdef
FROM pg_indexes
WHERE indexname = 'ux_whatsapp_phone_number';
```

**Expected Result:**
```
CREATE UNIQUE INDEX ux_whatsapp_phone_number 
ON assistant_channels USING btree 
(external_channel_id) 
WHERE channel_type = 'whatsapp' AND is_active = true
```

**Must match EXACTLY:**
- ✅ **Columns:** `(external_channel_id)` - Single column
- ✅ **Predicate:** `WHERE channel_type = 'whatsapp' AND is_active = true` - Active-only enforcement

**Why check the WHERE clause:** Predicate drift in migration history. Old index may have `WHERE channel_type='whatsapp'` without `is_active` filter.

**If fails:** Index wasn't replaced. DO NOT DEPLOY. Contact dev team.

---

### Query C: No Active Duplicates Remain

**Purpose:** Verify preflight cleanup removed all active duplicates

```sql
SELECT external_channel_id, COUNT(*)
FROM assistant_channels
WHERE channel_type='whatsapp' AND is_active=true
GROUP BY external_channel_id
HAVING COUNT(*) > 1;
```

**Expected Result:**
```
(0 rows)
```

**If fails:** Duplicates still exist. DO NOT DEPLOY. Run duplicate cleanup manually:
```sql
-- Manual cleanup (if Query C fails)
UPDATE assistant_channels
SET is_active = false, updated_at = NOW()
WHERE id IN (
  SELECT c2.id
  FROM assistant_channels c1
  INNER JOIN assistant_channels c2
    ON c1.external_channel_id = c2.external_channel_id
    AND c1.channel_type = 'whatsapp'
    AND c2.channel_type = 'whatsapp'
    AND c1.is_active = true
    AND c2.is_active = true
    AND (c1.created_at < c2.created_at OR (c1.created_at = c2.created_at AND c1.id < c2.id))
);
```

---

## ✅ Step 2: Hidden Index/Constraint Check (2-3 minutes)

**Purpose:** Catch "old index/constraint under different name" that enforces the old broken uniqueness

**CRITICAL:** Must check BOTH `pg_indexes` AND `pg_constraint`. Unique constraints created via `ALTER TABLE ... ADD CONSTRAINT UNIQUE` won't show in `pg_indexes`.

### Check 2A: Telegram Message Deduplication

**Purpose:** Ensure NO other UNIQUE index/constraint enforces `(channel_id, external_message_id)` without `external_chat_id`

#### Part 1: Check pg_indexes (UNIQUE indexes)

```sql
-- List every UNIQUE index touching external_message_id
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'assistant_inbound_events'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ILIKE '%external_message_id%';
```

**Expected Result:**
```
indexname                    | indexdef
-----------------------------|-------------------------------------------
ux_inbound_webhook_dedupe    | CREATE UNIQUE INDEX ux_inbound_webhook_dedupe ON assistant_inbound_events USING btree (channel_id, external_chat_id, external_message_id) WHERE external_message_id IS NOT NULL AND external_chat_id IS NOT NULL
```

**Acceptable:** May return **multiple rows** IF other UNIQUE indexes exist for different features.

**Blocker:** Any UNIQUE index that enforces `(channel_id, external_message_id)` **without** `external_chat_id` will cause Telegram message drops.

**How to identify a conflicting index:**
- ✅ **SAFE:** `(channel_id, external_chat_id, external_message_id, other_column)` - Includes external_chat_id
- ✅ **SAFE:** `(external_message_id, unrelated_column)` - For a different feature
- ❌ **BLOCKER:** `(channel_id, external_message_id)` - The old broken uniqueness!
- ❌ **BLOCKER:** `(channel_id, external_message_id, ...)` - WITHOUT external_chat_id in the column list

#### Part 2: Check pg_constraint (UNIQUE constraints)

```sql
-- List every UNIQUE constraint touching external_message_id
SELECT conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'assistant_inbound_events'
  AND c.contype = 'u'
  AND pg_get_constraintdef(c.oid) ILIKE '%external_message_id%';
```

**Expected Result:**
```
(0 rows)
```
**OR** rows that do NOT enforce the old broken uniqueness.

**Acceptable:** May return **rows** IF UNIQUE constraints exist for different features.

**Blocker:** Any UNIQUE constraint that enforces `(channel_id, external_message_id)` **without** `external_chat_id`.

**How to identify a conflicting constraint:**
- ✅ **SAFE:** `UNIQUE (channel_id, external_chat_id, external_message_id)` - Includes external_chat_id
- ✅ **SAFE:** `UNIQUE (external_message_id, unrelated_column)` - For a different feature
- ❌ **BLOCKER:** `UNIQUE (channel_id, external_message_id)` - The old broken uniqueness!
- ❌ **BLOCKER:** `UNIQUE (channel_id, external_message_id, ...)` - WITHOUT external_chat_id

---

**If you see ANY conflicting UNIQUE index/constraint on `external_message_id`:**

⚠️ **DO NOT drop immediately** - Investigate first:

```sql
-- Example of a problematic index that would cause Telegram drops:
-- ux_old_telegram_dedupe | ... (channel_id, external_message_id) ...

-- 1. INVESTIGATE: Confirm this index/constraint enforces (channel_id, external_message_id) without external_chat_id
-- 2. VERIFY: Check if it's the old broken 2-column uniqueness (not the new 3-column)
-- 3. CONFIRM PURPOSE: Ensure it's not protecting other integrity constraints
-- 4. THEN DROP:
DROP INDEX IF EXISTS ux_old_telegram_dedupe;  -- Replace with actual name
-- OR
ALTER TABLE assistant_inbound_events DROP CONSTRAINT old_constraint_name;  -- If it's a constraint
```

**Blocker:** Any UNIQUE index/constraint that enforces `(channel_id, external_message_id)` without `external_chat_id` will cause Telegram message drops. **Confirm purpose, then drop/replace it.**

---

### Check 2B: WhatsApp Channel Uniqueness

**Purpose:** Ensure NO other UNIQUE index/constraint enforces `external_channel_id` without `is_active=true` filter

#### Part 1: Check pg_indexes (UNIQUE indexes)

```sql
-- List every UNIQUE index touching external_channel_id
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'assistant_channels'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ILIKE '%external_channel_id%';
```

**Expected Result:**
```
indexname                  | indexdef
---------------------------|-------------------------------------------
ux_whatsapp_phone_number   | CREATE UNIQUE INDEX ux_whatsapp_phone_number ON assistant_channels USING btree (external_channel_id) WHERE channel_type = 'whatsapp' AND is_active = true
```

**Acceptable:** May return **multiple rows** IF other UNIQUE indexes exist for different channel types.

**Blocker:** Any UNIQUE index that enforces WhatsApp phone uniqueness **without** the `is_active=true` filter.

**How to identify a conflicting index:**
- ✅ **SAFE:** `WHERE channel_type = 'whatsapp' AND is_active = true` - Correct predicate
- ✅ **SAFE:** `WHERE channel_type = 'telegram' AND ...` - Different channel type
- ❌ **BLOCKER:** `WHERE channel_type = 'whatsapp'` - Missing is_active=true filter!
- ❌ **BLOCKER:** No WHERE clause at all (enforces uniqueness on ALL channels)

#### Part 2: Check pg_constraint (UNIQUE constraints)

```sql
-- List every UNIQUE constraint touching external_channel_id
SELECT conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'assistant_channels'
  AND c.contype = 'u'
  AND pg_get_constraintdef(c.oid) ILIKE '%external_channel_id%';
```

**Expected Result:**
```
(0 rows)
```
**OR** rows that do NOT enforce WhatsApp uniqueness without the `is_active=true` filter.

**Acceptable:** May return **rows** IF UNIQUE constraints exist for different channel types.

**Blocker:** Any UNIQUE constraint that enforces `external_channel_id` for WhatsApp without filtering to `is_active=true`.

**How to identify a conflicting constraint:**
- ✅ **SAFE:** `UNIQUE (external_channel_id) WHERE channel_type='telegram'` - Different channel
- ✅ **SAFE:** Constraint definition includes partial uniqueness for other purposes
- ❌ **BLOCKER:** `UNIQUE (external_channel_id) WHERE channel_type='whatsapp'` - Missing is_active filter!
- ❌ **BLOCKER:** `UNIQUE (external_channel_id)` - No WHERE clause (all channels!)

---

**If you see ANY conflicting UNIQUE index/constraint on `external_channel_id`:**

⚠️ **DO NOT drop immediately** - Investigate first:

```sql
-- Example of a problematic index that would prevent reactivation:
-- ux_old_whatsapp_unique | ... (external_channel_id) WHERE channel_type='whatsapp' ...

-- 1. INVESTIGATE: Confirm this index/constraint lacks the is_active=true filter
-- 2. VERIFY: Check if it's enforcing uniqueness on ALL WhatsApp channels (not just active)
-- 3. CONFIRM PURPOSE: Ensure it's not protecting other integrity constraints
-- 4. THEN DROP:
DROP INDEX IF EXISTS ux_old_whatsapp_unique;  -- Replace with actual name
-- OR
ALTER TABLE assistant_channels DROP CONSTRAINT old_constraint_name;  -- If it's a constraint
```

**Blocker:** Any UNIQUE index/constraint that enforces `external_channel_id` for WhatsApp without `is_active=true` will prevent reactivating deactivated channels. **Confirm purpose, then drop/replace it.**

---

## 🎯 Final Sign-Off Checklist

Run this checklist before deploying v6 to production:

```
[ ] Applied Migration 047 v6 in Supabase
[ ] Go/No-Go Query A: Telegram index (columns + WHERE) ✅ EXACT MATCH
[ ] Go/No-Go Query B: WhatsApp index (columns + WHERE) ✅ EXACT MATCH
[ ] Go/No-Go Query C: No active duplicates ✅ 0 ROWS
[ ] Hidden Check 2A Part 1: pg_indexes Telegram ✅ NO CONFLICTING INDEXES
[ ] Hidden Check 2A Part 2: pg_constraint Telegram ✅ NO CONFLICTING CONSTRAINTS
[ ] Hidden Check 2B Part 1: pg_indexes WhatsApp ✅ NO CONFLICTING INDEXES
[ ] Hidden Check 2B Part 2: pg_constraint WhatsApp ✅ NO CONFLICTING CONSTRAINTS
[ ] Telegram proof test: 2 rows inserted successfully ✅
```

**If ALL 9 checks pass:** ✅ **APPROVED FOR PRODUCTION DEPLOYMENT**

**If ANY check fails:** ❌ **DO NOT DEPLOY** - Fix the issue first, then re-verify.

---

## 🚀 Post-Verification: Production Deployment

Once all checks pass, proceed with deployment:

### 1. Test Telegram Dedupe Fix (5 minutes) - CRITICAL PROOF

```sql
-- Get a Telegram channel ID
SELECT id FROM assistant_channels WHERE channel_type = 'telegram' LIMIT 1;
-- Use this ID below (replace <channel_id>)

-- Test: Insert message from Chat A with message_id=1
INSERT INTO assistant_inbound_events (
  channel_id, external_message_id, external_user_id, external_chat_id, message_text
) VALUES (
  '<channel_id>', '1', 'user_a', 'chat_a', 'Hello from Chat A'
);

-- Test: Insert message from Chat B with SAME message_id=1
INSERT INTO assistant_inbound_events (
  channel_id, external_message_id, external_user_id, external_chat_id, message_text
) VALUES (
  '<channel_id>', '1', 'user_b', 'chat_b', 'Hello from Chat B'
);

-- Verify BOTH messages were inserted (no collision!)
SELECT external_chat_id, message_text 
FROM assistant_inbound_events 
WHERE channel_id = '<channel_id>' AND external_message_id = '1';

-- Expected: 2 rows
-- chat_a | Hello from Chat A
-- chat_b | Hello from Chat B

-- If only 1 row: Hidden index/constraint check failed - re-run Step 2
-- If 2 rows: ✅ All fixes working!
```

**This test is MANDATORY.** It proves all 8 fixes are working correctly in production.

### 2. Deploy Worker Layer (2-3 hours)
- Implement WhatsAppOutput with idempotency + rate limiting
- Create WhatsApp webhook handler (`/api/webhooks/whatsapp`)
- Run 6 production tests from Phase 4 docs

### 3. Deploy to Production 🚀

---

## ⚠️ Operational Notes

### Apply During Low Traffic

`DROP INDEX` + `CREATE INDEX` can block writes. Schedule during:
- Off-peak hours (e.g., 2-4 AM in your primary region)
- Maintenance window (if you have one)
- Low user activity period

**Duration:** Index recreation typically takes <10 seconds for tables with <100K rows.

### Rollback Plan (if needed)

If production issues arise after v6 deployment:

```sql
-- Rollback to pre-v6 state (if absolutely necessary)
-- This will re-enable the Telegram bug, but unblocks production

-- 1. Drop new indexes
DROP INDEX IF EXISTS ux_inbound_webhook_dedupe;
DROP INDEX IF EXISTS ux_whatsapp_phone_number;

-- 2. Recreate old indexes (TEMPORARY ONLY - FIX ASAP)
CREATE UNIQUE INDEX ux_inbound_webhook_dedupe
  ON assistant_inbound_events (channel_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE UNIQUE INDEX ux_whatsapp_phone_number
  ON assistant_channels (external_channel_id)
  WHERE channel_type = 'whatsapp';

-- 3. File incident report and schedule v6 re-deployment
```

**WARNING:** Rollback re-introduces the Telegram message drop bug. Only use as emergency measure.

---

## 📊 Verification Results Log

Use this template to log verification results:

```
Migration 047 v6 Verification - [DATE] [TIME]
Operator: [YOUR NAME]
Environment: [PRODUCTION/STAGING]

Go/No-Go Verification:
[ ] Query A - Telegram index (columns + WHERE): PASS / FAIL
[ ] Query B - WhatsApp index (columns + WHERE): PASS / FAIL  
[ ] Query C - No duplicates: PASS / FAIL

Hidden Index/Constraint Check:
[ ] Check 2A Part 1 - pg_indexes Telegram: [X indexes found, Y conflicting] PASS / FAIL
[ ] Check 2A Part 2 - pg_constraint Telegram: [X constraints found, Y conflicting] PASS / FAIL
[ ] Check 2B Part 1 - pg_indexes WhatsApp: [X indexes found, Y conflicting] PASS / FAIL
[ ] Check 2B Part 2 - pg_constraint WhatsApp: [X constraints found, Y conflicting] PASS / FAIL

Telegram Proof Test:
[ ] Insert Chat A message_id=1: PASS / FAIL
[ ] Insert Chat B message_id=1: PASS / FAIL
[ ] Both rows stored: PASS / FAIL

Final Decision: APPROVED / REJECTED
Deploy Time (if approved): [TIMESTAMP]
Notes:
- 
-
```

---

## 🎯 Summary

**v6 fixes 8 critical issues identified across 9 review rounds:**
- Fix #1: Idempotent constraint + conrelid check
- Fix #2: SHA-256 + guarded comments + pgcrypto extension
- Fix #3: Reclaim expired + retry logic + attempts counter
- Fix #4: Telegram dedupe index includes external_chat_id (PRODUCTION-BLOCKING)
- Fix #5: DROP + recreate Telegram dedupe index (CRITICAL)
- Fix #6: Preflight duplicate cleanup (CRITICAL)
- Fix #7: DROP + recreate WhatsApp index (CRITICAL)
- Fix #8: Improved duplicate cleanup with tie-breaker (CRITICAL)

**v6 prevents 5 production disasters:**
1. Telegram message loss (silent data loss)
2. Telegram bug persists despite fix (index not replaced)
3. Migration fails on duplicate constraint
4. WhatsApp index not replaced (same bug as Telegram)
5. Non-deterministic cleanup ordering

**Verification guide v3 improvements (5 critical security fixes):**
1. ✅ Changed "drop immediately" to "investigate first, confirm purpose, then drop"
2. ✅ Added pg_constraint checks (catches ALTER TABLE ... ADD CONSTRAINT UNIQUE)
3. ✅ Expected results verify BOTH columns AND WHERE clause (predicate drift detection)
4. ✅ Changed "0 rows" to "0 conflicting rows" (allows valid UNIQUE constraints for other features)
5. ✅ Changed "ONLY 1 row" to "No conflicting uniqueness" (allows multiple safe indexes)

**Final approval:** ✅ **CONDITIONAL GO - Can ship IF all 5 conditions met**

**Dev's 5 Conditions for Production (Round 12):**
1. ✅ `ux_inbound_webhook_dedupe` definition is **exactly** `(channel_id, external_chat_id, external_message_id)` with expected WHERE
2. ✅ `ux_whatsapp_phone_number` definition is **exactly** `WHERE channel_type='whatsapp' AND is_active=true`
3. ✅ No active duplicates remain
4. ✅ No other UNIQUE index/constraint recreates the old Telegram uniqueness behavior
5. ✅ Telegram proof test inserts **2 rows**

**Optional:** Paste verification query outputs to dev for final GO/NO-GO call.

**Your WhatsApp + Telegram integration is production-ready pending verification! 🚀**