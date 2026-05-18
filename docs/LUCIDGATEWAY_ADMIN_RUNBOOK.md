# LucidGateway Admin Runbook

## Overview

This runbook provides failure handling procedures and reconciliation SQL snippets for LucidGateway key management operations. Use these procedures when supporting users experiencing key-related issues.

---

## Common Failure Scenarios

### Scenario 1: Key Creation Fails Halfway

**Symptoms:**
- Key created in LucidGateway backend but not recorded in Supabase
- User sees error but key actually exists upstream
- Duplicate key creation attempts fail with "key alias already exists"

**Diagnosis SQL:**
```sql
-- Check if key exists in our DB
SELECT * FROM org_lucidgateway_keys 
WHERE key_alias = 'YOUR_KEY_ALIAS' 
AND org_id = 'YOUR_ORG_ID';

-- Check audit trail for failed creation attempts
SELECT * FROM org_lucidgateway_key_audit_events 
WHERE org_id = 'YOUR_ORG_ID' 
AND event_type = 'error'
AND metadata->>'endpoint' = '/api/orgs/[id]/lucidgateway-keys'
ORDER BY created_at DESC 
LIMIT 10;
```

**Recovery:**
1. Verify key exists in LucidGateway by attempting a test call with the virtual key
2. If key works but is missing from DB, manually insert the record:
   ```sql
   INSERT INTO org_lucidgateway_keys (
     org_id, 
     key_alias, 
     key_preview, 
     lucidgateway_key_id,
     is_active, 
     status, 
     created_by
   ) VALUES (
     'YOUR_ORG_ID',
     'YOUR_KEY_ALIAS',
     'sk-...', -- first 6 + last 4 chars
     'LUCIDGATEWAY_KEY_ID', -- from LucidGateway response
     true,
     'active',
     'USER_ID'
   );
   
   -- Log manual creation event
   INSERT INTO org_lucidgateway_key_audit_events (
     org_id,
     key_id,
     event_type,
     actor_user_id,
     metadata
   ) VALUES (
     'YOUR_ORG_ID',
     (SELECT id FROM org_lucidgateway_keys WHERE key_alias = 'YOUR_KEY_ALIAS'),
     'manual_creation',
     'ADMIN_USER_ID',
     '{"reason": "Failed creation recovery", "original_user": "USER_ID"}'::jsonb
   );
   ```
3. If key doesn't work, delete from LucidGateway and retry creation

---

### Scenario 2: Rotation Fails Halfway

**Symptoms:**
- New key created, old key not deactivated
- Audit trail shows `rotation_started` but no `rotation_completed`
- Both keys appear active

**Diagnosis SQL:**
```sql
-- Find stuck rotations
SELECT 
  ke.id AS event_id,
  ke.key_id,
  k.key_alias,
  k.status,
  k.is_active,
  ke.created_at,
  ke.metadata
FROM org_lucidgateway_key_audit_events ke
JOIN org_lucidgateway_keys k ON k.id = ke.key_id
WHERE ke.org_id = 'YOUR_ORG_ID'
  AND ke.event_type = 'rotation_started'
  AND NOT EXISTS (
    SELECT 1 FROM org_lucidgateway_key_audit_events ke2
    WHERE ke2.key_id = ke.key_id
      AND ke2.event_type IN ('rotation_completed', 'rotation_failed')
      AND ke2.created_at > ke.created_at
  )
ORDER BY ke.created_at DESC;
```

**Recovery:**
1. Determine which key is the new one (check `rotateToAlias` in metadata)
2. Verify new key works with test call
3. If new key works, deactivate old key:
   ```sql
   -- Deactivate old key
   UPDATE org_lucidgateway_keys 
   SET 
     is_active = false, 
     status = 'rotated',
     metadata = metadata || jsonb_build_object(
       'rotatedAt', NOW()::text,
       'rotatedBy', 'ADMIN_USER_ID',
       'manualRecovery', true
     )
   WHERE id = 'OLD_KEY_ID';
   
   -- Log completion event
   INSERT INTO org_lucidgateway_key_audit_events (
     org_id, key_id, event_type, actor_user_id, metadata
   ) VALUES (
     'YOUR_ORG_ID',
     'OLD_KEY_ID',
     'rotation_completed',
     'ADMIN_USER_ID',
     '{"manual_recovery": true, "rotatedToKeyId": "NEW_KEY_ID"}'::jsonb
   );
   ```
