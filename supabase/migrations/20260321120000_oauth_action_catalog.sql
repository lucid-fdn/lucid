-- OAuth Action Catalog
--
-- DB-driven action definitions. Adding a new provider = INSERT rows.
-- No code changes needed for new integrations.

CREATE TABLE IF NOT EXISTS oauth_action_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identity
  provider TEXT NOT NULL,
  provider_display_name TEXT NOT NULL,

  -- Action identity
  action_name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Execution config
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  provider_config_key TEXT,  -- Nango provider config key (defaults to provider)

  -- LLM-facing schema (what the agent sees)
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Safety metadata
  danger_level TEXT NOT NULL DEFAULT 'read' CHECK (danger_level IN ('read', 'write', 'destructive')),
  idempotent BOOLEAN NOT NULL DEFAULT false,
  read_only BOOLEAN NOT NULL DEFAULT false,

  -- Optional: extra headers to send with requests (e.g. Notion-Version)
  headers JSONB DEFAULT NULL,

  -- Optional: declarative transform rules (LLM-simple → API-specific)
  -- See worker/src/agent/oauth-tools/transform-engine.ts for supported operations
  transform_rules JSONB DEFAULT NULL,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(provider, action_name)
);

-- Index for fast lookups by provider
CREATE INDEX idx_oauth_action_catalog_provider ON oauth_action_catalog (provider) WHERE is_active = true;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_oauth_action_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_oauth_action_catalog_updated_at
  BEFORE UPDATE ON oauth_action_catalog
  FOR EACH ROW EXECUTE FUNCTION update_oauth_action_catalog_updated_at();

-- RPC to fetch active catalog (used by worker + API)
CREATE OR REPLACE FUNCTION get_oauth_action_catalog()
RETURNS SETOF oauth_action_catalog
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM oauth_action_catalog
  WHERE is_active = true
  ORDER BY provider, sort_order, action_name;
$$;

-- RPC to fetch catalog for a specific provider
CREATE OR REPLACE FUNCTION get_oauth_provider_actions(p_provider TEXT)
RETURNS SETOF oauth_action_catalog
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM oauth_action_catalog
  WHERE provider = p_provider AND is_active = true
  ORDER BY sort_order, action_name;
$$;

-- ---------------------------------------------------------------------------
-- Seed: Slack (3 actions)
-- ---------------------------------------------------------------------------

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES
('slack', 'Slack', 'send_message',
 'Send a message to a Slack channel. Requires the channel ID and message text.',
 'https://slack.com/api/chat.postMessage', 'POST', 'slack',
 '{"type":"object","properties":{"channel":{"type":"string","description":"Slack channel ID (e.g. C01ABC123)"},"text":{"type":"string","description":"Message text to send"}},"required":["channel","text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0),

('slack', 'Slack', 'list_channels',
 'List Slack channels the bot has access to.',
 'https://slack.com/api/conversations.list', 'GET', 'slack',
 '{"type":"object","properties":{"limit":{"type":"number","description":"Max channels to return (default 100, max 1000)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('slack', 'Slack', 'list_users',
 'List users in the Slack workspace.',
 'https://slack.com/api/users.list', 'GET', 'slack',
 '{"type":"object","properties":{"limit":{"type":"number","description":"Max users to return (default 100, max 1000)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 2);

-- ---------------------------------------------------------------------------
-- Seed: Google Sheets (3 actions)
-- ---------------------------------------------------------------------------

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, headers, transform_rules, sort_order) VALUES
('google-sheets', 'Google Sheets', 'list_spreadsheets',
 'List spreadsheets accessible to the connected Google account.',
 'https://www.googleapis.com/drive/v3/files', 'GET', 'google-sheets',
 '{"type":"object","properties":{"pageSize":{"type":"number","description":"Max results to return (default 20, max 100)"},"query":{"type":"string","description":"Search query to filter spreadsheets by name"}},"additionalProperties":false}'::jsonb,
 'read', true, true, NULL,
 '{"inject_query_params":{"q":"mimeType=''application/vnd.google-apps.spreadsheet''"},"field_to_query":{"query":{"target":"q","template":"mimeType=''application/vnd.google-apps.spreadsheet'' and name contains ''${value}''"}}}'::jsonb,
 0),

('google-sheets', 'Google Sheets', 'get_sheet_data',
 'Read data from a specific range in a Google Sheets spreadsheet.',
 'https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}', 'GET', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The spreadsheet ID (from the URL)"},"range":{"type":"string","description":"A1 notation range (e.g. \"Sheet1!A1:D10\")"}},"required":["spreadsheetId","range"],"additionalProperties":false}'::jsonb,
 'read', true, true, NULL, NULL, 1),

