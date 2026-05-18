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

-- Migration: Seed Google Sheets remaining actions into oauth_action_catalog
-- 9 actions total: 2 read + 7 write

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('google-sheets', 'Google Sheets', 'get_values',
 'Get values from a spreadsheet range.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range', 'GET', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"range":{"type":"string","description":"The range to retrieve in A1 notation"}},"required":["spreadsheetId","range"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('google-sheets', 'Google Sheets', 'batch_get_values',
 'Get values from multiple spreadsheet ranges.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values:batchGet', 'GET', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"ranges":{"type":"array","description":"List of ranges to retrieve in A1 notation","items":{"type":"string"}},"majorDimension":{"type":"string","description":"Major dimension of the values (ROWS or COLUMNS)"},"valueRenderOption":{"type":"string","description":"How values should be rendered (FORMATTED_VALUE, UNFORMATTED_VALUE, FORMULA)"}},"required":["spreadsheetId","ranges"],"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

-- Write actions
('google-sheets', 'Google Sheets', 'create_spreadsheet',
 'Create a new spreadsheet.',
 'https://sheets.googleapis.com/v4/spreadsheets', 'POST', 'google-sheets',
 '{"type":"object","properties":{"title":{"type":"string","description":"Title of the new spreadsheet"},"locale":{"type":"string","description":"Locale of the spreadsheet (e.g. en_US)"},"timeZone":{"type":"string","description":"Time zone of the spreadsheet (IANA format)"}},"required":["title"],"additionalProperties":false}'::jsonb,
 'write', false, false, 5),

('google-sheets', 'Google Sheets', 'update_values',
 'Update values in a spreadsheet range.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range', 'PUT', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"range":{"type":"string","description":"The range to update in A1 notation"},"values":{"type":"array","description":"The values to write (array of arrays)","items":{"type":"array","items":{}}},"valueInputOption":{"type":"string","description":"How input data should be interpreted","enum":["RAW","USER_ENTERED"]}},"required":["spreadsheetId","range","values"],"additionalProperties":false}'::jsonb,
 'write', true, false, 6),

('google-sheets', 'Google Sheets', 'create_spreadsheet_row',
 'Insert a new row at a given index in a Google Sheet.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId:batchUpdate', 'POST', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"sheetId":{"type":"number","description":"The numeric ID of the sheet tab"},"sheetName":{"type":"string","description":"The name of the sheet tab"},"rowIndex":{"type":"number","description":"The 0-based row index to insert at"},"values":{"type":"array","description":"The values for the new row"}},"required":["spreadsheetId","sheetId","sheetName","rowIndex","values"],"additionalProperties":false}'::jsonb,
 'write', false, false, 7),

('google-sheets', 'Google Sheets', 'upsert_row',
 'Append or update a row of values in a Google Sheet.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range:append', 'POST', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"range":{"type":"string","description":"The range in A1 notation"},"values":{"type":"array","description":"The values for the row"},"keyColumn":{"type":"number","description":"0-based column index to match for upsert"},"keyValue":{"type":"string","description":"Value to match in keyColumn for upsert"}},"required":["spreadsheetId","range","values"],"additionalProperties":false}'::jsonb,
 'write', true, false, 8),

('google-sheets', 'Google Sheets', 'clear_values',
 'Clear values from a range, preserving formatting.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range:clear', 'POST', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"range":{"type":"string","description":"The range to clear in A1 notation"}},"required":["spreadsheetId","range"],"additionalProperties":false}'::jsonb,
 'write', true, false, 9),

('google-sheets', 'Google Sheets', 'append_values_to_spreadsheet',
 'Append values to the end of a spreadsheet table.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range:append', 'POST', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"range":{"type":"string","description":"The range in A1 notation"},"values":{"type":"array","description":"The values to append"},"valueInputOption":{"type":"string","description":"How input data should be interpreted","enum":["RAW","USER_ENTERED"]},"insertDataOption":{"type":"string","description":"How data should be inserted (OVERWRITE or INSERT_ROWS)"}},"required":["spreadsheetId","range","values"],"additionalProperties":false}'::jsonb,
 'write', false, false, 10),

('google-sheets', 'Google Sheets', 'update_cells',
 'Update specific cells in a Google Sheets spreadsheet.',
 'https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range', 'PUT', 'google-sheets',
 '{"type":"object","properties":{"spreadsheetId":{"type":"string","description":"The ID of the spreadsheet"},"range":{"type":"string","description":"The range to update in A1 notation"},"values":{"type":"array","description":"The values to write (array of arrays)","items":{"type":"array","items":{}}}},"required":["spreadsheetId","range","values"],"additionalProperties":false}'::jsonb,
 'write', true, false, 11)

ON CONFLICT (provider, action_name) DO NOTHING;
