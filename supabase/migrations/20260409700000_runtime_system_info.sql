-- Migration: Add system_info JSONB to dedicated_runtimes
-- Stores hardware specs reported via heartbeat (CPU model, cores, RAM total, etc.)
-- Also re-applies channel_mode column in case prior migration was marked but not executed.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS system_info JSONB;

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS channel_mode TEXT DEFAULT 'relay'
    CHECK (channel_mode IN ('relay', 'native'));

-- Recreate mc_runtimes to include system_info
-- Must drop first because return type changed (added system_info column)
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
  channel_mode TEXT,
  system_info JSONB,
  created_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    dr.id, dr.display_name, dr.description, dr.provider, dr.status,
    dr.runtime_tier,
    dr.last_seen_at, dr.openclaw_version,
    dr.cpu_percent, dr.ram_percent, dr.disk_percent, dr.gpu_percent,
    dr.worker_pending_events, dr.worker_dead_letters,
    (SELECT COUNT(*) FROM ai_assistants WHERE runtime_id = dr.id AND deleted_at IS NULL)::BIGINT AS agent_count,
    dr.deployment_url, dr.l2_deployment_id, dr.channel_mode,
    dr.system_info, dr.created_at
  FROM dedicated_runtimes dr
  WHERE dr.org_id = p_org_id
    AND dr.status != 'revoked'
  ORDER BY dr.created_at DESC;
$$;
