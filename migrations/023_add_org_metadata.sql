-- ============================================================================
-- Migration: Add metadata column to organizations table
-- Purpose: Store flexible onboarding and analytics data
-- Date: 2025-10-15
-- ============================================================================

-- Add metadata JSONB column to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_organizations_metadata 
ON organizations USING GIN (metadata);

-- Add comment for documentation
COMMENT ON COLUMN organizations.metadata IS 'Flexible JSONB storage for onboarding data, analytics, and custom fields';

-- Example usage:
-- Store onboarding data:
-- UPDATE organizations SET metadata = jsonb_set(metadata, '{onboarding_purpose}', '"ai_development"') WHERE id = '...';
--
-- Query by onboarding purpose:
-- SELECT * FROM organizations WHERE metadata->>'onboarding_purpose' = 'ai_development';
--
-- Query organizations completed onboarding in last 30 days:
-- SELECT * FROM organizations 
-- WHERE (metadata->>'onboarding_completed_at')::timestamptz > now() - interval '30 days';
