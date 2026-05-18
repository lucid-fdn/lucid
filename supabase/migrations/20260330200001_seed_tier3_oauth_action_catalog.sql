-- Migration: Seed Tier 3 OAuth actions into oauth_action_catalog
-- 4 providers, 31 actions total: Make (6), Zapier (5), Pipedrive (12), Apollo (8)

-- ═══════════════════════════════════════════════════════════════
-- Make (6 actions: 2 read + 3 write + 1 read)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('make', 'Make', 'list_scenarios',
 'List all automation scenarios in the Make account.',
 '/scenarios', 'GET', 'make',
 '{"type":"object","properties":{"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max scenarios to return (default 20)"},"pg[offset]":{"type":"number","description":"Pagination offset"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('make', 'Make', 'get_scenario',
 'Get detailed information about a specific scenario.',
 '/scenarios/:scenarioId', 'GET', 'make',
 '{"type":"object","properties":{"scenarioId":{"type":"string","description":"Scenario ID (required)"}},"required":["scenarioId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('make', 'Make', 'run_scenario',
 'Trigger an immediate execution of a scenario.',
 '/scenarios/:scenarioId/run', 'POST', 'make',
 '{"type":"object","properties":{"scenarioId":{"type":"string","description":"Scenario ID (required)"},"data":{"type":"object","description":"Optional input data to pass to the scenario"}},"required":["scenarioId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

('make', 'Make', 'activate_scenario',
 'Activate (turn on) a scenario so it runs on its schedule.',
 '/scenarios/:scenarioId/activate', 'POST', 'make',
 '{"type":"object","properties":{"scenarioId":{"type":"string","description":"Scenario ID (required)"}},"required":["scenarioId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3),

('make', 'Make', 'deactivate_scenario',
 'Deactivate (pause) a scenario.',
 '/scenarios/:scenarioId/deactivate', 'POST', 'make',
 '{"type":"object","properties":{"scenarioId":{"type":"string","description":"Scenario ID (required)"}},"required":["scenarioId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4),

('make', 'Make', 'list_scenario_logs',
 'Get execution logs for a scenario.',
 '/scenarios/:scenarioId/logs', 'GET', 'make',
 '{"type":"object","properties":{"scenarioId":{"type":"string","description":"Scenario ID (required)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max logs to return (default 20)"}},"required":["scenarioId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 5)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Zapier (5 actions: 3 read + 2 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('zapier', 'Zapier', 'list_zaps',
 'List all Zaps in the Zapier account with status and configuration.',
 '/v2/zaps', 'GET', 'zapier',
 '{"type":"object","properties":{"state":{"type":"string","enum":["on","off","draft"],"description":"Filter by Zap state"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max Zaps to return (default 20)"},"offset":{"type":"number","description":"Pagination offset"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('zapier', 'Zapier', 'get_zap',
 'Get detailed information about a specific Zap.',
 '/v2/zaps/:zapId', 'GET', 'zapier',
 '{"type":"object","properties":{"zapId":{"type":"string","description":"Zap ID (required)"}},"required":["zapId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('zapier', 'Zapier', 'list_apps',
 'List available apps (integrations) in Zapier.',
 '/v2/apps', 'GET', 'zapier',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('zapier', 'Zapier', 'enable_zap',
 'Turn on a Zap so it starts processing triggers.',
 '/v2/zaps/:zapId', 'PATCH', 'zapier',
 '{"type":"object","properties":{"zapId":{"type":"string","description":"Zap ID (required)"}},"required":["zapId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3),

('zapier', 'Zapier', 'disable_zap',
 'Turn off a Zap to stop processing triggers.',
 '/v2/zaps/:zapId', 'PATCH', 'zapier',
 '{"type":"object","properties":{"zapId":{"type":"string","description":"Zap ID (required)"}},"required":["zapId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Pipedrive (12 actions: 8 read + 4 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('pipedrive', 'Pipedrive', 'list_deals',
 'List deals with optional filtering and pagination.',
 '/v1/deals', 'GET', 'pipedrive',
 '{"type":"object","properties":{"status":{"type":"string","enum":["open","won","lost","deleted","all_not_deleted"],"description":"Filter by deal status (default: all_not_deleted)"},"start":{"type":"number","description":"Pagination offset (default 0)"},"limit":{"type":"number","minimum":1,"maximum":500,"description":"Max deals to return (default 20)"},"sort":{"type":"string","description":"Sort field and direction (e.g. add_time DESC)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('pipedrive', 'Pipedrive', 'get_deal',
 'Get full details of a specific deal.',
 '/v1/deals/:dealId', 'GET', 'pipedrive',
 '{"type":"object","properties":{"dealId":{"type":"number","description":"Deal ID (required)"}},"required":["dealId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('pipedrive', 'Pipedrive', 'create_deal',
 'Create a new deal in a pipeline.',
 '/v1/deals', 'POST', 'pipedrive',
 '{"type":"object","properties":{"title":{"type":"string","description":"Deal title (required)"},"value":{"type":"number","description":"Deal monetary value"},"currency":{"type":"string","description":"Currency code (e.g. USD, EUR)"},"person_id":{"type":"number","description":"Contact person ID to link"},"org_id":{"type":"number","description":"Organization ID to link"},"pipeline_id":{"type":"number","description":"Pipeline ID (uses default if omitted)"},"stage_id":{"type":"number","description":"Stage ID within the pipeline"}},"required":["title"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

('pipedrive', 'Pipedrive', 'update_deal',
 'Update an existing deal.',
 '/v1/deals/:dealId', 'PUT', 'pipedrive',
 '{"type":"object","properties":{"dealId":{"type":"number","description":"Deal ID (required)"},"title":{"type":"string","description":"Updated title"},"value":{"type":"number","description":"Updated value"},"stage_id":{"type":"number","description":"Move to this stage"},"status":{"type":"string","enum":["open","won","lost","deleted"],"description":"Change deal status"},"won_time":{"type":"string","description":"Won timestamp (ISO 8601, for status=won)"},"lost_reason":{"type":"string","description":"Reason for losing (for status=lost)"}},"required":["dealId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 3),

('pipedrive', 'Pipedrive', 'list_persons',
 'List contacts (persons) in Pipedrive.',
 '/v1/persons', 'GET', 'pipedrive',
 '{"type":"object","properties":{"start":{"type":"number","description":"Pagination offset"},"limit":{"type":"number","minimum":1,"maximum":500,"description":"Max persons to return (default 20)"},"sort":{"type":"string","description":"Sort field and direction"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

('pipedrive', 'Pipedrive', 'create_person',
 'Create a new contact person.',
 '/v1/persons', 'POST', 'pipedrive',
 '{"type":"object","properties":{"name":{"type":"string","description":"Full name (required)"},"email":{"type":"array","items":{"type":"object","properties":{"value":{"type":"string"},"label":{"type":"string"}},"required":["value"]},"description":"Email addresses"},"phone":{"type":"array","items":{"type":"object","properties":{"value":{"type":"string"},"label":{"type":"string"}},"required":["value"]},"description":"Phone numbers"},"org_id":{"type":"number","description":"Organization ID to link"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 5),

('pipedrive', 'Pipedrive', 'list_organizations',
 'List organizations in Pipedrive.',
 '/v1/organizations', 'GET', 'pipedrive',
 '{"type":"object","properties":{"start":{"type":"number","description":"Pagination offset"},"limit":{"type":"number","minimum":1,"maximum":500,"description":"Max orgs to return (default 20)"},"sort":{"type":"string","description":"Sort field and direction"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('pipedrive', 'Pipedrive', 'list_activities',
 'List activities (calls, meetings, tasks).',
 '/v1/activities', 'GET', 'pipedrive',
 '{"type":"object","properties":{"start":{"type":"number","description":"Pagination offset"},"limit":{"type":"number","minimum":1,"maximum":500,"description":"Max activities to return (default 20)"},"type":{"type":"string","description":"Activity type filter"},"done":{"type":"number","enum":[0,1],"description":"Filter: 0=undone, 1=done"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

('pipedrive', 'Pipedrive', 'create_activity',
 'Create a new activity (call, meeting, task, etc.).',
 '/v1/activities', 'POST', 'pipedrive',
 '{"type":"object","properties":{"subject":{"type":"string","description":"Activity subject (required)"},"type":{"type":"string","description":"Activity type (required, e.g. call, meeting, task)"},"deal_id":{"type":"number","description":"Linked deal ID"},"person_id":{"type":"number","description":"Linked person ID"},"org_id":{"type":"number","description":"Linked organization ID"},"due_date":{"type":"string","description":"Due date (YYYY-MM-DD)"},"due_time":{"type":"string","description":"Due time (HH:MM)"},"duration":{"type":"string","description":"Duration (HH:MM)"},"note":{"type":"string","description":"Activity note/description"}},"required":["subject","type"],"additionalProperties":false}'::jsonb,
 'write', false, false, 8),

('pipedrive', 'Pipedrive', 'list_pipelines',
 'List all sales pipelines.',
 '/v1/pipelines', 'GET', 'pipedrive',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 9),

('pipedrive', 'Pipedrive', 'list_stages',
 'List stages of a pipeline.',
 '/v1/stages', 'GET', 'pipedrive',
 '{"type":"object","properties":{"pipeline_id":{"type":"number","description":"Pipeline ID (required)"}},"required":["pipeline_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 10),

('pipedrive', 'Pipedrive', 'search_items',
 'Global search across deals, persons, organizations, and products.',
 '/v1/itemSearch', 'GET', 'pipedrive',
 '{"type":"object","properties":{"term":{"type":"string","description":"Search term (required, min 2 chars)"},"item_types":{"type":"string","description":"Comma-separated types: deal, person, organization, product"},"limit":{"type":"number","minimum":1,"maximum":500,"description":"Max results (default 20)"}},"required":["term"],"additionalProperties":false}'::jsonb,
 'read', true, true, 11)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Apollo (8 actions: 6 read + 2 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('apollo', 'Apollo', 'search_people',
 'Search for people/contacts in the Apollo prospecting database (no credit cost).',
 '/v1/mixed_people/search', 'POST', 'apollo',
 '{"type":"object","properties":{"q_person_title":{"type":"string","description":"Job title to search for"},"q_organization_name":{"type":"string","description":"Company name to filter by"},"person_locations":{"type":"array","items":{"type":"string"},"description":"Location filters (e.g. [\"United States\", \"France\"])"},"person_seniorities":{"type":"array","items":{"type":"string"},"description":"Seniority levels (e.g. [\"senior\", \"manager\", \"director\", \"vp\", \"c_suite\"])"},"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (default 20)"},"page":{"type":"number","minimum":1,"description":"Page number (default 1)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('apollo', 'Apollo', 'enrich_person',
 'Enrich a person with full profile data (uses 1 credit).',
 '/v1/people/match', 'POST', 'apollo',
 '{"type":"object","properties":{"email":{"type":"string","description":"Email address to enrich"},"first_name":{"type":"string","description":"First name (used with last_name + domain)"},"last_name":{"type":"string","description":"Last name (used with first_name + domain)"},"domain":{"type":"string","description":"Company domain (used with name)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('apollo', 'Apollo', 'search_organizations',
 'Search for companies/organizations in Apollo.',
 '/v1/mixed_companies/search', 'POST', 'apollo',
 '{"type":"object","properties":{"q_organization_name":{"type":"string","description":"Organization name to search"},"organization_locations":{"type":"array","items":{"type":"string"},"description":"Location filters"},"organization_num_employees_ranges":{"type":"array","items":{"type":"string"},"description":"Employee count ranges (e.g. [\"1,10\", \"11,50\", \"51,200\"])"},"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (default 20)"},"page":{"type":"number","minimum":1,"description":"Page number"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('apollo', 'Apollo', 'enrich_organization',
 'Get detailed company info including tech stack, funding, and employee data.',
 '/v1/organizations/enrich', 'GET', 'apollo',
 '{"type":"object","properties":{"domain":{"type":"string","description":"Company domain (required, e.g. apollo.io)"}},"required":["domain"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('apollo', 'Apollo', 'create_contact',
 'Add a contact to your Apollo CRM.',
 '/v1/contacts', 'POST', 'apollo',
 '{"type":"object","properties":{"first_name":{"type":"string","description":"First name (required)"},"last_name":{"type":"string","description":"Last name (required)"},"email":{"type":"string","description":"Email address"},"organization_name":{"type":"string","description":"Company name"},"title":{"type":"string","description":"Job title"},"phone":{"type":"string","description":"Phone number"}},"required":["first_name","last_name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4),

('apollo', 'Apollo', 'search_contacts',
 'Search contacts in your Apollo CRM (saved contacts, not prospecting DB).',
 '/v1/contacts/search', 'POST', 'apollo',
 '{"type":"object","properties":{"q_keywords":{"type":"string","description":"Keyword search"},"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (default 20)"},"page":{"type":"number","minimum":1,"description":"Page number"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 5),

('apollo', 'Apollo', 'list_sequences',
 'List email sequences in your Apollo account.',
 '/v1/emailer_campaigns/search', 'POST', 'apollo',
 '{"type":"object","properties":{"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (default 20)"},"page":{"type":"number","minimum":1,"description":"Page number"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('apollo', 'Apollo', 'add_to_sequence',
 'Add contacts to an email sequence.',
 '/v1/emailer_campaigns/:sequenceId/add_contact_ids', 'POST', 'apollo',
 '{"type":"object","properties":{"sequenceId":{"type":"string","description":"Sequence ID (required)"},"contact_ids":{"type":"array","items":{"type":"string"},"description":"Array of contact IDs to add (required)"}},"required":["sequenceId","contact_ids"],"additionalProperties":false}'::jsonb,
 'write', false, false, 7)

ON CONFLICT (provider, action_name) DO NOTHING;
