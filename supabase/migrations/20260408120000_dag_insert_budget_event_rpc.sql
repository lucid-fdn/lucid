-- Phase 4N-d hardening: atomic budget-event insert RPC.
--
-- Background: BudgetLedger.insertEvent() (worker/src/pulse/dag/budget-ledger.ts)
-- did client-side SELECT-last-cumulative + INSERT as two separate round-trips.
-- The original in-file comment acknowledged this as "acceptable because the
-- scheduler is the single writer", but onNodeComplete / commit / release can
-- fire concurrently for sibling leaves that finish at the same time, so two
-- concurrent commits can both read the same `previous` and then both write
-- `previous + delta`, under-counting total cumulative consumption. That would
-- drift the audit trail away from the live Redis counter and make
-- dag_status.budget.tokensUsed unreliable.
--
-- Fix: move the select-then-insert into a single SECURITY DEFINER RPC
-- serialized by a per-dag advisory xact lock. The lock is scoped to
--   `hashtextextended('dag_budget:' || p_dag_id::text, 0)`
-- so concurrent insertions on OTHER dags never contend, and the lock is
-- released automatically at transaction end (xact variant).
--
-- The RPC mirrors the client-side cumulative rule: token-stream events
-- ('tokens', 'reservation', 'release') share one running total; all other
-- event types ('usd', 'tool_call', 'wall_seconds') have independent streams.

CREATE OR REPLACE FUNCTION dag_insert_budget_event(
  p_dag_id     UUID,
  p_node_id    UUID,
  p_event_type TEXT,
  p_delta      NUMERIC
)
RETURNS TABLE (
  id          UUID,
  cumulative  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous   NUMERIC := 0;
  v_cumulative NUMERIC;
  v_id         UUID;
  v_types      TEXT[];
BEGIN
  IF p_event_type NOT IN ('tokens','usd','tool_call','wall_seconds','reservation','release') THEN
    RAISE EXCEPTION 'dag_insert_budget_event: invalid event_type %', p_event_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialize concurrent inserts for the same DAG. Released at xact end.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('dag_budget:' || p_dag_id::text, 0)
  );

  -- Token-bearing event types share a cumulative stream; others are isolated.
  IF p_event_type IN ('tokens','reservation','release') THEN
    v_types := ARRAY['tokens','reservation','release'];
  ELSE
    v_types := ARRAY[p_event_type];
  END IF;

  SELECT e.cumulative
    INTO v_previous
    FROM orchestration_dag_budget_events e
   WHERE e.dag_id = p_dag_id
     AND e.event_type = ANY(v_types)
   ORDER BY e.recorded_at DESC, e.id DESC
   LIMIT 1;

  IF v_previous IS NULL THEN
    v_previous := 0;
  END IF;

  v_cumulative := v_previous + p_delta;

  INSERT INTO orchestration_dag_budget_events (
    dag_id, node_id, event_type, delta, cumulative
  )
  VALUES (
    p_dag_id, p_node_id, p_event_type, p_delta, v_cumulative
  )
  RETURNING orchestration_dag_budget_events.id
       INTO v_id;

  RETURN QUERY SELECT v_id, v_cumulative;
END;
$$;

REVOKE EXECUTE ON FUNCTION dag_insert_budget_event(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_insert_budget_event(UUID, UUID, TEXT, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_insert_budget_event(UUID, UUID, TEXT, NUMERIC) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_insert_budget_event(UUID, UUID, TEXT, NUMERIC) TO service_role;
