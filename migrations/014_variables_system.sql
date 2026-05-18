-- ============================================================================
-- Migration 014: Workflow Variables System
-- Description: Add variables support for workflows
-- Version: 1.0
-- Date: 2025-01-17
-- ============================================================================

-- Create workflow variables table
CREATE TABLE IF NOT EXISTS workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'secret')),
  is_secret BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT unique_workflow_variable UNIQUE(workflow_id, key)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_variables_workflow ON workflow_variables(workflow_id);
CREATE INDEX IF NOT EXISTS idx_variables_key ON workflow_variables(workflow_id, key);

-- Enable RLS
ALTER TABLE workflow_variables ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_variables
-- Users can view variables for workflows in their organizations
CREATE POLICY "Users can view variables in their orgs"
  ON workflow_variables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_variables.workflow_id
      AND om.user_id = auth.uid()
    )
  );

-- Users can create variables for workflows in their orgs (editor+ role)
CREATE POLICY "Editors can create variables"
  ON workflow_variables FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_variables.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- Users can update variables in their orgs (editor+ role)
CREATE POLICY "Editors can update variables"
  ON workflow_variables FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_variables.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- Users can delete variables in their orgs (editor+ role)
CREATE POLICY "Editors can delete variables"
  ON workflow_variables FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_variables.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_variable_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER variable_updated_at
  BEFORE UPDATE ON workflow_variables
  FOR EACH ROW
  EXECUTE FUNCTION update_variable_updated_at();

-- Create trigger to set is_secret based on type
CREATE OR REPLACE FUNCTION update_variable_is_secret()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'secret' THEN
    NEW.is_secret = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER variable_is_secret
  BEFORE INSERT OR UPDATE ON workflow_variables
  FOR EACH ROW
  EXECUTE FUNCTION update_variable_is_secret();

-- Add comment
COMMENT ON TABLE workflow_variables IS 'Stores reusable variables for workflows - can be referenced in nodes using {{$vars.key}}';
COMMENT ON COLUMN workflow_variables.key IS 'Variable name - used as {{$vars.key}} in nodes';
COMMENT ON COLUMN workflow_variables.value IS 'Variable value - stored as text, converted to type at execution';
COMMENT ON COLUMN workflow_variables.type IS 'Variable type: string, number, boolean, or secret';
COMMENT ON COLUMN workflow_variables.is_secret IS 'Whether the variable contains sensitive data (auto-set for secret type)';
