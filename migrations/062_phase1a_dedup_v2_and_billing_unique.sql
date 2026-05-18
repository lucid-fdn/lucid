-- Migration 062: Phase 1A v2.2 — Dedup 4-column key + billing idempotency
-- See docs/OPENCLAW_INTEGRATION_SPEC.md §5.3, §5.7 (v2.2)
--
-- Changes:
--   1. assistant_inbound_dedup: Add tenant_key, channel_type, external_chat_id columns
--      and replace old 2-column UNIQUE with 4-column UNIQUE
--   2. assistant_usage_records: Add UNIQUE(tenant_key, message_id) for exactly-once billing

-- ============================================================================
-- 1. DEDUP TABLE: Add new columns + replace UNIQUE constraint
-- ============================================================================

-- Add new columns (nullable first for backfill safety)
ALTER TABLE assistant_inbound_dedup
  ADD COLUMN IF NOT EXISTS tenant_key TEXT,
  ADD COLUMN IF NOT EXISTS channel_type TEXT,
  ADD COLUMN IF NOT EXISTS external_chat_id TEXT;

-- Backfill existing rows from channel join (best-effort)
UPDATE assistant_inbound_dedup d
SET
  channel_type = COALESCE(c.channel_type, 'unknown'),
  external_chat_id = COALESCE(c.external_channel_id, 'unknown'),
  tenant_key = COALESCE(a.org_id::TEXT, '__global__') || ':default:default'
FROM assistant_channels c
LEFT JOIN ai_assistants a ON a.id = c.assistant_id
WHERE d.channel_id = c.id
  AND d.tenant_key IS NULL;

-- Set defaults for any rows that couldn't be joined
UPDATE assistant_inbound_dedup
SET
  tenant_key = COALESCE(tenant_key, '__global__:default:default'),
  channel_type = COALESCE(channel_type, 'unknown'),
  external_chat_id = COALESCE(external_chat_id, 'unknown')
WHERE tenant_key IS NULL OR channel_type IS NULL OR external_chat_id IS NULL;

-- Now make columns NOT NULL
ALTER TABLE assistant_inbound_dedup
  ALTER COLUMN tenant_key SET NOT NULL,
  ALTER COLUMN channel_type SET NOT NULL,
  ALTER COLUMN external_chat_id SET NOT NULL;

-- Make channel_id optional (it's kept for FK join but not part of dedup key)
ALTER TABLE assistant_inbound_dedup
  ALTER COLUMN channel_id DROP NOT NULL;

-- Drop old 2-column unique constraint
-- (constraint name may vary — try both common patterns)
DO $$
BEGIN
  -- Try the auto-generated name
  ALTER TABLE assistant_inbound_dedup
    DROP CONSTRAINT IF EXISTS assistant_inbound_dedup_channel_id_external_message_id_key;
  -- Try alternate name pattern
  ALTER TABLE assistant_inbound_dedup
    DROP CONSTRAINT IF EXISTS assistant_inbound_dedup_unique;
EXCEPTION WHEN undefined_object THEN
  NULL; -- Already dropped
END $$;

-- Create new 4-column unique constraint (spec v2.2)
-- This prevents false dedup across chats on channels where message_id is per-chat
ALTER TABLE assistant_inbound_dedup
  ADD CONSTRAINT uq_dedup_tenant_channel_chat_msg
    UNIQUE(tenant_key, channel_type, external_chat_id, external_message_id);

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_inbound_dedup_tenant
  ON assistant_inbound_dedup(tenant_key, channel_type);

-- Update table comment
COMMENT ON TABLE assistant_inbound_dedup IS
  'Deduplication guard for inbound webhook messages. 4-column UNIQUE key: (tenant_key, channel_type, external_chat_id, external_message_id). TTL: 24h. See docs/OPENCLAW_INTEGRATION_SPEC.md §5.3 v2.2';

-- ============================================================================
-- 2. USAGE RECORDS: Exactly-once billing invariant
-- ============================================================================

-- Create usage_records table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS assistant_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  message_id UUID,
  org_id TEXT,
  assistant_id UUID,
  conversation_id UUID,
  model TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  llm_calls INTEGER DEFAULT 1,
  tool_calls INTEGER DEFAULT 0,
  wall_time_ms INTEGER DEFAULT 0,
  is_agent_loop BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly-once billing: prevent double-charging for same tenant+message
-- Only add if the table has a message_id column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_usage_records' AND column_name = 'message_id'
  ) THEN
    -- Create unique constraint (idempotent via IF NOT EXISTS pattern)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'uq_usage_tenant_message'
    ) THEN
      ALTER TABLE assistant_usage_records
        ADD CONSTRAINT uq_usage_tenant_message
          UNIQUE(tenant_key, message_id);
    END IF;
  END IF;
END $$;

-- Index for billing queries
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_created
  ON assistant_usage_records(tenant_key, created_at DESC);

COMMENT ON TABLE assistant_usage_records IS
  'Token usage tracking for billing. UNIQUE(tenant_key, message_id) prevents double-charging. See docs/OPENCLAW_INTEGRATION_SPEC.md §5.7 v2.2';