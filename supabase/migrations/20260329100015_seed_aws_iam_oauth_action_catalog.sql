-- Migration: Seed AWS IAM actions into oauth_action_catalog
-- 2 actions: create_user, delete_user

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Write action
('aws-iam', 'AWS IAM', 'create_user',
 'Creates a user in AWS IAM with optional tags for firstName, lastName, and email.',
 'https://iam.amazonaws.com/', 'POST', 'aws-iam',
 '{"type":"object","properties":{"firstName":{"type":"string","description":"First name of the user (stored as IAM tag)"},"lastName":{"type":"string","description":"Last name of the user (stored as IAM tag)"},"email":{"type":"string","description":"Email address of the user (stored as IAM tag)"},"userName":{"type":"string","description":"IAM username. Defaults to firstName.lastName if omitted."}},"required":["firstName","lastName","email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0),

-- Destructive action
('aws-iam', 'AWS IAM', 'delete_user',
 'Delete an existing user in AWS IAM. Items attached to the user (policies, keys, groups) must be removed manually first or the deletion fails.',
 'https://iam.amazonaws.com/', 'DELETE', 'aws-iam',
 '{"type":"object","properties":{"userName":{"type":"string","description":"The IAM username to delete"}},"required":["userName"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 1)
ON CONFLICT (provider, action_name) DO NOTHING;
