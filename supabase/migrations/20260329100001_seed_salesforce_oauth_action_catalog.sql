-- Ensure oauth_action_catalog table exists (repair: base migration may not have created it)
CREATE TABLE IF NOT EXISTS oauth_action_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_display_name TEXT NOT NULL,
  action_name TEXT NOT NULL,
  description TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  provider_config_key TEXT,
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  danger_level TEXT NOT NULL DEFAULT 'read' CHECK (danger_level IN ('read', 'write', 'destructive')),
  idempotent BOOLEAN NOT NULL DEFAULT false,
  read_only BOOLEAN NOT NULL DEFAULT false,
  headers JSONB DEFAULT NULL,
  transform_rules JSONB DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, action_name)
);

CREATE INDEX IF NOT EXISTS idx_oauth_action_catalog_provider ON oauth_action_catalog (provider) WHERE is_active = true;

-- Enable RLS
ALTER TABLE oauth_action_catalog ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read active catalog"
    ON oauth_action_catalog FOR SELECT
    USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration: Seed Salesforce actions into oauth_action_catalog
-- 14 actions total: 1 whoami + 1 fetch-fields + 4 create + 4 update + 4 delete

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('salesforce', 'Salesforce', 'whoami',
 'Get the identity of the currently authenticated Salesforce user.',
 'https://login.salesforce.com/services/oauth2/userinfo', 'GET', 'salesforce',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('salesforce', 'Salesforce', 'fetch_fields',
 'Retrieve the fields (schema) for a given Salesforce object type.',
 'https://salesforce.com/services/data/v56.0/sobjects', 'GET', 'salesforce',
 '{"type":"object","properties":{"name":{"type":"string","description":"Salesforce object type name (e.g. Account, Contact, Lead, Opportunity)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

-- Create actions
('salesforce', 'Salesforce', 'create_account',
 'Create a new account in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Account', 'POST', 'salesforce',
 '{"type":"object","properties":{"name":{"type":"string","description":"Account name (required)"},"description":{"type":"string","description":"Account description"},"industry":{"type":"string","description":"Industry"},"website":{"type":"string","description":"Website URL"},"phone":{"type":"string","description":"Phone number"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

('salesforce', 'Salesforce', 'create_contact',
 'Create a new contact in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Contact', 'POST', 'salesforce',
 '{"type":"object","properties":{"last_name":{"type":"string","description":"Last name (required)"},"first_name":{"type":"string","description":"First name"},"email":{"type":"string","description":"Email address"},"phone":{"type":"string","description":"Phone number"},"account_id":{"type":"string","description":"Account ID to associate with"}},"required":["last_name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3),

('salesforce', 'Salesforce', 'create_lead',
 'Create a new lead in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Lead', 'POST', 'salesforce',
 '{"type":"object","properties":{"last_name":{"type":"string","description":"Last name (required)"},"company_name":{"type":"string","description":"Company name (required)"},"first_name":{"type":"string","description":"First name"},"email":{"type":"string","description":"Email address"},"phone":{"type":"string","description":"Phone number"},"title":{"type":"string","description":"Job title"},"status":{"type":"string","description":"Lead status"}},"required":["last_name","company_name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4),

('salesforce', 'Salesforce', 'create_opportunity',
 'Create a new opportunity in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Opportunity', 'POST', 'salesforce',
 '{"type":"object","properties":{"opportunity_name":{"type":"string","description":"Opportunity name (required)"},"close_date":{"type":"string","description":"Close date in YYYY-MM-DD format (required)"},"stage":{"type":"string","description":"Stage name (required)"},"amount":{"type":"number","description":"Deal amount"},"account_id":{"type":"string","description":"Account ID"},"description":{"type":"string","description":"Description"}},"required":["opportunity_name","close_date","stage"],"additionalProperties":false}'::jsonb,
 'write', false, false, 5),

-- Update actions
('salesforce', 'Salesforce', 'update_account',
 'Update an existing account in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Account', 'PATCH', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Account ID (required)"},"name":{"type":"string","description":"Account name"},"description":{"type":"string","description":"Description"},"industry":{"type":"string","description":"Industry"},"website":{"type":"string","description":"Website"},"phone":{"type":"string","description":"Phone"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 6),

('salesforce', 'Salesforce', 'update_contact',
 'Update an existing contact in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Contact', 'PATCH', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Contact ID (required)"},"last_name":{"type":"string","description":"Last name"},"first_name":{"type":"string","description":"First name"},"email":{"type":"string","description":"Email"},"phone":{"type":"string","description":"Phone"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 7),

('salesforce', 'Salesforce', 'update_lead',
 'Update an existing lead in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Lead', 'PATCH', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Lead ID (required)"},"last_name":{"type":"string","description":"Last name"},"first_name":{"type":"string","description":"First name"},"email":{"type":"string","description":"Email"},"status":{"type":"string","description":"Lead status"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 8),

('salesforce', 'Salesforce', 'update_opportunity',
 'Update an existing opportunity in Salesforce.',
 'https://salesforce.com/services/data/v56.0/sobjects/Opportunity', 'PATCH', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Opportunity ID (required)"},"opportunity_name":{"type":"string","description":"Opportunity name"},"close_date":{"type":"string","description":"Close date"},"stage":{"type":"string","description":"Stage"},"amount":{"type":"number","description":"Amount"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 9),

-- Delete actions
('salesforce', 'Salesforce', 'delete_account',
 'Delete an account in Salesforce. This action is irreversible.',
 'https://salesforce.com/services/data/v56.0/sobjects/Account', 'DELETE', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Account ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 10),

('salesforce', 'Salesforce', 'delete_contact',
 'Delete a contact in Salesforce. This action is irreversible.',
 'https://salesforce.com/services/data/v56.0/sobjects/Contact', 'DELETE', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Contact ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 11),

('salesforce', 'Salesforce', 'delete_lead',
 'Delete a lead in Salesforce. This action is irreversible.',
 'https://salesforce.com/services/data/v56.0/sobjects/Lead', 'DELETE', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Lead ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 12),

('salesforce', 'Salesforce', 'delete_opportunity',
 'Delete an opportunity in Salesforce. This action is irreversible.',
 'https://salesforce.com/services/data/v56.0/sobjects/Opportunity', 'DELETE', 'salesforce',
 '{"type":"object","properties":{"id":{"type":"string","description":"Opportunity ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 13)

ON CONFLICT (provider, action_name) DO NOTHING;