4. If new key doesn't work, revert rotation:
   ```sql
   -- Delete failed new key
   DELETE FROM org_lucidgateway_keys WHERE id = 'NEW_KEY_ID';
   
   -- Log failure
   INSERT INTO org_lucidgateway_key_audit_events (
     org_id, key_id, event_type, actor_user_id, metadata
   ) VALUES (
     'YOUR_ORG_ID',
     'OLD_KEY_ID',
     'rotation_failed',
     'ADMIN_USER_ID',
     '{"manual_recovery": true, "reason": "New key validation failed"}'::jsonb
   );
   ```

---

### Scenario 3: Orphaned Keys (LucidGateway but not in Supabase)

**Symptoms:**
- Key exists in LucidGateway but not in our database
- User can use key but it doesn't show in UI

**Diagnosis:**
- Requires access to LucidGateway admin API
- Check LucidGateway `/keys/list` for keys with `org_id` metadata matching the org
- Cross-reference with Supabase records

**Recovery SQL:**
```sql
-- Manually add orphaned key to DB
INSERT INTO org_lucidgateway_keys (
  org_id, key_alias, key_preview, lucidgateway_key_id,
  rpm_limit, tpm_limit, max_budget, budget_duration,
  models, is_active, status, created_by, metadata
) VALUES (
  'YOUR_ORG_ID',
  'ORPHANED_KEY_ALIAS',
  'sk-XXXX...YYYY',
  'LUCIDGATEWAY_KEY_ID',
  1000, -- from LucidGateway
  50000, -- from LucidGateway
  100.00, -- from LucidGateway
  '1mo', -- from LucidGateway
  ARRAY['gpt-4o', 'claude-opus-4'], -- from LucidGateway
  true,
  'active',
  'UNKNOWN_USER_ID',
  '{"recovered": true, "recovered_at": "2026-02-10T14:00:00Z"}'::jsonb
);
```

---

### Scenario 4: Zombie Keys (Supabase but deleted from LucidGateway)

**Symptoms:**
- Key shows as active in UI but returns 401/403 errors
- LucidGateway reports "key not found"

**Diagnosis SQL:**
```sql
-- Find potentially zombie keys (active but old)
SELECT 
  id, key_alias, key_preview, is_active, status, created_at,
  (NOW() - created_at) AS age
FROM org_lucidgateway_keys
WHERE org_id = 'YOUR_ORG_ID'
  AND is_active = true
  AND created_at < NOW() - INTERVAL '90 days'
ORDER BY created_at ASC;
```

**Recovery:**
1. Verify key is actually dead by attempting a test call
2. If dead, mark as revoked:
   ```sql
   UPDATE org_lucidgateway_keys 
   SET 
     is_active = false, 
     status = 'revoked',
     revoked_at = NOW(),
     metadata = metadata || '{"zombie_recovery": true}'::jsonb
   WHERE id = 'ZOMBIE_KEY_ID';
   
   -- Log revocation
   INSERT INTO org_lucidgateway_key_audit_events (
     org_id, key_id, event_type, actor_user_id, metadata
   ) VALUES (
     'YOUR_ORG_ID',
     'ZOMBIE_KEY_ID',
     'revoked',
     'ADMIN_USER_ID',
     '{"reason": "Zombie key cleanup", "manual_recovery": true}'::jsonb
   );
   ```

---

### Scenario 5: Idempotency Key Collision

**Symptoms:**
- User retries key creation, gets back wrong key
- Idempotency check returns key from different operation

