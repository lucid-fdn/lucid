CREATE TABLE IF NOT EXISTS assistant_channel_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  surface_owner_kind TEXT NOT NULL,
  surface_owner_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_channel_aliases_active_unique_idx
  ON assistant_channel_aliases (channel_type, surface_owner_kind, surface_owner_id, normalized_alias)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS assistant_channel_aliases_assistant_idx
  ON assistant_channel_aliases (assistant_id);

CREATE INDEX IF NOT EXISTS assistant_channel_aliases_surface_idx
  ON assistant_channel_aliases (channel_type, surface_owner_kind, surface_owner_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS channel_surface_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  surface_owner_kind TEXT NOT NULL,
  surface_owner_id TEXT NOT NULL,
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  assistant_channel_id UUID REFERENCES assistant_channels(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_surface_defaults_active_unique_idx
  ON channel_surface_defaults (channel_type, surface_owner_kind, surface_owner_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS channel_surface_defaults_assistant_idx
  ON channel_surface_defaults (assistant_id);

CREATE INDEX IF NOT EXISTS channel_surface_defaults_surface_idx
  ON channel_surface_defaults (channel_type, surface_owner_kind, surface_owner_id)
  WHERE is_active = true;
