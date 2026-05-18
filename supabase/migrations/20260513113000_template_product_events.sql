-- Template product analytics.
-- Append-only funnel events for preview -> install -> first run -> repeat use.

CREATE TABLE IF NOT EXISTS public.template_product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  template_id TEXT,
  template_slug TEXT NOT NULL CHECK (char_length(template_slug) BETWEEN 1 AND 200),
  template_name TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('agent', 'team', 'capability')),
  backing_kind TEXT CHECK (backing_kind IS NULL OR backing_kind = 'lucid_pack'),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'gallery_view',
      'detail_view',
      'preview',
      'install',
      'reconcile',
      'first_run',
      'repeat_use',
      'combine_view',
      'combine_click'
    )
  ),
  source TEXT NOT NULL DEFAULT 'templates'
    CHECK (source IN ('templates', 'template_detail', 'installed_capability', 'channel', 'mission_control', 'api')),
  install_id UUID,
  run_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT template_product_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_template_product_events_org_created
  ON public.template_product_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_product_events_template
  ON public.template_product_events(org_id, template_slug, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_product_events_funnel
  ON public.template_product_events(org_id, event_type, created_at DESC);

ALTER TABLE public.template_product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_product_events_org_select ON public.template_product_events;
CREATE POLICY template_product_events_org_select ON public.template_product_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS template_product_events_service_all ON public.template_product_events;
CREATE POLICY template_product_events_service_all ON public.template_product_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
