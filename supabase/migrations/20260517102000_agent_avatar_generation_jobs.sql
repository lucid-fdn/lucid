CREATE TABLE IF NOT EXISTS public.agent_avatar_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  draft_id TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  spec JSONB NOT NULL,
  asset_id UUID REFERENCES public.agent_avatar_assets(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 2,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_avatar_generation_jobs_org_created_at
  ON public.agent_avatar_generation_jobs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_avatar_generation_jobs_status_created_at
  ON public.agent_avatar_generation_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_avatar_generation_jobs_assistant_created_at
  ON public.agent_avatar_generation_jobs (assistant_id, created_at DESC)
  WHERE assistant_id IS NOT NULL;

ALTER TABLE public.agent_avatar_generation_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_avatar_generation_jobs'
      AND policyname = 'Org members can read agent avatar generation jobs'
  ) THEN
    CREATE POLICY "Org members can read agent avatar generation jobs"
      ON public.agent_avatar_generation_jobs
      FOR SELECT
      USING (
        org_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
        OR org_id IN (
          SELECT org_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_avatar_generation_jobs'
      AND policyname = 'Org members can insert agent avatar generation jobs'
  ) THEN
    CREATE POLICY "Org members can insert agent avatar generation jobs"
      ON public.agent_avatar_generation_jobs
      FOR INSERT
      WITH CHECK (
        org_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
        OR org_id IN (
          SELECT org_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_avatar_generation_jobs'
      AND policyname = 'Org members can update agent avatar generation jobs'
  ) THEN
    CREATE POLICY "Org members can update agent avatar generation jobs"
      ON public.agent_avatar_generation_jobs
      FOR UPDATE
      USING (
        org_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
        OR org_id IN (
          SELECT org_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        org_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
        OR org_id IN (
          SELECT org_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END
$$;

COMMENT ON TABLE public.agent_avatar_generation_jobs IS
  'Durable async jobs for agent avatar generation and identity-preserving regeneration.';
