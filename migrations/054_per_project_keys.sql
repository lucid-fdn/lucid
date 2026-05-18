-- Migration 054: Per-Project Gateway Keys (FIXED)
-- Allows scoping keys to specific projects instead of org-wide access
-- APPLIED: Feb 10, 2026 via Supabase MCP
-- NOTE: Uses organization_members (not project_members which doesn't exist)

-- Add project_id column to gateway keys
ALTER TABLE org_lucidgateway_keys
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Add indexes for project-scoped queries
CREATE INDEX IF NOT EXISTS idx_lucidgateway_keys_project ON org_lucidgateway_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_lucidgateway_keys_org_project ON org_lucidgateway_keys(org_id, project_id);

-- Drop existing RLS policies (actual policy names from database)
DROP POLICY IF EXISTS "Users can view org lucidgateway keys in their org" ON org_lucidgateway_keys;
DROP POLICY IF EXISTS "Org owners/admins can insert org lucidgateway keys" ON org_lucidgateway_keys;
DROP POLICY IF EXISTS "Org owners/admins can update org lucidgateway keys" ON org_lucidgateway_keys;

-- Recreate RLS policies with project-level support
-- Users can view all keys (org-wide or project-scoped) from their orgs
CREATE POLICY "Users can view org and project keys"
  ON org_lucidgateway_keys FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
    )
  );

-- Admins can create org-wide keys; developers+ can create project-scoped keys
CREATE POLICY "Users can create appropriate keys"
  ON org_lucidgateway_keys FOR INSERT
  WITH CHECK (
    (project_id IS NULL AND org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    ))
    OR
    (project_id IS NOT NULL AND org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'developer')
    ))
  );

-- Admins can update org-wide keys; developers+ can update project-scoped keys
CREATE POLICY "Users can update appropriate keys"
  ON org_lucidgateway_keys FOR UPDATE
  USING (
    (project_id IS NULL AND org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    ))
    OR
    (project_id IS NOT NULL AND org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'developer')
    ))
  );

-- Admins can delete org-wide keys; developers+ can delete project-scoped keys
CREATE POLICY "Users can delete appropriate keys"
  ON org_lucidgateway_keys FOR DELETE
  USING (
    (project_id IS NULL AND org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    ))
    OR
    (project_id IS NOT NULL AND org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'developer')
    ))
  );

-- Update audit events to track project context
ALTER TABLE org_lucidgateway_key_audit_events
ADD COLUMN IF NOT EXISTS project_id UUID;

CREATE INDEX IF NOT EXISTS idx_key_audit_project ON org_lucidgateway_key_audit_events(project_id);