-- ============================================================================
-- Workflow Version Control System
-- Phase 3C Week 2, Day 10
-- ============================================================================

-- Create workflow versions table
CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  pin_data JSONB,
  settings JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_auto_save BOOLEAN DEFAULT false,
  change_summary TEXT,
  CONSTRAINT unique_workflow_version UNIQUE(workflow_id, version_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_created ON workflow_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_number ON workflow_versions(workflow_id, version_number DESC);

-- Enable Row Level Security
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_versions

-- Users can view versions of their workflows
CREATE POLICY "Users can view own workflow versions"
  ON workflow_versions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Users can view versions of org workflows they have access to
CREATE POLICY "Users can view org workflow versions"
  ON workflow_versions FOR SELECT
  USING (
    workflow_id IN (
      SELECT w.id FROM workflows w
      JOIN organizations o ON w.organization_id = o.id
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Users can create versions of their workflows
CREATE POLICY "Users can create own workflow versions"
  ON workflow_versions FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Org members can create versions of org workflows
CREATE POLICY "Org members can create org workflow versions"
  ON workflow_versions FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT w.id FROM workflows w
      JOIN organizations o ON w.organization_id = o.id
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- Function to auto-increment version number
CREATE OR REPLACE FUNCTION get_next_version_number(p_workflow_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_max_version
  FROM workflow_versions
  WHERE workflow_id = p_workflow_id;
  
  RETURN v_max_version;
END;
$$ LANGUAGE plpgsql;

-- Function to create version snapshot
CREATE OR REPLACE FUNCTION create_workflow_version(
  p_workflow_id UUID,
  p_created_by UUID,
  p_is_auto_save BOOLEAN DEFAULT false,
  p_change_summary TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_version_id UUID;
  v_version_number INTEGER;
  v_workflow RECORD;
BEGIN
  -- Get current workflow state
  SELECT * INTO v_workflow
  FROM workflows
  WHERE id = p_workflow_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;
  
  -- Get next version number
  v_version_number := get_next_version_number(p_workflow_id);
  
  -- Create version
  INSERT INTO workflow_versions (
    workflow_id,
    version_number,
    name,
    description,
    nodes,
    edges,
    pin_data,
    settings,
    created_by,
    is_auto_save,
    change_summary
  )
  VALUES (
    p_workflow_id,
    v_version_number,
    v_workflow.name,
    v_workflow.description,
    v_workflow.nodes,
    v_workflow.edges,
    v_workflow.pin_data,
    v_workflow.settings,
    p_created_by,
    p_is_auto_save,
    p_change_summary
  )
  RETURNING id INTO v_version_id;
  
  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql;

-- Function to restore workflow from version
CREATE OR REPLACE FUNCTION restore_workflow_version(
  p_workflow_id UUID,
  p_version_id UUID,
  p_restored_by UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version RECORD;
BEGIN
  -- Get version data
  SELECT * INTO v_version
  FROM workflow_versions
  WHERE id = p_version_id
  AND workflow_id = p_workflow_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Update workflow with version data
  UPDATE workflows
  SET
    nodes = v_version.nodes,
    edges = v_version.edges,
    pin_data = v_version.pin_data,
    settings = v_version.settings,
    updated_at = now()
  WHERE id = p_workflow_id;
  
  -- Create new version marking the restore
  PERFORM create_workflow_version(
    p_workflow_id,
    p_restored_by,
    false,
    'Restored from version ' || v_version.version_number
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create versions on workflow updates (optional)
CREATE OR REPLACE FUNCTION auto_version_workflow()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version if nodes or edges changed
  IF (NEW.nodes::text IS DISTINCT FROM OLD.nodes::text) OR
     (NEW.edges::text IS DISTINCT FROM OLD.edges::text) THEN
    
    PERFORM create_workflow_version(
      NEW.id,
      NEW.user_id,
      true,  -- is_auto_save
      'Auto-saved version'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optionally enable auto-versioning (commented out by default)
-- CREATE TRIGGER workflow_auto_version
--   AFTER UPDATE ON workflows
--   FOR EACH ROW
--   EXECUTE FUNCTION auto_version_workflow();

-- Comments
COMMENT ON TABLE workflow_versions IS 'Version history for workflow changes';
COMMENT ON COLUMN workflow_versions.version_number IS 'Sequential version number starting from 1';
COMMENT ON COLUMN workflow_versions.is_auto_save IS 'True if auto-saved, false if manually saved';
COMMENT ON COLUMN workflow_versions.change_summary IS 'Optional description of changes';
COMMENT ON FUNCTION create_workflow_version IS 'Creates a new version snapshot of a workflow';
COMMENT ON FUNCTION restore_workflow_version IS 'Restores a workflow to a previous version';
