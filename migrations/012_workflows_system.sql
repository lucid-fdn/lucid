-- =============================================
-- Workflow System Tables
-- Migration: 012_workflows_system
-- Description: Complete workflow management system with execution tracking
-- Created: 2025-10-17
-- =============================================

-- =============================================
-- 1. WORKFLOWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Basic Info
  name TEXT NOT NULL,
  description TEXT,
  
  -- Workflow Data (JSON)
  nodes JSONB DEFAULT '[]'::jsonb NOT NULL,
  edges JSONB DEFAULT '[]'::jsonb NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb NOT NULL,
  
  -- Pin Data for Testing
  pin_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  active BOOLEAN DEFAULT false,
  
  -- Tags
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Publishing
  published_at TIMESTAMPTZ,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  version_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT workflow_name_not_empty CHECK (length(trim(name)) > 0)
);

-- Indexes for workflows
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(active);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows USING GIN(tags);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflows_updated_at();

-- =============================================
-- 2. WORKFLOW_EXECUTIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Workflow reference
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Execution details
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'cancelled', 'waiting')),
  mode TEXT DEFAULT 'manual' CHECK (mode IN ('manual', 'trigger', 'webhook', 'test')),
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Results
  error TEXT,
  error_message TEXT,
  result JSONB,
  
  -- Execution data
  execution_data JSONB DEFAULT '{}'::jsonb,
  
  -- Triggered by
  triggered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for workflow_executions
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_triggered_by ON workflow_executions(triggered_by);

-- =============================================
-- 3. NODE_EXECUTION_DATA TABLE (for real-time tracking)
-- =============================================

CREATE TABLE IF NOT EXISTS node_execution_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Execution reference
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  
  -- Node details
  node_name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'success', 'error')),
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Data
  input_data JSONB,
  output_data JSONB,
  error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for node_execution_data
CREATE INDEX IF NOT EXISTS idx_node_execution_data_execution_id ON node_execution_data(execution_id);
CREATE INDEX IF NOT EXISTS idx_node_execution_data_status ON node_execution_data(status);
CREATE INDEX IF NOT EXISTS idx_node_execution_data_node_name ON node_execution_data(node_name);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_node_execution_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER node_execution_data_updated_at
  BEFORE UPDATE ON node_execution_data
  FOR EACH ROW
  EXECUTE FUNCTION update_node_execution_data_updated_at();

-- =============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_execution_data ENABLE ROW LEVEL SECURITY;

-- =============================================
-- WORKFLOWS RLS POLICIES
-- =============================================

-- Users can read their own workflows
CREATE POLICY "Users can read own workflows"
  ON workflows FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create workflows
CREATE POLICY "Users can create workflows"
  ON workflows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own workflows
CREATE POLICY "Users can update own workflows"
  ON workflows FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own workflows
CREATE POLICY "Users can delete own workflows"
  ON workflows FOR DELETE
  USING (auth.uid() = user_id);

-- Organization members can read org workflows
CREATE POLICY "Org members can read org workflows"
  ON workflows FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization admins/owners can update org workflows
CREATE POLICY "Org admins can update org workflows"
  ON workflows FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Organization admins/owners can delete org workflows
CREATE POLICY "Org admins can delete org workflows"
  ON workflows FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- =============================================
-- WORKFLOW_EXECUTIONS RLS POLICIES
-- =============================================

-- Users can read executions of their workflows
CREATE POLICY "Users can read own workflow executions"
  ON workflow_executions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Users can create executions for their workflows
CREATE POLICY "Users can create workflow executions"
  ON workflow_executions FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Users can update executions of their workflows
CREATE POLICY "Users can update workflow executions"
  ON workflow_executions FOR UPDATE
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Org members can read org workflow executions
CREATE POLICY "Org members can read org workflow executions"
  ON workflow_executions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows 
      WHERE organization_id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- =============================================
-- NODE_EXECUTION_DATA RLS POLICIES
-- =============================================

-- Users can read node execution data of their workflow executions
CREATE POLICY "Users can read own node execution data"
  ON node_execution_data FOR SELECT
  USING (
    execution_id IN (
      SELECT id FROM workflow_executions
      WHERE workflow_id IN (
        SELECT id FROM workflows WHERE user_id = auth.uid()
      )
    )
  );

-- Users can create/update node execution data for their workflows
CREATE POLICY "Users can create node execution data"
  ON node_execution_data FOR INSERT
  WITH CHECK (
    execution_id IN (
      SELECT id FROM workflow_executions
      WHERE workflow_id IN (
        SELECT id FROM workflows WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update node execution data"
  ON node_execution_data FOR UPDATE
  USING (
    execution_id IN (
      SELECT id FROM workflow_executions
      WHERE workflow_id IN (
        SELECT id FROM workflows WHERE user_id = auth.uid()
      )
    )
  );

-- Org members can read org node execution data
CREATE POLICY "Org members can read org node execution data"
  ON node_execution_data FOR SELECT
  USING (
    execution_id IN (
      SELECT id FROM workflow_executions
      WHERE workflow_id IN (
        SELECT id FROM workflows 
        WHERE organization_id IN (
          SELECT organization_id 
          FROM organization_members 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- =============================================
-- 5. HELPER FUNCTIONS
-- =============================================

-- Function to get workflow with execution count
CREATE OR REPLACE FUNCTION get_workflow_stats(workflow_uuid UUID)
RETURNS TABLE (
  workflow_id UUID,
  execution_count BIGINT,
  success_count BIGINT,
  error_count BIGINT,
  last_execution_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id as workflow_id,
    COUNT(we.id) as execution_count,
    COUNT(CASE WHEN we.status = 'success' THEN 1 END) as success_count,
    COUNT(CASE WHEN we.status = 'error' THEN 1 END) as error_count,
    MAX(we.started_at) as last_execution_at
  FROM workflows w
  LEFT JOIN workflow_executions we ON we.workflow_id = w.id
  WHERE w.id = workflow_uuid
  GROUP BY w.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Function to clean old execution data (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_executions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM workflow_executions
  WHERE started_at < (now() - INTERVAL '30 days')
    AND status IN ('success', 'error', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- =============================================
-- 6. COMMENTS
-- =============================================

COMMENT ON TABLE workflows IS 'Stores workflow definitions with nodes, edges, and pin data';
COMMENT ON TABLE workflow_executions IS 'Tracks workflow execution history and results';
COMMENT ON TABLE node_execution_data IS 'Stores real-time node execution data for live updates';

COMMENT ON COLUMN workflows.nodes IS 'JSONB array of workflow nodes';
COMMENT ON COLUMN workflows.edges IS 'JSONB array of node connections';
COMMENT ON COLUMN workflows.pin_data IS 'JSONB object with pinned test data per node';
COMMENT ON COLUMN workflows.settings IS 'JSONB object with workflow settings';

-- =============================================
-- END OF MIGRATION
-- =============================================
