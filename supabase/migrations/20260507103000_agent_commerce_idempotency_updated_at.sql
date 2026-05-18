-- Migration: Agent Commerce idempotency timestamp repair.
-- Reconciliation RPCs mark expired/stuck idempotency rows and require updated_at.

ALTER TABLE agent_commerce_idempotency_keys
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
