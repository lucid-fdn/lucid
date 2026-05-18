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

-- Migration: Seed Google Calendar remaining actions into oauth_action_catalog
-- 13 actions total: 6 read + 6 write + 1 destructive

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('google-calendar', 'Google Calendar', 'list_calendar_list',
 'List calendars in the user''s calendar list.',
 'https://www.googleapis.com/calendar/v3/users/me/calendarList', 'GET', 'google-calendar',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Page token for pagination"},"maxResults":{"type":"number","description":"Maximum number of results to return"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('google-calendar', 'Google Calendar', 'list_calendars',
 'List all calendars accessible to the user.',
 'https://www.googleapis.com/calendar/v3/users/me/calendarList', 'GET', 'google-calendar',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('google-calendar', 'Google Calendar', 'list_upcoming_events',
 'List upcoming events from now, ordered by start time.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events', 'GET', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"cursor":{"type":"string","description":"Page token for pagination"},"limit":{"type":"number","description":"Maximum number of events to return (1-2500)","minimum":1,"maximum":2500},"timeMin":{"type":"string","description":"Lower bound (RFC3339) for filtering events by start time"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

('google-calendar', 'Google Calendar', 'get_event',
 'Get an event by ID from Google Calendar.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId', 'GET', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"eventId":{"type":"string","description":"Event ID to retrieve"}},"required":["eventId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 5),

('google-calendar', 'Google Calendar', 'query_free_busy',
 'Return free/busy blocks for one or more calendars in a time range.',
 'https://www.googleapis.com/calendar/v3/freeBusy', 'POST', 'google-calendar',
 '{"type":"object","properties":{"timeMin":{"type":"string","description":"Start of the time range (RFC3339)"},"timeMax":{"type":"string","description":"End of the time range (RFC3339)"},"timeZone":{"type":"string","description":"Time zone (IANA format)"},"items":{"type":"array","description":"List of calendars to query","items":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}}},"required":["timeMin","timeMax","items"],"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('google-calendar', 'Google Calendar', 'find_free_slots',
 'Query free/busy data and return gaps meeting a minimum duration.',
 'https://www.googleapis.com/calendar/v3/freeBusy', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarIds":{"type":"array","description":"List of calendar IDs to query","items":{"type":"string"}},"timeMin":{"type":"string","description":"Start of the time range (RFC3339)"},"timeMax":{"type":"string","description":"End of the time range (RFC3339)"},"durationMinutes":{"type":"number","description":"Minimum slot duration in minutes","minimum":1}},"required":["timeMin","timeMax","durationMinutes"],"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

-- Write actions
('google-calendar', 'Google Calendar', 'create_all_day_event',
 'Create an all-day calendar event using start and end dates.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"summary":{"type":"string","description":"Event title"},"startDate":{"type":"string","description":"Start date (yyyy-mm-dd)"},"endDate":{"type":"string","description":"End date (yyyy-mm-dd)"},"description":{"type":"string","description":"Event description"},"location":{"type":"string","description":"Event location"}},"required":["summary","startDate","endDate"],"additionalProperties":false}'::jsonb,
 'write', false, false, 8),

('google-calendar', 'Google Calendar', 'create_recurring_event',
 'Create a recurring event with RRULE values.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"summary":{"type":"string","description":"Event title"},"description":{"type":"string","description":"Event description"},"location":{"type":"string","description":"Event location"},"start":{"type":"string","description":"Start datetime (RFC3339)"},"end":{"type":"string","description":"End datetime (RFC3339)"},"rrule":{"type":"string","description":"Recurrence rule (RRULE format)"},"timezone":{"type":"string","description":"Time zone (IANA format)"}},"required":["summary","start","end","rrule"],"additionalProperties":false}'::jsonb,
 'write', false, false, 9),

('google-calendar', 'Google Calendar', 'quick_add_event',
 'Create an event from a text string.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/quickAdd', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"text":{"type":"string","description":"Text describing the event to create"},"sendUpdates":{"type":"string","description":"Who to send notifications to","enum":["all","externalOnly","none"]}},"required":["text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 10),

('google-calendar', 'Google Calendar', 'update_event',
 'Update a calendar event.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId', 'PUT', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"eventId":{"type":"string","description":"Event ID to update"},"summary":{"type":"string","description":"Event title"},"description":{"type":"string","description":"Event description"},"location":{"type":"string","description":"Event location"},"start":{"type":"object","description":"Start time object"},"end":{"type":"object","description":"End time object"},"attendees":{"type":"array","description":"List of attendees"},"status":{"type":"string","description":"Event status"},"visibility":{"type":"string","description":"Event visibility"}},"required":["eventId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 11),

('google-calendar', 'Google Calendar', 'add_attendee',
 'Add an attendee to an existing calendar event.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"eventId":{"type":"string","description":"Event ID"},"attendeeEmail":{"type":"string","description":"Email address of the attendee to add"},"attendeeName":{"type":"string","description":"Display name of the attendee"},"optional":{"type":"boolean","description":"Whether the attendee is optional"}},"required":["eventId","attendeeEmail"],"additionalProperties":false}'::jsonb,
 'write', true, false, 12),

('google-calendar', 'Google Calendar', 'remove_attendee',
 'Remove an attendee by email from an event.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId', 'POST', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID (default: primary)"},"eventId":{"type":"string","description":"Event ID"},"attendeeEmail":{"type":"string","description":"Email address of the attendee to remove"}},"required":["eventId","attendeeEmail"],"additionalProperties":false}'::jsonb,
 'write', true, false, 13),

-- Destructive actions
('google-calendar', 'Google Calendar', 'delete_event',
 'Delete a calendar event.',
 'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId', 'DELETE', 'google-calendar',
 '{"type":"object","properties":{"calendarId":{"type":"string","description":"Calendar ID"},"eventId":{"type":"string","description":"Event ID to delete"}},"required":["calendarId","eventId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 14)

ON CONFLICT (provider, action_name) DO NOTHING;
