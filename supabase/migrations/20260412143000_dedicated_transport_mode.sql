-- Dedicated scheduler transport mode for runtime rows.
-- Keeps relay/native Pulse explicit instead of inferring it indirectly from channel mode.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS dedicated_transport_mode TEXT DEFAULT 'relay'
    CHECK (dedicated_transport_mode IN ('relay', 'native_pulse'));

UPDATE dedicated_runtimes
SET dedicated_transport_mode = CASE
  WHEN channel_mode = 'native' THEN 'native_pulse'
  ELSE 'relay'
END
WHERE dedicated_transport_mode IS NULL;

ALTER TABLE dedicated_runtimes
  ALTER COLUMN dedicated_transport_mode SET DEFAULT 'relay';

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
  dedicated_transport_mode TEXT,
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
    dr.dedicated_transport_mode,
    dr.system_info, dr.created_at
  FROM dedicated_runtimes dr
  WHERE dr.org_id = p_org_id
    AND dr.status != 'revoked'
  ORDER BY dr.created_at DESC;
$$;
