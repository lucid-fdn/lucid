-- Migration 064: Encryption invariants (CHECK constraints) + get_recent_memories_v2 RPC
-- Phase 1B P0: Ensures encrypted rows never have content=plaintext and vice versa.
-- Also adds get_recent_memories_v2 for encrypted memory retrieval.
-- See docs/OPENCLAW_AUDIT_PLAN_V3.md Fix #1 + Fix #6

-- ============================================================================
-- 1. ENCRYPTION INVARIANTS — CHECK constraints
-- ============================================================================

-- assistant_messages: Enforce that encrypted rows have all crypto fields and content=NULL
ALTER TABLE assistant_messages ADD CONSTRAINT chk_msg_encryption_invariant CHECK (
  (encryption_mode = 'NONE' AND content IS NOT NULL AND content_encrypted IS NULL)
  OR
  (encryption_mode IN ('APP_LAYER','ENCLAVE') AND content IS NULL
   AND content_encrypted IS NOT NULL AND content_iv IS NOT NULL
   AND content_auth_tag IS NOT NULL AND key_id IS NOT NULL)
) NOT VALID;

-- Validate separately (allows backfill of any violating rows first)
ALTER TABLE assistant_messages VALIDATE CONSTRAINT chk_msg_encryption_invariant;

-- assistant_memory: Same invariant pattern
ALTER TABLE assistant_memory ADD CONSTRAINT chk_mem_encryption_invariant CHECK (
  (encryption_mode = 'NONE' AND content IS NOT NULL AND content_encrypted IS NULL)
  OR
  (encryption_mode IN ('APP_LAYER','ENCLAVE') AND content IS NULL
   AND content_encrypted IS NOT NULL AND content_iv IS NOT NULL
   AND content_auth_tag IS NOT NULL AND key_id IS NOT NULL)
) NOT VALID;

ALTER TABLE assistant_memory VALIDATE CONSTRAINT chk_mem_encryption_invariant;

-- ============================================================================
-- 2. get_recent_memories_v2 — Returns encrypted payload fields for decryption
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recent_memories_v2(
  p_assistant_id UUID,
  p_scoped_user_id TEXT,
  p_limit INT DEFAULT 10
) RETURNS TABLE (
  id UUID,
  content TEXT,
  content_encrypted TEXT,
  content_iv TEXT,
  content_auth_tag TEXT,
  encryption_mode TEXT,
  key_id TEXT,
  category TEXT,
  importance FLOAT
) AS $$
  SELECT id, content, content_encrypted, content_iv, content_auth_tag,
         encryption_mode, key_id, category, importance::FLOAT
  FROM assistant_memory
  WHERE assistant_id = p_assistant_id
    AND scoped_user_id = p_scoped_user_id
  ORDER BY last_accessed_at DESC NULLS LAST
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_recent_memories_v2 IS
  'Returns recent memories with encrypted payload fields for client-side decryption. See docs/OPENCLAW_AUDIT_PLAN_V3.md Fix #6';

-- ============================================================================
-- 3. Add run_id column to usage records for audit spine (Fix #7)
-- ============================================================================

ALTER TABLE assistant_usage_records
  ADD COLUMN IF NOT EXISTS run_id UUID;

CREATE INDEX IF NOT EXISTS idx_usage_records_run_id
  ON assistant_usage_records(run_id)
  WHERE run_id IS NOT NULL;

COMMENT ON COLUMN assistant_usage_records.run_id IS
  'Stable UUID linking logs → usage → tools → billing for a single request. See OPENCLAW_AUDIT_PLAN_V3.md Fix #7';