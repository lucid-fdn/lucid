-- ============================================================================
-- Credentials System Migration
-- Phase 3C Week 2, Day 8-9
-- ============================================================================

-- Create credentials table
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('api_key', 'basic_auth', 'oauth2', 'custom_headers')),
  data JSONB NOT NULL, -- Encrypted credential data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_org ON credentials(organization_id);
CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);

-- Create credential usage tracking table
CREATE TABLE IF NOT EXISTS credential_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_credential_usage UNIQUE(credential_id, workflow_id, node_id)
);

-- Create indexes for usage tracking
CREATE INDEX IF NOT EXISTS idx_credential_usage_credential ON credential_usage(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_usage_workflow ON credential_usage(workflow_id);

-- Enable Row Level Security
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credentials

-- Users can view their own credentials
CREATE POLICY "Users can view own credentials"
  ON credentials FOR SELECT
  USING (user_id = auth.uid());

-- Users can view org credentials
CREATE POLICY "Users can view org credentials"
  ON credentials FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Users can create credentials
CREATE POLICY "Users can create credentials"
  ON credentials FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Org members can create org credentials
CREATE POLICY "Org members can create org credentials"
  ON credentials FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'developer')
    )
  );

-- Users can update their own credentials
CREATE POLICY "Users can update own credentials"
  ON credentials FOR UPDATE
  USING (user_id = auth.uid());

-- Org admins can update org credentials
CREATE POLICY "Org admins can update org credentials"
  ON credentials FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Users can delete their own credentials
CREATE POLICY "Users can delete own credentials"
  ON credentials FOR DELETE
  USING (user_id = auth.uid());

-- Org admins can delete org credentials
CREATE POLICY "Org admins can delete org credentials"
  ON credentials FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for credential_usage

-- Users can view usage for their credentials
CREATE POLICY "Users can view credential usage"
  ON credential_usage FOR SELECT
  USING (
    credential_id IN (
      SELECT id FROM credentials WHERE user_id = auth.uid()
    )
  );

-- Users can track credential usage
CREATE POLICY "Users can track credential usage"
  ON credential_usage FOR INSERT
  WITH CHECK (
    credential_id IN (
      SELECT id FROM credentials WHERE user_id = auth.uid()
    )
  );

-- Users can delete credential usage tracking
CREATE POLICY "Users can delete credential usage"
  ON credential_usage FOR DELETE
  USING (
    credential_id IN (
      SELECT id FROM credentials WHERE user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credentials_updated_at
  BEFORE UPDATE ON credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_credentials_updated_at();

-- Comments
COMMENT ON TABLE credentials IS 'Stores encrypted credentials for workflows';
COMMENT ON COLUMN credentials.data IS 'Encrypted JSON containing credential details';
COMMENT ON TABLE credential_usage IS 'Tracks which workflows use which credentials';
