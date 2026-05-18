-- Phase 4N-d, Task 74: Extend promotion RPCs to return confidence_floor
-- so the IncrementalScheduler can evaluate the confidence gate at
-- ready-transition time without a follow-up SELECT.
--
-- Three RPCs are re-created (same bodies, confidence_floor added to
-- the RETURNING tuple):
--   - dag_promote_roots
--   - dag_complete_node
--   - dag_promote_added_subgraph
--
-- The `DROP FUNCTION` is required because postgres treats the RETURNS
-- TABLE signature as part of the function identity — a CREATE OR
-- REPLACE with a different RETURNS TABLE shape fails with
-- "cannot change return type of existing function".

-- ============================================================================
-- dag_promote_roots
-- ============================================================================
DROP FUNCTION IF EXISTS dag_promote_roots(UUID);

CREATE OR REPLACE FUNCTION dag_promote_roots(p_dag_id UUID)
RETURNS TABLE (
  id UUID,
  node_key TEXT,
  node_type TEXT,
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT,
  confidence_floor NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE orchestration_dag_nodes
     SET status = 'ready',
         ready_at = NOW()
   WHERE dag_id = p_dag_id
     AND pending_parent_count = 0
     AND status = 'pending'
  RETURNING id, node_key, node_type, step_type, runtime_target, route_class, confidence_floor;
$$;

GRANT EXECUTE ON FUNCTION dag_promote_roots(UUID) TO service_role;

-- ============================================================================
-- dag_complete_node
-- ============================================================================
DROP FUNCTION IF EXISTS dag_complete_node(UUID, UUID);

CREATE OR REPLACE FUNCTION dag_complete_node(p_dag_id UUID, p_node_id UUID)
RETURNS TABLE (
  id UUID,
  node_key TEXT,
  node_type TEXT,
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT,
  confidence_floor NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH decremented AS (
    UPDATE orchestration_dag_nodes n
       SET pending_parent_count = n.pending_parent_count - 1
      FROM orchestration_dag_edges e
     WHERE e.dag_id = p_dag_id
       AND e.parent_node_id = p_node_id
       AND n.id = e.child_node_id
    RETURNING n.id, n.pending_parent_count, n.status
  )
  UPDATE orchestration_dag_nodes n
     SET status = 'ready',
         ready_at = NOW()
    FROM decremented d
   WHERE n.id = d.id
     AND d.pending_parent_count = 0
     AND d.status = 'pending'
  RETURNING n.id, n.node_key, n.node_type, n.step_type, n.runtime_target, n.route_class, n.confidence_floor;
$$;

GRANT EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) TO service_role;

-- ============================================================================
-- dag_promote_added_subgraph
-- ============================================================================
DROP FUNCTION IF EXISTS dag_promote_added_subgraph(UUID, UUID[]);

CREATE OR REPLACE FUNCTION dag_promote_added_subgraph(
  p_dag_id UUID,
  p_node_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  node_key TEXT,
  node_type TEXT,
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT,
  confidence_floor NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orchestration_dag_nodes n
     SET pending_parent_count = (
           SELECT COUNT(*)
             FROM orchestration_dag_edges e
             JOIN orchestration_dag_nodes p ON p.id = e.parent_node_id
            WHERE e.dag_id = p_dag_id
              AND e.child_node_id = n.id
              AND p.status NOT IN ('completed', 'skipped')
         )
   WHERE n.dag_id = p_dag_id
     AND n.id = ANY(p_node_ids);

  RETURN QUERY
    UPDATE orchestration_dag_nodes n
       SET status = 'ready',
           ready_at = NOW()
     WHERE n.dag_id = p_dag_id
       AND n.id = ANY(p_node_ids)
       AND n.pending_parent_count = 0
       AND n.status = 'pending'
    RETURNING n.id, n.node_key, n.node_type, n.step_type, n.runtime_target, n.route_class, n.confidence_floor;
END;
$$;

GRANT EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) TO service_role;
