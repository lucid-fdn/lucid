-- ============================================================================
-- Session Signer Permissions Table
-- Tracks which users have enabled session signers for autonomous transactions
-- ============================================================================

-- Create session_signer_permissions table
CREATE TABLE IF NOT EXISTS session_signer_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_address)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_signer_user_id ON session_signer_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_session_signer_wallet ON session_signer_permissions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_session_signer_enabled ON session_signer_permissions(enabled) WHERE enabled = true;

-- Enable RLS
ALTER TABLE session_signer_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only view their own session signer permissions
CREATE POLICY "Users can view own session signers"
  ON session_signer_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own session signer permissions
CREATE POLICY "Users can insert own session signers"
  ON session_signer_permissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own session signer permissions
CREATE POLICY "Users can update own session signers"
  ON session_signer_permissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own session signer permissions
CREATE POLICY "Users can delete own session signers"
  ON session_signer_permissions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access (for backend operations)
CREATE POLICY "Service role has full access to session signers"
  ON session_signer_permissions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE TRIGGER update_session_signer_permissions_updated_at
  BEFORE UPDATE ON session_signer_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE session_signer_permissions IS 'Tracks user permissions for session signers (autonomous transaction signing)';
