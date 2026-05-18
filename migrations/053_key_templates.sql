-- Migration 053: Gateway Key Templates (FIXED)
-- Allows users to save and reuse common key configurations
-- APPLIED: Feb 10, 2026 via Supabase MCP

-- Key Templates Table
CREATE TABLE IF NOT EXISTS org_key_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_template_name UNIQUE (org_id, template_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_key_templates_org ON org_key_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_key_templates_created_by ON org_key_templates(created_by);

-- RLS Policies
ALTER TABLE org_key_templates ENABLE ROW LEVEL SECURITY;

-- Uses organization_members.organization_id (NOT org_members)
CREATE POLICY "Users can view org templates"
  ON org_key_templates FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can create templates"
  ON org_key_templates FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update templates"
  ON org_key_templates FOR UPDATE
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete templates"
  ON org_key_templates FOR DELETE
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_key_templates_updated_at
  BEFORE UPDATE ON org_key_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();