-- Phase 4N-a, Task 25: DAG scheduler RPCs
--
-- The IncrementalScheduler cannot express the atomic
-- decrement-and-claim CTE through supabase-js's fluent query builder,
-- so the four hot-path statements ship as `SECURITY DEFINER` RPCs that
-- the worker calls via `supabase.rpc()`. Every RPC is:
--   - Bounded (edge-scoped, never a full-DAG scan)
--   - Single-statement (no read-then-write races)
--   - Returns just enough to drive the next scheduler step

-- ============================================================================
-- dag_promote_roots — used by scheduler.onDagCreated()
--   Flips every root node (pending_parent_count = 0) to ready in one
--   UPDATE … RETURNING. Never selects the full node set.
-- ============================================================================
CREATE OR REPLACE FUNCTION dag_promote_roots(p_dag_id UUID)
RETURNS TABLE (
  id UUID,
  node_key TEXT,
  node_type TEXT,
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT
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
  RETURNING id, node_key, node_type, step_type, runtime_target, route_class;
$$;

-- ============================================================================
-- dag_complete_node — used by scheduler.onNodeComplete()
--
-- THIS is the single-statement decrement-and-claim. For every child of
-- the completed node, decrement pending_parent_count. In the SAME
-- statement, promote any child whose counter hit 0 AND is still
-- pending. The row-level lock on each child serializes concurrent
-- two-parent completions, so the `status = 'pending'` guard ensures
-- exactly one writer can promote a join node.
--
-- Returns the promoted rows so the scheduler can enqueue them.
-- ============================================================================
CREATE OR REPLACE FUNCTION dag_complete_node(p_dag_id UUID, p_node_id UUID)
RETURNS TABLE (
  id UUID,
  node_key TEXT,
  node_type TEXT,
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT
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
  RETURNING n.id, n.node_key, n.node_type, n.step_type, n.runtime_target, n.route_class;
$$;

-- ============================================================================
-- dag_cancel_subtree — used by scheduler.onNodeFail() for non-retryable
-- failures. BFS over edges from a root node, cancelling every
-- unfinished descendant. Bounded by the subtree, never the full DAG.
-- ============================================================================
CREATE OR REPLACE FUNCTION dag_cancel_subtree(p_dag_id UUID, p_root_node_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT e.child_node_id AS node_id
      FROM orchestration_dag_edges e
     WHERE e.dag_id = p_dag_id
       AND e.parent_node_id = p_root_node_id
    UNION
    SELECT e.child_node_id
      FROM orchestration_dag_edges e
      JOIN subtree s ON e.parent_node_id = s.node_id
     WHERE e.dag_id = p_dag_id
  ), cancelled AS (
    UPDATE orchestration_dag_nodes n
       SET status = 'cancelled',
           completed_at = NOW()
      FROM subtree s
     WHERE n.id = s.node_id
       AND n.dag_id = p_dag_id
       AND n.status IN ('pending', 'ready')
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM cancelled;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- dag_bump_completed — used by scheduler.onNodeComplete() to advance
-- the DAG header counters atomically and return the new values so the
-- scheduler can detect completion without a follow-up SELECT.
-- ============================================================================
CREATE OR REPLACE FUNCTION dag_bump_completed(p_dag_id UUID)
RETURNS TABLE (completed_nodes INTEGER, total_nodes INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE orchestration_dags
     SET completed_nodes = completed_nodes + 1,
         updated_at = NOW()
   WHERE id = p_dag_id
  RETURNING completed_nodes, total_nodes;
$$;

-- RLS: these RPCs run as SECURITY DEFINER and only touch rows already
-- scoped by dag_id. The worker uses the service-role key. End-user API
-- callers use the existing RLS policies on orchestration_dag_nodes/edges
-- for reads and do NOT call these RPCs directly.
GRANT EXECUTE ON FUNCTION dag_promote_roots(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION dag_cancel_subtree(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION dag_bump_completed(UUID) TO service_role;