**Diagnosis SQL:**
```sql
-- Find all operations with given idempotency key
SELECT 
  ae.id AS audit_id,
  ae.key_id,
  k.key_alias,
  ae.event_type,
  ae.created_at,
  ae.metadata->>'idempotencyKey' AS idempotency_key
FROM org_lucidgateway_key_audit_events ae
LEFT JOIN org_lucidgateway_keys k ON k.id = ae.key_id
WHERE ae.org_id = 'YOUR_ORG_ID'
  AND ae.metadata->>'idempotencyKey' = 'IDEMPOTENCY_KEY'
ORDER BY ae.created_at ASC;
```

**Recovery:**
- Idempotency keys should be unique per operation attempt
- If collision detected, investigate client-side UUID generation
- Clear invalid audit event metadata if needed:
  ```sql
  UPDATE org_lucidgateway_key_audit_events
  SET metadata = metadata - 'idempotencyKey'
  WHERE id = 'AUDIT_EVENT_ID';
  ```

---

## Bulk Operations

### Bulk Status Correction

```sql
-- Mark all inactive keys as 'inactive' status (if currently showing 'active')
UPDATE org_lucidgateway_keys
SET status = 'inactive'
WHERE is_active = false 
  AND status = 'active'
  AND org_id = 'YOUR_ORG_ID';
```

### Find All Active Keys Older Than 180 Days

```sql
SELECT 
  org_id, key_alias, created_at, 
  (NOW() - created_at) AS age,
  COALESCE((metadata->>'rotatedAt')::text, 'never') AS last_rotation
FROM org_lucidgateway_keys
WHERE is_active = true
  AND created_at < NOW() - INTERVAL '180 days'
ORDER BY created_at ASC;
```

### Audit Trail Summary for Org

```sql
SELECT 
  event_type, 
  COUNT(*) AS event_count,
  MIN(created_at) AS first_event,
  MAX(created_at) AS last_event
FROM org_lucidgateway_key_audit_events
WHERE org_id = 'YOUR_ORG_ID'
GROUP BY event_type
ORDER BY event_count DESC;
```

---

## Escalation

If none of these procedures resolve the issue:

1. **Check LucidGateway Status:**
   - Verify `LUCIDGATEWAY_PROXY_URL` is reachable
   - Check `LUCIDGATEWAY_MASTER_KEY` is valid
   - Review LucidGateway logs for errors

2. **Check Supabase RLS Policies:**
   ```sql
   -- Verify RLS is allowing access
   SELECT * FROM org_lucidgateway_keys WHERE org_id = 'YOUR_ORG_ID';
   -- Run as the affected user's role
   ```

3. **Contact Backend Team:**
   - Provide org_id, user_id, key_alias
   - Include relevant audit event IDs
   - Share error logs from Sentry

---

## Monitoring Queries

### Keys Created in Last 24 Hours

```sql
SELECT org_id, key_alias, created_by, created_at
FROM org_lucidgateway_keys
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Failed Operations in Last 24 Hours

```sql
SELECT 
  org_id, 
  event_type, 
  metadata->>'error' AS error_message,
  created_at
FROM org_lucidgateway_key_audit_events
WHERE event_type = 'error'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Rotation Success Rate (Last 30 Days)

```sql
WITH rotation_attempts AS (
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'rotation_started') AS started,
    COUNT(*) FILTER (WHERE event_type = 'rotation_completed') AS completed,
    COUNT(*) FILTER (WHERE event_type = 'rotation_failed') AS failed
  FROM org_lucidgateway_key_audit_events
  WHERE created_at > NOW() - INTERVAL '30 days'
)
SELECT 
  started,
  completed,
  failed,
  ROUND((completed::numeric / NULLIF(started, 0)) * 100, 2) AS success_rate_pct
FROM rotation_attempts;
```

---

## Security Notes

- Never log actual virtual keys in audit events or support tickets
- Only log key previews (first 6 + last 4 characters)
- Redact sensitive metadata fields before sharing with users
- All manual interventions should be logged in audit events with `manual_recovery: true`

---

## Version History

- **2026-02-10:** Initial version covering key creation, rotation, and reconciliation scenarios