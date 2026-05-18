ALTER TABLE public.agent_avatar_generation_jobs
  ADD COLUMN IF NOT EXISTS progress_stage TEXT,
  ADD COLUMN IF NOT EXISTS progress_percent INTEGER CHECK (
    progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100)
  ),
  ADD COLUMN IF NOT EXISTS partial_assets JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS agent_avatar_generation_jobs_progress_updated
  ON public.agent_avatar_generation_jobs (status, updated_at DESC)
  WHERE status IN ('queued', 'running');

COMMENT ON COLUMN public.agent_avatar_generation_jobs.progress_stage
  IS 'Latest user-facing progress stage for async avatar generation.';

COMMENT ON COLUMN public.agent_avatar_generation_jobs.progress_percent
  IS 'Best-effort user-facing async avatar generation progress percentage.';

COMMENT ON COLUMN public.agent_avatar_generation_jobs.partial_assets
  IS 'Partial image preview assets emitted by streaming image providers.';
