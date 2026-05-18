-- Migration: n8n Integration
-- Version: 1.0.0
-- Date: 2025-10-17

-- Add n8n fields to workflows table
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS n8n_workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS n8n_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS n8n_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS node_type_versions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_heal_drift BOOLEAN DEFAULT false;

-- Index for n8n_workflow_id lookups
CREATE INDEX IF NOT EXISTS workflows_n8n_workflow_id_idx 
  ON workflows (n8n_workflow_id) 
  WHERE n8n_workflow_id IS NOT NULL;

-- Add n8n execution tracking
ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Indexes for execution lookups
CREATE INDEX IF NOT EXISTS workflow_executions_n8n_idx 
  ON workflow_executions (n8n_execution_id) 
  WHERE n8n_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_executions_idem_idx
  ON workflow_executions (workflow_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Unique constraint for idempotency
ALTER TABLE workflow_executions
  ADD CONSTRAINT uniq_workflow_idempotency 
  UNIQUE (workflow_id, idempotency_key);

-- Credential aliases for tenant isolation
CREATE TABLE IF NOT EXISTS n8n_credential_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  alias TEXT NOT NULL,
  n8n_credential_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uniq_tenant_alias UNIQUE (tenant_id, alias)
);

CREATE INDEX IF NOT EXISTS n8n_credential_aliases_tenant_idx 
  ON n8n_credential_aliases (tenant_id);

CREATE INDEX IF NOT EXISTS n8n_cred_aliases_lookup 
  ON n8n_credential_aliases (tenant_id, alias);

-- System versions for rollback tracking
CREATE TABLE IF NOT EXISTS system_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployed_at TIMESTAMPTZ DEFAULT now(),
  n8n_version TEXT NOT NULL,
  n8n_image_digest TEXT,
  node_registry_version TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  deployed_by TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS system_versions_active_idx 
  ON system_versions (active, deployed_at DESC);

-- Drift detection tracking
CREATE TABLE IF NOT EXISTS drift_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  our_hash TEXT NOT NULL,
  n8n_hash TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IN ('ours', 'theirs', 'manual_merge')),
  resolved_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS drift_conflicts_workflow_idx 
  ON drift_conflicts (workflow_id, detected_at DESC);

-- RLS policies for credential aliases
ALTER TABLE n8n_credential_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY n8n_credential_aliases_tenant_isolation 
  ON n8n_credential_aliases
  FOR ALL
  USING (
    tenant_id = auth.uid()::uuid 
    OR tenant_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Comments for documentation
COMMENT ON COLUMN workflows.n8n_workflow_id IS 'n8n internal workflow ID';
COMMENT ON COLUMN workflows.n8n_json IS 'Authoritative n8n workflow JSON';
COMMENT ON COLUMN workflows.content_hash IS 'SHA-256 hash for drift detection (semantic fields only)';
COMMENT ON COLUMN workflows.last_synced_at IS 'Last time workflow was pushed to n8n';
COMMENT ON COLUMN workflows.n8n_updated_at IS 'Last modification time from n8n API';
COMMENT ON COLUMN workflows.node_type_versions IS 'Per-node type version pins for compatibility';
COMMENT ON COLUMN workflows.auto_heal_drift IS 'Auto-push to n8n on drift detection';

COMMENT ON COLUMN workflow_executions.n8n_execution_id IS 'n8n execution ID for status tracking';
COMMENT ON COLUMN workflow_executions.idempotency_key IS 'Client-provided idempotency key for duplicate prevention';

COMMENT ON TABLE n8n_credential_aliases IS 'Maps tenant credential aliases to n8n credential names';
COMMENT ON TABLE system_versions IS 'Tracks n8n image versions and node registry versions for rollback';
COMMENT ON TABLE drift_conflicts IS 'Tracks detected workflow drift between our DB and n8n';
