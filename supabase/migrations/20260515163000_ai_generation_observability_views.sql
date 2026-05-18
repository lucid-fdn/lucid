CREATE OR REPLACE VIEW public.ai_generation_usage_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS day,
  metadata ->> 'orgId' AS org_id,
  metadata ->> 'assistantId' AS assistant_id,
  metadata ->> 'projectId' AS project_id,
  feature,
  metadata ->> 'modality' AS modality,
  metadata ->> 'provider' AS provider,
  metadata ->> 'model' AS model,
  count(*)::bigint AS request_count,
  count(*) FILTER (WHERE success)::bigint AS success_count,
  count(*) FILTER (WHERE NOT success)::bigint AS failure_count,
  coalesce(sum(tokens_used), 0)::bigint AS total_tokens,
  coalesce(sum(nullif(metadata #>> '{usage,inputTokens}', '')::numeric), 0)::numeric AS input_tokens,
  coalesce(sum(nullif(metadata #>> '{usage,outputTokens}', '')::numeric), 0)::numeric AS output_tokens,
  coalesce(sum(nullif(metadata #>> '{usage,imageTokens}', '')::numeric), 0)::numeric AS image_tokens,
  coalesce(sum(nullif(metadata #>> '{usage,textTokens}', '')::numeric), 0)::numeric AS text_tokens,
  coalesce(sum(nullif(metadata #>> '{usage,bytes}', '')::numeric), 0)::numeric AS bytes,
  coalesce(sum(nullif(metadata #>> '{usage,estimatedCostUsd}', '')::numeric), 0)::numeric AS estimated_cost_usd,
  avg(nullif(metadata #>> '{receipt,latencyMs}', '')::numeric) AS avg_latency_ms
FROM public.ai_generation_events
GROUP BY
  date_trunc('day', created_at)::date,
  metadata ->> 'orgId',
  metadata ->> 'assistantId',
  metadata ->> 'projectId',
  feature,
  metadata ->> 'modality',
  metadata ->> 'provider',
  metadata ->> 'model';

CREATE OR REPLACE VIEW public.ai_generation_avatar_failures_recent
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  feature,
  metadata ->> 'modality' AS modality,
  metadata ->> 'orgId' AS org_id,
  metadata ->> 'assistantId' AS assistant_id,
  metadata ->> 'projectId' AS project_id,
  metadata ->> 'provider' AS provider,
  metadata ->> 'model' AS model,
  tokens_used,
  nullif(metadata #>> '{usage,estimatedCostUsd}', '')::numeric AS estimated_cost_usd,
  nullif(metadata #>> '{receipt,latencyMs}', '')::numeric AS latency_ms,
  metadata ->> 'error' AS error,
  metadata,
  created_at
FROM public.ai_generation_events
WHERE feature = 'agent-avatar-generation'
  AND success = false;

COMMENT ON VIEW public.ai_generation_usage_daily IS
  'Daily AI generation usage rollups by org, assistant, modality, feature, provider, and model.';

COMMENT ON VIEW public.ai_generation_avatar_failures_recent IS
  'Recent failed agent avatar generations with normalized failure reasons for dashboard and support UI.';
