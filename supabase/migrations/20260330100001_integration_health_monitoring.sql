-- Migration: Integration Health Monitoring
-- Adds RPC for passive health tracking + index for expiry prediction cron.
-- Uses existing `notifications` table for user alerts (no new notification table needed).

-- =============================================================================
-- RPC: update_connection_health
-- Called by worker on 401/403 and by webhook handler on token refresh failure.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_connection_health(
  p_connection_id TEXT,
  p_status TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE org_integration_connections
  SET
    status = p_status,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_error_code', p_error_code,
      'last_error_message', p_error_message,
      'last_error_at', now()
    ),
    disconnected_at = CASE WHEN p_status != 'active' THEN COALESCE(disconnected_at, now()) ELSE NULL END
  WHERE connection_id = p_connection_id
    AND status = 'active';  -- Only downgrade active connections, never re-flag already broken ones
END;
$$;

COMMENT ON FUNCTION update_connection_health IS 'Passive health tracking: downgrades active connections on auth errors (401/403) or token refresh failures. Fire-and-forget from worker.';

-- =============================================================================
-- RPC: restore_connection_health
-- Called on successful reconnection (webhook creation event).
-- =============================================================================

CREATE OR REPLACE FUNCTION restore_connection_health(
  p_connection_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE org_integration_connections
  SET
    status = 'active',
    disconnected_at = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'restored_at', now()
    )
  WHERE connection_id = p_connection_id
    AND status IN ('expired', 'revoked', 'error');
END;
$$;

COMMENT ON FUNCTION restore_connection_health IS 'Restores a broken/expired connection to active after successful reconnection.';

-- =============================================================================
-- Index: efficient expiry prediction queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_oic_expiring
  ON org_integration_connections (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

COMMENT ON INDEX idx_oic_expiring IS 'Supports daily cron query: find active connections expiring within N days.';

-- =============================================================================
-- Grant service role access to new RPCs
-- =============================================================================

GRANT EXECUTE ON FUNCTION update_connection_health TO service_role;
GRANT EXECUTE ON FUNCTION restore_connection_health TO service_role;
