-- App Service Foundry persistence and public runtime accounting.
-- Completes the database substrate expected by contracts/app-service.ts and
-- src/lib/app-service/* without introducing a separate agent-app platform.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.app_service_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.app_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NULL,
  org_id UUID NULL,
  project_id UUID NULL,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,120}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('platform', 'community', 'org')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'deprecated')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  spec JSONB NOT NULL,
  frontend_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  upgrade_metadata JSONB NOT NULL DEFAULT '{"schema_version":"1.0","channel":"stable","compatible_from":[],"migration_steps":[]}'::jsonb,
  discovery_metadata JSONB NOT NULL DEFAULT '{"schema_version":"1.0","protocols":[],"mcp":[],"a2a":[]}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  install_count INTEGER NOT NULL DEFAULT 0 CHECK (install_count >= 0),
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_blueprints_source_slug_version_uniq
  ON public.app_blueprints (source, lower(slug), version);
CREATE INDEX IF NOT EXISTS app_blueprints_source_status_idx
  ON public.app_blueprints (source, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_blueprints_org_status_idx
  ON public.app_blueprints (org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_blueprints_tags_idx
  ON public.app_blueprints USING gin (tags);

DROP TRIGGER IF EXISTS app_blueprints_set_updated_at ON public.app_blueprints;
CREATE TRIGGER app_blueprints_set_updated_at
  BEFORE UPDATE ON public.app_blueprints
  FOR EACH ROW
  EXECUTE FUNCTION public.app_service_set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  project_id UUID NOT NULL,
  environment_id UUID NULL,
  created_by UUID NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'planning', 'awaiting_input', 'generating', 'building', 'evaluating', 'deploying', 'succeeded', 'failed', 'cancelled')
  ),
  stage TEXT NULL,
  progress NUMERIC NULL CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_spec JSONB NULL,
  selected_blueprint_id UUID NULL REFERENCES public.app_blueprints(id) ON DELETE SET NULL,
  app_deployment_id UUID NULL,
  idempotency_key TEXT NULL,
  provider_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_cents >= 0),
  error_code TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_generation_runs_org_idempotency_uniq
  ON public.app_generation_runs (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_generation_runs_org_project_updated_idx
  ON public.app_generation_runs (org_id, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_generation_runs_status_created_idx
  ON public.app_generation_runs (status, created_at ASC);
CREATE INDEX IF NOT EXISTS app_generation_runs_app_idx
  ON public.app_generation_runs (app_deployment_id);

DROP TRIGGER IF EXISTS app_generation_runs_set_updated_at ON public.app_generation_runs;
CREATE TRIGGER app_generation_runs_set_updated_at
  BEFORE UPDATE ON public.app_generation_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.app_service_set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  project_id UUID NOT NULL,
  environment_id UUID NULL,
  template_id UUID NULL,
  blueprint_id UUID NULL REFERENCES public.app_blueprints(id) ON DELETE SET NULL,
  generation_run_id UUID NULL REFERENCES public.app_generation_runs(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,120}$'),
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('draft', 'preview', 'active', 'paused', 'failed', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'unlisted' CHECK (visibility IN ('private', 'unlisted', 'public')),
  frontend_strategy TEXT NOT NULL DEFAULT 'manifest' CHECK (frontend_strategy IN ('manifest', 'generated_code', 'external')),
  frontend_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_url TEXT NULL,
  preview_url TEXT NULL,
  custom_domain TEXT NULL,
  assistant_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  crew_id UUID NULL,
  dag_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  template_deployment_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  runtime_id UUID NULL,
  deployment_target TEXT NOT NULL DEFAULT 'lucid_hosted' CHECK (deployment_target IN ('lucid_hosted', 'vercel', 'netlify', 'docker')),
  latest_artifact_id UUID NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deployed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS app_deployments_public_slug_uniq
  ON public.app_deployments (lower(slug))
  WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS app_deployments_org_project_updated_idx
  ON public.app_deployments (org_id, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_deployments_org_status_idx
  ON public.app_deployments (org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_deployments_generation_run_idx
  ON public.app_deployments (generation_run_id);
CREATE INDEX IF NOT EXISTS app_deployments_runtime_idx
  ON public.app_deployments (runtime_id);

DROP TRIGGER IF EXISTS app_deployments_set_updated_at ON public.app_deployments;
CREATE TRIGGER app_deployments_set_updated_at
  BEFORE UPDATE ON public.app_deployments
  FOR EACH ROW
  EXECUTE FUNCTION public.app_service_set_updated_at();

ALTER TABLE public.app_generation_runs
  DROP CONSTRAINT IF EXISTS app_generation_runs_app_deployment_id_fkey;
ALTER TABLE public.app_generation_runs
  ADD CONSTRAINT app_generation_runs_app_deployment_id_fkey
  FOREIGN KEY (app_deployment_id) REFERENCES public.app_deployments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.app_deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  generation_run_id UUID NULL REFERENCES public.app_generation_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
  message TEXT NULL,
  provider TEXT NULL,
  external_id TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_deployment_events_app_created_idx
  ON public.app_deployment_events (app_deployment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_deployment_events_generation_created_idx
  ON public.app_deployment_events (generation_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_deployment_events_type_created_idx
  ON public.app_deployment_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_blueprint_upgrade_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NOT NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  project_id UUID NOT NULL,
  from_blueprint_id UUID NULL REFERENCES public.app_blueprints(id) ON DELETE SET NULL,
  to_blueprint_id UUID NULL REFERENCES public.app_blueprints(id) ON DELETE SET NULL,
  target_blueprint_slug TEXT NOT NULL,
  from_version TEXT NULL,
  to_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'applied', 'blocked', 'failed')),
  plan JSONB NOT NULL,
  created_by UUID NOT NULL,
  applied_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS app_blueprint_upgrade_runs_app_created_idx
  ON public.app_blueprint_upgrade_runs (app_deployment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_blueprint_upgrade_runs_org_created_idx
  ON public.app_blueprint_upgrade_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_blueprint_upgrade_runs_status_idx
  ON public.app_blueprint_upgrade_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  generation_run_id UUID NOT NULL REFERENCES public.app_generation_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('manifest', 'source_archive', 'build_log', 'preview_screenshot', 'eval_report', 'deployment_receipt')),
  version INTEGER NOT NULL CHECK (version > 0),
  storage_url TEXT NULL,
  checksum TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_artifacts_version_scoped_uniq
  ON public.app_artifacts (generation_run_id, app_deployment_id, kind, version)
  WHERE app_deployment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_artifacts_version_run_uniq
  ON public.app_artifacts (generation_run_id, kind, version)
  WHERE app_deployment_id IS NULL;
CREATE INDEX IF NOT EXISTS app_artifacts_app_created_idx
  ON public.app_artifacts (app_deployment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_artifacts_generation_created_idx
  ON public.app_artifacts (generation_run_id, created_at DESC);

ALTER TABLE public.app_deployments
  DROP CONSTRAINT IF EXISTS app_deployments_latest_artifact_id_fkey;
ALTER TABLE public.app_deployments
  ADD CONSTRAINT app_deployments_latest_artifact_id_fkey
  FOREIGN KEY (latest_artifact_id) REFERENCES public.app_artifacts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.app_frontend_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id UUID NOT NULL REFERENCES public.app_generation_runs(id) ON DELETE CASCADE,
  app_deployment_id UUID NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('v0', 'mock')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'ready', 'failed', 'cancelled')),
  provider_project_id TEXT NULL,
  provider_chat_id TEXT NULL,
  provider_version_id TEXT NULL,
  provider_deployment_id TEXT NULL,
  prompt_hash TEXT NULL,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_url TEXT NULL,
  web_url TEXT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_frontend_generations_generation_updated_idx
  ON public.app_frontend_generations (generation_run_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_frontend_generations_app_updated_idx
  ON public.app_frontend_generations (app_deployment_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_frontend_generations_provider_refs_idx
  ON public.app_frontend_generations (provider, provider_project_id, provider_chat_id);

DROP TRIGGER IF EXISTS app_frontend_generations_set_updated_at ON public.app_frontend_generations;
CREATE TRIGGER app_frontend_generations_set_updated_at
  BEFORE UPDATE ON public.app_frontend_generations
  FOR EACH ROW
  EXECUTE FUNCTION public.app_service_set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_external_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NOT NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('v0', 'vercel', 'netlify', 'docker')),
  external_project_id TEXT NULL,
  external_deployment_id TEXT NULL,
  external_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'building', 'ready', 'failed', 'cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_external_deployments_provider_deployment_uniq
  ON public.app_external_deployments (provider, external_deployment_id)
  WHERE external_deployment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_external_deployments_app_updated_idx
  ON public.app_external_deployments (app_deployment_id, updated_at DESC);

DROP TRIGGER IF EXISTS app_external_deployments_set_updated_at ON public.app_external_deployments;
CREATE TRIGGER app_external_deployments_set_updated_at
  BEFORE UPDATE ON public.app_external_deployments
  FOR EACH ROW
  EXECUTE FUNCTION public.app_service_set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_public_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NOT NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_preview TEXT NULL,
  label TEXT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}'::text[],
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_public_tokens_app_hash_uniq
  ON public.app_public_tokens (app_deployment_id, token_hash);
CREATE INDEX IF NOT EXISTS app_public_tokens_app_created_idx
  ON public.app_public_tokens (app_deployment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_allowed_origins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NOT NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_allowed_origins_app_origin_uniq
  ON public.app_allowed_origins (app_deployment_id, origin);

CREATE TABLE IF NOT EXISTS public.app_visitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NOT NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  external_session_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_visitor_sessions_app_expires_idx
  ON public.app_visitor_sessions (app_deployment_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.app_public_usage_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_deployment_id UUID NOT NULL REFERENCES public.app_deployments(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  project_id UUID NOT NULL,
  bucket_kind TEXT NOT NULL CHECK (bucket_kind IN ('day', 'month')),
  metric TEXT NOT NULL CHECK (metric IN ('public_requests', 'public_chat_cost_cents', 'public_chat_completions')),
  bucket_start TIMESTAMPTZ NOT NULL,
  count_value BIGINT NOT NULL DEFAULT 0 CHECK (count_value >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_public_usage_buckets_scope_uniq UNIQUE (app_deployment_id, bucket_kind, metric, bucket_start)
);

CREATE INDEX IF NOT EXISTS app_public_usage_buckets_app_start_idx
  ON public.app_public_usage_buckets (app_deployment_id, bucket_start DESC);
CREATE INDEX IF NOT EXISTS app_public_usage_buckets_org_metric_start_idx
  ON public.app_public_usage_buckets (org_id, metric, bucket_start DESC);

DROP TRIGGER IF EXISTS app_public_usage_buckets_set_updated_at ON public.app_public_usage_buckets;
CREATE TRIGGER app_public_usage_buckets_set_updated_at
  BEFORE UPDATE ON public.app_public_usage_buckets
  FOR EACH ROW
  EXECUTE FUNCTION public.app_service_set_updated_at();

CREATE OR REPLACE FUNCTION public.increment_app_public_usage_bucket(
  p_app_deployment_id UUID,
  p_org_id UUID,
  p_project_id UUID,
  p_bucket_kind TEXT,
  p_metric TEXT,
  p_bucket_start TIMESTAMPTZ,
  p_increment BIGINT,
  p_limit BIGINT DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, current_value BIGINT, limit_value BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current BIGINT;
BEGIN
  IF p_increment IS NULL OR p_increment < 0 THEN
    RAISE EXCEPTION 'p_increment must be non-negative';
  END IF;

  IF p_limit IS NOT NULL AND p_increment > p_limit THEN
    allowed := false;
    current_value := 0;
    limit_value := p_limit;
    RETURN NEXT;
    RETURN;
  END IF;

  LOOP
    UPDATE public.app_public_usage_buckets
    SET count_value = count_value + p_increment,
        org_id = p_org_id,
        project_id = p_project_id,
        updated_at = now()
    WHERE app_deployment_id = p_app_deployment_id
      AND bucket_kind = p_bucket_kind
      AND metric = p_metric
      AND bucket_start = p_bucket_start
      AND (p_limit IS NULL OR count_value + p_increment <= p_limit)
    RETURNING count_value INTO v_current;

    IF FOUND THEN
      allowed := true;
      current_value := v_current;
      limit_value := p_limit;
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT count_value
    INTO v_current
    FROM public.app_public_usage_buckets
    WHERE app_deployment_id = p_app_deployment_id
      AND bucket_kind = p_bucket_kind
      AND metric = p_metric
      AND bucket_start = p_bucket_start;

    IF FOUND THEN
      allowed := false;
      current_value := v_current;
      limit_value := p_limit;
      RETURN NEXT;
      RETURN;
    END IF;

    BEGIN
      INSERT INTO public.app_public_usage_buckets (
        app_deployment_id,
        org_id,
        project_id,
        bucket_kind,
        metric,
        bucket_start,
        count_value
      )
      VALUES (
        p_app_deployment_id,
        p_org_id,
        p_project_id,
        p_bucket_kind,
        p_metric,
        p_bucket_start,
        p_increment
      );

      allowed := true;
      current_value := p_increment;
      limit_value := p_limit;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent request created the bucket. Retry the guarded update.
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_app_public_usage_bucket(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, BIGINT, BIGINT)
  TO authenticated, service_role;

-- RLS keeps direct client access aligned with org membership. Server routes use
-- the service role, but policies make accidental direct use fail closed.
ALTER TABLE public.app_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_deployment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_blueprint_upgrade_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_frontend_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_external_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_public_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_allowed_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_public_usage_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_blueprints_platform_or_member_read ON public.app_blueprints
  FOR SELECT TO authenticated
  USING (
    source = 'platform'
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_blueprints.org_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY app_blueprints_org_write ON public.app_blueprints
  FOR ALL TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_blueprints.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_blueprints.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY app_generation_runs_org_read ON public.app_generation_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_generation_runs.org_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY app_generation_runs_org_write ON public.app_generation_runs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_generation_runs.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_generation_runs.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY app_deployments_org_read ON public.app_deployments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_deployments.org_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY app_deployments_org_write ON public.app_deployments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_deployments.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_deployments.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY app_blueprint_upgrade_runs_org_read ON public.app_blueprint_upgrade_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_blueprint_upgrade_runs.org_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY app_blueprint_upgrade_runs_org_write ON public.app_blueprint_upgrade_runs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_blueprint_upgrade_runs.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = app_blueprint_upgrade_runs.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
