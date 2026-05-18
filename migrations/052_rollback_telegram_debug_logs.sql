-- ============================================================================
-- Migration 052: Rollback Telegram Debug Logs
--
-- Purpose:
-- - Remove assistant_telegram_debug_logs table and related objects
-- - Rollback migration 051
-- ============================================================================

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can read telegram debug logs for their organizations"
  ON assistant_telegram_debug_logs;

-- Drop indexes
DROP INDEX IF EXISTS idx_assistant_telegram_debug_logs_assistant_created;
DROP INDEX IF EXISTS idx_assistant_telegram_debug_logs_org_created;

-- Revoke grants
REVOKE SELECT, INSERT ON assistant_telegram_debug_logs FROM service_role;

-- Drop table
DROP TABLE IF EXISTS assistant_telegram_debug_logs;