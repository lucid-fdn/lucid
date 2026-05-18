-- Fix dag_complete_node child promotion.
--
-- The previous implementation decremented child pending_parent_count in one
-- UPDATE and then attempted to promote the same child rows in a second UPDATE
-- against orchestration_dag_nodes. PostgreSQL does not reliably allow updating
-- the same row twice in one statement chain, which can leave children at
-- pending_parent_count = 0 but status = 'pending'. This single UPDATE both
-- decrements and promotes rows atomically.

CREATE OR REPLACE FUNCTION dag_complete_node(p_dag_id UUID, p_node_id UUID)
RETURNS TABLE (
  id UUID,
  node_key TEXT,
  node_type TEXT,
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT,
  confidence_floor NUMERIC,
  payload JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      n.id,
      n.pending_parent_count - 1 AS next_pending_parent_count,
      n.status AS previous_status
    FROM orchestration_dag_nodes n
    JOIN orchestration_dag_edges e
      ON e.child_node_id = n.id
     AND e.dag_id = p_dag_id
     AND e.parent_node_id = p_node_id
    WHERE n.dag_id = p_dag_id
      AND n.pending_parent_count > 0
  ),
  updated AS (
    UPDATE orchestration_dag_nodes n
       SET pending_parent_count = c.next_pending_parent_count,
           status = CASE
             WHEN c.next_pending_parent_count = 0 AND c.previous_status = 'pending'
               THEN 'ready'
             ELSE n.status
           END,
           ready_at = CASE
             WHEN c.next_pending_parent_count = 0 AND c.previous_status = 'pending'
               THEN NOW()
             ELSE n.ready_at
           END
      FROM candidates c
     WHERE n.id = c.id
    RETURNING
      n.id,
      n.node_key,
      n.node_type,
      n.step_type,
      n.runtime_target,
      n.route_class,
      n.confidence_floor,
      n.payload,
      c.next_pending_parent_count,
      c.previous_status
  )
  SELECT
    u.id,
    u.node_key,
    u.node_type,
    u.step_type,
    u.runtime_target,
    u.route_class,
    u.confidence_floor,
    u.payload
  FROM updated u
  WHERE u.next_pending_parent_count = 0
    AND u.previous_status = 'pending';
$$;

REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) TO service_role;
