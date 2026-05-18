-- Phase 4N-b, Task 35: DAG mutator RPCs
--
-- The DagMutator implements the spec §4.3 11-step CAS+lock+cycle+
-- idempotency flow. Steps 7+8+9 (CAS update + node/edge inserts +
-- mutation row insert) MUST run in a single Postgres transaction so a
-- caller crash mid-write cannot leave a half-applied mutation. The
-- supabase-js client cannot express multi-statement transactions
-- through the fluent query builder, so we ship the atomic core as a
-- `SECURITY DEFINER` plpgsql function the worker invokes via
-- `supabase.rpc()`.
--
-- Step 11 (`scheduler.onMutation`) runs OUTSIDE this RPC + outside the
-- Redis advisory lock, so a slow scheduler cannot deadlock concurrent
-- mutators. The promotion side is split into a second RPC
-- (`dag_promote_added_subgraph`) called by the scheduler.

-- ============================================================================
-- dag_apply_expand_mutation — atomic CAS + insert nodes/edges/mutation row
--
-- Behavior:
--   1. Idempotency short-circuit: if a mutation row with the same
--      (dag_id, idempotency_key) already exists, return its previously
--      applied_graph_version with `idempotent = true`. No writes.
--   2. CAS guard: SELECT current graph_version with FOR UPDATE; if it
--      no longer matches the caller's expected_version, raise
--      `cas_conflict`.
--   3. INSERT new nodes from p_new_nodes JSONB array. Each entry:
--      { id, node_key, node_type, step_type?, runtime_target?, route_class?,
--        payload?, confidence_floor? }
--      All inserted with pending_parent_count = 0. The mutator caller
--      pre-mints UUIDs so the agent tool can return them deterministically.
--   4. INSERT new edges from p_new_edges JSONB array. Each entry:
--      { parent_node_id, child_node_id, edge_kind? }
--   5. CAS UPDATE: bump graph_version, total_nodes += new node count.
--   6. INSERT mutation row.
--
-- The promotion side (set pending_parent_count from new edges, transition
-- count=0 nodes to ready) is intentionally NOT done here — it lives in
-- dag_promote_added_subgraph and runs AFTER this RPC commits + the
-- Redis advisory lock is released, so a slow scheduler can't block
-- other mutators.
--
-- All node + edge UUIDs the caller provides are trusted (the mutator
-- generates them via crypto.randomUUID() before calling).
-- ============================================================================
CREATE OR REPLACE FUNCTION dag_apply_expand_mutation(
  p_dag_id UUID,
  p_expected_version INTEGER,
  p_idempotency_key TEXT,
  p_mutation_type TEXT,
  p_source TEXT,
  p_source_run_id UUID,
  p_target_node_id UUID,
  p_applied_by_worker TEXT,
  p_new_nodes JSONB,
  p_new_edges JSONB
)
RETURNS TABLE (
  applied_graph_version INTEGER,
  added_node_ids UUID[],
  idempotent BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_mutation RECORD;
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_added_count INTEGER;
  v_added_ids UUID[];
BEGIN
  -- Step 1: idempotency short-circuit (no lock needed — UNIQUE constraint
  -- guarantees at most one row matches).
  SELECT m.applied_graph_version, m.payload
    INTO v_existing_mutation
    FROM orchestration_dag_mutations m
   WHERE m.dag_id = p_dag_id
     AND m.idempotency_key = p_idempotency_key
   LIMIT 1;

  IF FOUND THEN
    -- Replay: return prior applied_graph_version. Caller treats as no-op.
    -- We do NOT re-extract added_node_ids — the caller already received
    -- them on the first call, and a true replay should not re-emit them.
    RETURN QUERY SELECT v_existing_mutation.applied_graph_version, ARRAY[]::UUID[], TRUE;
    RETURN;
  END IF;

  -- Step 2: CAS guard. Lock the dag row to serialize concurrent mutators.
  -- The Redis advisory lock the caller holds narrows the contention
  -- window, but the row lock is the authoritative gate.
  SELECT graph_version
    INTO v_current_version
    FROM orchestration_dags
   WHERE id = p_dag_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dag_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'cas_conflict: expected % got %', p_expected_version, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- Step 3: insert new nodes. pending_parent_count starts at 0; the
  -- promotion RPC computes the real value from the freshly-inserted
  -- edges + parent statuses.
  INSERT INTO orchestration_dag_nodes (
    id, dag_id, node_key, node_type, step_type, runtime_target, route_class,
    payload, confidence_floor, pending_parent_count, status
  )
  SELECT
    (n->>'id')::UUID,
    p_dag_id,
    n->>'node_key',
    n->>'node_type',
    NULLIF(n->>'step_type', ''),
    NULLIF(n->>'runtime_target', ''),
    NULLIF(n->>'route_class', ''),
    n->'payload',
    NULLIF(n->>'confidence_floor', '')::NUMERIC,
    0,
    'pending'
  FROM jsonb_array_elements(COALESCE(p_new_nodes, '[]'::jsonb)) AS n;

  GET DIAGNOSTICS v_added_count = ROW_COUNT;

  -- Capture added IDs for the caller. Order matches insert order so
  -- the mutator can map back to its in-memory node_key list.
  SELECT array_agg((n->>'id')::UUID ORDER BY ord)
    INTO v_added_ids
    FROM jsonb_array_elements(COALESCE(p_new_nodes, '[]'::jsonb)) WITH ORDINALITY AS t(n, ord);

  -- Step 4: insert new edges. Both endpoints are trusted UUIDs.
  IF jsonb_array_length(COALESCE(p_new_edges, '[]'::jsonb)) > 0 THEN
    INSERT INTO orchestration_dag_edges (dag_id, parent_node_id, child_node_id, edge_kind)
    SELECT
      p_dag_id,
      (e->>'parent_node_id')::UUID,
      (e->>'child_node_id')::UUID,
      COALESCE(NULLIF(e->>'edge_kind', ''), 'data')
    FROM jsonb_array_elements(p_new_edges) AS e;
  END IF;

  -- Step 5: CAS update — bump version + total_nodes. This is the
  -- atomic write that publishes the mutation; from this row's
  -- perspective, the new graph is now visible to readers.
  v_new_version := v_current_version + 1;
  UPDATE orchestration_dags
     SET graph_version = v_new_version,
         total_nodes = total_nodes + v_added_count,
         updated_at = NOW()
   WHERE id = p_dag_id;

  -- Step 6: insert mutation row. The UNIQUE(dag_id, idempotency_key)
  -- constraint is the idempotency boundary — a concurrent caller that
  -- raced past the early short-circuit will collide here and the
  -- INSERT will raise unique_violation. The mutator translates that
  -- into IdempotencyReplayError.
  INSERT INTO orchestration_dag_mutations (
    dag_id, mutation_type, source, source_run_id, target_node_id,
    expected_graph_version, applied_graph_version, idempotency_key,
    payload, applied_by_worker
  ) VALUES (
    p_dag_id, p_mutation_type, p_source, p_source_run_id, p_target_node_id,
    p_expected_version, v_new_version, p_idempotency_key,
    jsonb_build_object('added_nodes', p_new_nodes, 'added_edges', p_new_edges),
    p_applied_by_worker
  );

  RETURN QUERY SELECT v_new_version, COALESCE(v_added_ids, ARRAY[]::UUID[]), FALSE;
END;
$$;

-- ============================================================================
-- dag_promote_added_subgraph — used by scheduler.onMutation()
--
-- For each added node, compute pending_parent_count as the number of
-- incoming edges whose parent is NOT already terminal (completed or
-- skipped). Then promote any node whose count hit 0 and is still
-- pending. Returns promoted rows so the scheduler can enqueue leaves.
--
-- Bounded: only touches the added subgraph (filtered by p_node_ids).
-- Never scans the full DAG.
-- ============================================================================
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
  route_class TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Phase 1: compute pending_parent_count from real edges + parent
  -- statuses. A parent that is already 'completed' or 'skipped' does
  -- NOT contribute — its work is done, so it cannot block the new
  -- child. This handles the common case where a mutation hangs new
  -- nodes off an already-finished parent.
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

  -- Phase 2: promote any added node whose counter is now 0 and is
  -- still pending. RETURNING gives the scheduler exactly the rows it
  -- needs to enqueue.
  RETURN QUERY
    UPDATE orchestration_dag_nodes n
       SET status = 'ready',
           ready_at = NOW()
     WHERE n.dag_id = p_dag_id
       AND n.id = ANY(p_node_ids)
       AND n.pending_parent_count = 0
       AND n.status = 'pending'
    RETURNING n.id, n.node_key, n.node_type, n.step_type, n.runtime_target, n.route_class;
END;
$$;

GRANT EXECUTE ON FUNCTION dag_apply_expand_mutation(
  UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, TEXT, JSONB, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) TO service_role;
