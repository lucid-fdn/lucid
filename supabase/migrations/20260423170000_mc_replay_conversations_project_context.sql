CREATE OR REPLACE FUNCTION mc_replay_conversations(
  p_org_id UUID,
  p_agent_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(conv ORDER BY latest_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      ie.id AS conversation_id,
      aa.id AS agent_id,
      aa.name AS agent_name,
      p.slug AS project_slug,
      p.name AS project_name,
      ac.channel_type,
      ie.external_user_id,
      ie.status,
      ie.created_at AS started_at,
      ie.processed_at AS finished_at,
      LEFT(ie.message_text, 100) AS preview,
      ie.created_at AS latest_at
    FROM assistant_inbound_events ie
    JOIN assistant_channels ac ON ac.id = ie.channel_id
    JOIN ai_assistants aa ON aa.id = ac.assistant_id
    LEFT JOIN projects p ON p.id = aa.project_id
    WHERE aa.org_id = p_org_id
      AND aa.deleted_at IS NULL
      AND (p_agent_id IS NULL OR aa.id = p_agent_id)
    ORDER BY ie.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) conv;

  RETURN result;
END;
$$;
