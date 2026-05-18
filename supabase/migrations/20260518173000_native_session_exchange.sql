-- Native Privy handoff completion/exchange.
-- Web login completes the handoff, then the native app exchanges a one-time
-- token for the first device-bound access/refresh session.

ALTER TABLE native_session_handoffs
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS exchange_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS exchange_device_id UUID REFERENCES native_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exchanged_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS native_session_handoffs_exchange_hash_idx
  ON native_session_handoffs (exchange_token_hash)
  WHERE exchange_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS native_session_handoffs_exchange_pending_idx
  ON native_session_handoffs (id, status, expires_at)
  WHERE exchanged_at IS NULL;

COMMENT ON COLUMN native_session_handoffs.exchange_token_hash IS
  'Hash of the one-time token returned to the native app after web login completes.';
COMMENT ON COLUMN native_session_handoffs.exchanged_at IS
  'Set once the native app exchanges the handoff token for its first native_auth_sessions row.';
