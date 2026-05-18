-- Rename runtime_tier value 'managed' → 'dedicated'.
-- Existing rows updated, CHECK constraint replaced.

-- 1. Update existing rows
UPDATE dedicated_runtimes SET runtime_tier = 'dedicated' WHERE runtime_tier = 'managed';

-- 2. Drop old CHECK and add new one
ALTER TABLE dedicated_runtimes DROP CONSTRAINT IF EXISTS dedicated_runtimes_runtime_tier_check;
ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_runtime_tier_check
    CHECK (runtime_tier IN ('dedicated', 'byo'));

-- 3. Recreate mc_runtimes RPC to reflect the new value.
DROP FUNCTION IF EXISTS mc_runtimes(UUID);
CREATE OR REPLACE FUNCTION mc_runtimes(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  description TEXT,
  provider TEXT,
  status TEXT,
  runtime_tier TEXT,
  last_seen_at TIMESTAMPTZ,
  openclaw_version TEXT,
  cpu_percent NUMERIC,
  ram_percent NUMERIC,
  disk_percent NUMERIC,
  gpu_percent NUMERIC,
  worker_pending_events INT,
  worker_dead_letters INT,
  agent_count BIGINT,
  deployment_url TEXT,
  l2_deployment_id TEXT,
  created_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    dr.id, dr.display_name, dr.description, dr.provider, dr.status,
    dr.runtime_tier,
    dr.last_seen_at, dr.openclaw_version,
    dr.cpu_percent, dr.ram_percent, dr.disk_percent, dr.gpu_percent,
    dr.worker_pending_events, dr.worker_dead_letters,
    (SELECT COUNT(*) FROM ai_assistants WHERE runtime_id = dr.id AND deleted_at IS NULL)::BIGINT AS agent_count,
    dr.deployment_url, dr.l2_deployment_id, dr.created_at
  FROM dedicated_runtimes dr
  WHERE dr.org_id = p_org_id
    AND dr.status != 'revoked'
  ORDER BY dr.created_at DESC;
$$;
