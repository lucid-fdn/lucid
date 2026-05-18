CREATE TABLE IF NOT EXISTS public.agent_avatar_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  launched_agent_id UUID REFERENCES public.launched_agents(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'avatars',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('trustgate', 'openai')),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  style_preset TEXT NOT NULL,
  angle TEXT NOT NULL,
  crop TEXT NOT NULL,
  expression TEXT,
  background TEXT,
  lighting TEXT,
  reference_asset_id UUID REFERENCES public.agent_avatar_assets(id) ON DELETE SET NULL,
  generation_event_id UUID REFERENCES public.ai_generation_events(id) ON DELETE SET NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'archived', 'failed')),
  is_current BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_avatar_assets_one_current
  ON public.agent_avatar_assets (assistant_id)
  WHERE is_current = true AND assistant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_avatar_assets_org_created_at
  ON public.agent_avatar_assets (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_avatar_assets_assistant_created_at
  ON public.agent_avatar_assets (assistant_id, created_at DESC)
  WHERE assistant_id IS NOT NULL;

ALTER TABLE public.agent_avatar_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_avatar_assets'
      AND policyname = 'Org members can read agent avatar assets'
  ) THEN
    CREATE POLICY "Org members can read agent avatar assets"
      ON public.agent_avatar_assets
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
      AND tablename = 'agent_avatar_assets'
      AND policyname = 'Org members can insert agent avatar assets'
  ) THEN
    CREATE POLICY "Org members can insert agent avatar assets"
      ON public.agent_avatar_assets
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
      AND tablename = 'agent_avatar_assets'
      AND policyname = 'Org members can update agent avatar assets'
  ) THEN
    CREATE POLICY "Org members can update agent avatar assets"
      ON public.agent_avatar_assets
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

COMMENT ON TABLE public.agent_avatar_assets IS
  'Lucid-owned generated avatar assets for AI assistants and agent launchpad profiles.';

COMMENT ON COLUMN public.agent_avatar_assets.prompt_version IS
  'Versioned prompt compiler key, for example agent-avatar-v1.';
