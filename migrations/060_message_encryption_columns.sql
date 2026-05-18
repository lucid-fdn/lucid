-- Migration 060: Message Encryption Columns
-- Phase 1B: Encrypted Agent Foundations
-- See docs/OPENCLAW_INTEGRATION_SPEC.md §3.4

-- Add encryption columns to assistant_messages
ALTER TABLE assistant_messages
  ADD COLUMN IF NOT EXISTS content_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS content_iv TEXT,
  ADD COLUMN IF NOT EXISTS content_auth_tag TEXT,
  ADD COLUMN IF NOT EXISTS encryption_mode TEXT DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS key_id TEXT;

-- Add encryption columns to assistant_memory
ALTER TABLE assistant_memory
  ADD COLUMN IF NOT EXISTS content_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS content_iv TEXT,
  ADD COLUMN IF NOT EXISTS content_auth_tag TEXT,
  ADD COLUMN IF NOT EXISTS encryption_mode TEXT DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS key_id TEXT;

-- Invariant check: content XOR content_encrypted must be set
-- (enforced at application layer, documented here for auditing)
COMMENT ON COLUMN assistant_messages.encryption_mode IS
  'NONE = plaintext content column. APP_LAYER = encrypted via HKDF DEK. ENCLAVE = Phase 4 Nitro Enclave.';

COMMENT ON COLUMN assistant_memory.encryption_mode IS
  'NONE = plaintext content column. APP_LAYER = encrypted via HKDF DEK. Embeddings stay plaintext for vector search.';