('google-sheets', 'Google Sheets', 'append_rows',
 'Append one or more rows of data to a Google Sheets spreadsheet.',
 'https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append', 'POST', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The spreadsheet ID"},"range":{"type":"string","description":"Target range in A1 notation (e.g. \"Sheet1!A:D\")"},"values":{"type":"array","description":"Array of row arrays (e.g. [[\"a\",\"b\"],[\"c\",\"d\"]])"}},"required":["spreadsheetId","range","values"],"additionalProperties":false}'::jsonb,
 'write', false, false, NULL,
 '{"inject_query_params":{"valueInputOption":"USER_ENTERED","insertDataOption":"INSERT_ROWS"}}'::jsonb,
 2);

-- ---------------------------------------------------------------------------
-- Seed: Notion (4 actions)
-- ---------------------------------------------------------------------------

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, headers, transform_rules, sort_order) VALUES
('notion', 'Notion', 'search',
 'Search Notion pages and databases by title.',
 'https://api.notion.com/v1/search', 'POST', 'notion',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query string"},"filter":{"type":"string","description":"Filter by object type: \"page\" or \"database\""},"page_size":{"type":"number","description":"Max results (default 10, max 100)"}},"additionalProperties":false}'::jsonb,
 'read', true, true,
 '{"Notion-Version":"2022-06-28"}'::jsonb,
 '{"wrap_field":{"filter":{"template":{"property":"object","value":"$value"}}}}'::jsonb,
 0),

('notion', 'Notion', 'get_database',
 'Retrieve a Notion database schema, including its property names and types. Use this before create_page to discover the correct property names.',
 'https://api.notion.com/v1/databases/${database_id}', 'GET', 'notion',
 '{"type":"object","properties":{"database_id":{"type":"string","description":"The Notion database ID"}},"required":["database_id"],"additionalProperties":false}'::jsonb,
 'read', true, true,
 '{"Notion-Version":"2022-06-28"}'::jsonb,
 NULL, 1),

('notion', 'Notion', 'query_database',
 'Query a Notion database with optional filters and sorts. Use get_database first to discover property names for filtering.',
 'https://api.notion.com/v1/databases/${database_id}/query', 'POST', 'notion',
 '{"type":"object","properties":{"database_id":{"type":"string","description":"The Notion database ID"},"filter":{"type":"object","description":"Notion filter object (e.g. { property: \"Status\", select: { equals: \"Done\" } })"},"sorts":{"type":"array","description":"Array of sort objects (e.g. [{ property: \"Created\", direction: \"descending\" }])"},"page_size":{"type":"number","description":"Max results (default 10, max 100)"}},"required":["database_id"],"additionalProperties":false}'::jsonb,
 'read', true, true,
 '{"Notion-Version":"2022-06-28"}'::jsonb,
 NULL, 2),

('notion', 'Notion', 'create_page',
 'Create a new page in a Notion database. Use get_database first to discover the title property name (often "Name") and available properties.',
 'https://api.notion.com/v1/pages', 'POST', 'notion',
 '{"type":"object","properties":{"database_id":{"type":"string","description":"Parent database ID"},"title_property_name":{"type":"string","description":"Name of the title property in the database (usually \"Name\" — use get_database to check)"},"title":{"type":"string","description":"Page title value"},"properties":{"type":"object","description":"Additional page properties matching the database schema"}},"required":["database_id","title"],"additionalProperties":false}'::jsonb,
 'write', false, false,
 '{"Notion-Version":"2022-06-28"}'::jsonb,
 '{"nest_field":{"database_id":"parent.database_id"},"title_to_notion":{"title_field":"title","name_field":"title_property_name","default_name":"Name"},"merge_properties":true}'::jsonb,
 3);

-- ---------------------------------------------------------------------------
-- Seed: Google Calendar (2 actions)
-- ---------------------------------------------------------------------------

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES
('google-calendar', 'Google Calendar', 'list_events',
 'List upcoming calendar events within a time range.',
 'https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events', 'GET', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default \"primary\")"},"timeMin":{"type":"string","description":"Start of time range (ISO 8601)"},"timeMax":{"type":"string","description":"End of time range (ISO 8601)"},"maxResults":{"type":"number","description":"Max events to return (default 10, max 250)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('google-calendar', 'Google Calendar', 'create_event',
 'Create a new calendar event. Pass start/end as objects with a "dateTime" key (ISO 8601) or "date" key (YYYY-MM-DD for all-day).',
 'https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default \"primary\")"},"summary":{"type":"string","description":"Event title"},"description":{"type":"string","description":"Event description"},"start":{"type":"object","description":"Start time object: { dateTime: \"ISO8601\" } or { date: \"YYYY-MM-DD\" }"},"end":{"type":"object","description":"End time object: { dateTime: \"ISO8601\" } or { date: \"YYYY-MM-DD\" }"},"attendees":{"type":"array","description":"Array of attendee objects: [{ email: \"user@example.com\" }]"}},"required":["summary","start","end"],"additionalProperties":false}'::jsonb,
 'write', false, false, 1);

-- RLS: catalog is public read (not sensitive), admin-only write
ALTER TABLE oauth_action_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active catalog"
  ON oauth_action_catalog FOR SELECT
  USING (is_active = true);
