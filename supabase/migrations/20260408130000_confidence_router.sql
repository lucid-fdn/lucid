-- Phase 5N, Chunk 3: Confidence Router replay + payload threading.
--
-- Two concerns in one migration because they're tightly coupled:
--
--   1. Add `confidence_router_version TEXT` and `confidence_router_notes JSONB`
--      columns to `orchestration_dag_nodes` so every router decision is
--      replayable. These columns are nullable — Phase 4N-d static-gate
--      evaluations leave them NULL, Phase 5N router evaluations stamp
--      them alongside `confidence_observed` / `confidence_source`.
--
--   2. Extend the three promotion RPCs (`dag_promote_roots`,
--      `dag_complete_node`, `dag_promote_added_subgraph`) to also return
--      `payload JSONB`. The Phase 5N router reads signals off the payload
--      (tool_names, schema, allow_external_upgrade), so the scheduler
--      needs it in the same round-trip — one extra SELECT per leaf
--      during promotion would scale badly under high fan-out.
--
-- The RPCs are DROP-then-CREATE because postgres treats RETURNS TABLE
-- as part of the function identity — CREATE OR REPLACE with a changed
-- return tuple fails with "cannot change return type of existing function".

-- ============================================================================
-- Columns: router replay tags
-- ============================================================================
ALTER TABLE orchestration_dag_nodes
  ADD COLUMN IF NOT EXISTS confidence_router_version TEXT,
  ADD COLUMN IF NOT EXISTS confidence_router_notes JSONB;

COMMENT ON COLUMN orchestration_dag_nodes.confidence_router_version IS
  'Phase 5N: ROUTER_VERSION stamp at evaluation time. NULL for static-gate evaluations.';
COMMENT ON COLUMN orchestration_dag_nodes.confidence_router_notes IS
  'Phase 5N: full per-route audit trail (base, delta, observed, signalHits) from ConfidenceRouter. NULL for static-gate.';

-- ============================================================================
-- dag_promote_roots — now returns payload
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
  confidence_floor NUMERIC,
  payload JSONB
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
  RETURNING id, node_key, node_type, step_type, runtime_target, route_class, confidence_floor, payload;
$$;

GRANT EXECUTE ON FUNCTION dag_promote_roots(UUID) TO service_role;

-- ============================================================================
-- dag_complete_node — now returns payload
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
  confidence_floor NUMERIC,
  payload JSONB
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
  RETURNING n.id, n.node_key, n.node_type, n.step_type, n.runtime_target, n.route_class, n.confidence_floor, n.payload;
$$;

GRANT EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) TO service_role;

-- ============================================================================
-- dag_promote_added_subgraph — now returns payload
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
  confidence_floor NUMERIC,
  payload JSONB
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
    RETURNING n.id, n.node_key, n.node_type, n.step_type, n.runtime_target, n.route_class, n.confidence_floor, n.payload;
END;
$$;

GRANT EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) TO service_role;
