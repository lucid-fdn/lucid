-- Forward repair for linked projects that recorded the Knowledge safety
-- migration but only received the older assistant_memory source_message_id
-- column. Keep this additive so it is safe across local, staging, and prod.

ALTER TABLE public.assistant_memory
  ADD COLUMN IF NOT EXISTS source_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_run_id TEXT,
  ADD COLUMN IF NOT EXISTS source_channel_type TEXT,
  ADD COLUMN IF NOT EXISTS source_channel_id UUID REFERENCES public.assistant_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_conversation_id UUID,
  ADD COLUMN IF NOT EXISTS source_inbound_event_id UUID REFERENCES public.assistant_inbound_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS source_evidence_handle TEXT,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS assistant_memory_scope_lookup_idx
  ON public.assistant_memory (assistant_id, scoped_user_id, last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS assistant_memory_source_org_idx
  ON public.assistant_memory (source_org_id)
  WHERE source_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_memory_source_project_idx
  ON public.assistant_memory (source_project_id)
  WHERE source_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_memory_source_channel_idx
  ON public.assistant_memory (source_channel_type, source_channel_id)
  WHERE source_channel_type IS NOT NULL;
