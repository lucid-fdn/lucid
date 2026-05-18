-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.756Z.

-- Remote migration version: 20260430110000

-- Remote migration name: agent_ops_rls_advisor_hardening



-- Agent Ops RLS/advisor hardening.
--
-- Keeps the product tables org-scoped while removing Supabase advisor noise:
-- - auth.uid() is evaluated once through initplans.
-- - service-role policies are scoped to TO service_role instead of every role.
-- - trigger helpers pin search_path.

-- ---------------------------------------------------------------------------
-- Foundation tables
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS agent_ops_runs_org_select ON agent_ops_runs;

CREATE POLICY agent_ops_runs_org_select ON agent_ops_runs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_runs_org_insert ON agent_ops_runs;

CREATE POLICY agent_ops_runs_org_insert ON agent_ops_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_runs_service_all ON agent_ops_runs;

CREATE POLICY agent_ops_runs_service_all ON agent_ops_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_run_links_org_select ON agent_ops_run_links;

CREATE POLICY agent_ops_run_links_org_select ON agent_ops_run_links
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_run_links_service_all ON agent_ops_run_links;

CREATE POLICY agent_ops_run_links_service_all ON agent_ops_run_links
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_artifacts_org_select ON agent_ops_artifacts;

CREATE POLICY agent_ops_artifacts_org_select ON agent_ops_artifacts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_artifacts_service_all ON agent_ops_artifacts;

CREATE POLICY agent_ops_artifacts_service_all ON agent_ops_artifacts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_findings_org_select ON agent_ops_findings;

CREATE POLICY agent_ops_findings_org_select ON agent_ops_findings
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_findings_service_all ON agent_ops_findings;

CREATE POLICY agent_ops_findings_service_all ON agent_ops_findings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Browser QA tables
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS agent_ops_browser_qa_sessions_org_select ON agent_ops_browser_qa_sessions;

CREATE POLICY agent_ops_browser_qa_sessions_org_select ON agent_ops_browser_qa_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.organization_id = agent_ops_browser_qa_sessions.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_qa_sessions_service_all ON agent_ops_browser_qa_sessions;

CREATE POLICY agent_ops_browser_qa_sessions_service_all ON agent_ops_browser_qa_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_browser_qa_usage_events_org_select ON agent_ops_browser_qa_usage_events;

CREATE POLICY agent_ops_browser_qa_usage_events_org_select ON agent_ops_browser_qa_usage_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.organization_id = agent_ops_browser_qa_usage_events.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_qa_usage_events_service_all ON agent_ops_browser_qa_usage_events;

CREATE POLICY agent_ops_browser_qa_usage_events_service_all ON agent_ops_browser_qa_usage_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Review, learning, eval, timeline, and policy tables
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS agent_ops_review_specialists_select ON agent_ops_review_specialists;

CREATE POLICY agent_ops_review_specialists_select ON agent_ops_review_specialists
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_review_specialists_service_all ON agent_ops_review_specialists;

CREATE POLICY agent_ops_review_specialists_service_all ON agent_ops_review_specialists
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS project_learnings_org_select ON project_learnings;

CREATE POLICY project_learnings_org_select ON project_learnings
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS project_learnings_org_insert ON project_learnings;

CREATE POLICY project_learnings_org_insert ON project_learnings
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS project_learnings_service_all ON project_learnings;

CREATE POLICY project_learnings_service_all ON project_learnings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS project_timeline_events_org_select ON project_timeline_events;

CREATE POLICY project_timeline_events_org_select ON project_timeline_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS project_timeline_events_service_all ON project_timeline_events;

CREATE POLICY project_timeline_events_service_all ON project_timeline_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS workspace_decision_preferences_org_select ON workspace_decision_preferences;

CREATE POLICY workspace_decision_preferences_org_select ON workspace_decision_preferences
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_decision_preferences_org_insert ON workspace_decision_preferences;

CREATE POLICY workspace_decision_preferences_org_insert ON workspace_decision_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_decision_preferences_service_all ON workspace_decision_preferences;

CREATE POLICY workspace_decision_preferences_service_all ON workspace_decision_preferences
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_eval_scenarios_select ON agent_ops_eval_scenarios;

CREATE POLICY agent_ops_eval_scenarios_select ON agent_ops_eval_scenarios
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_scenarios_service_all ON agent_ops_eval_scenarios;

CREATE POLICY agent_ops_eval_scenarios_service_all ON agent_ops_eval_scenarios
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_eval_runs_org_select ON agent_ops_eval_runs;

CREATE POLICY agent_ops_eval_runs_org_select ON agent_ops_eval_runs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_runs_org_insert ON agent_ops_eval_runs;

CREATE POLICY agent_ops_eval_runs_org_insert ON agent_ops_eval_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_runs_service_all ON agent_ops_eval_runs;

CREATE POLICY agent_ops_eval_runs_service_all ON agent_ops_eval_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_eval_results_org_select ON agent_ops_eval_results;

CREATE POLICY agent_ops_eval_results_org_select ON agent_ops_eval_results
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_results_service_all ON agent_ops_eval_results;

CREATE POLICY agent_ops_eval_results_service_all ON agent_ops_eval_results
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_security_attempts_org_select ON agent_ops_security_attempts;

CREATE POLICY agent_ops_security_attempts_org_select ON agent_ops_security_attempts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_security_attempts_service_all ON agent_ops_security_attempts;

CREATE POLICY agent_ops_security_attempts_service_all ON agent_ops_security_attempts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_context_snapshots_org_select ON agent_ops_context_snapshots;

CREATE POLICY agent_ops_context_snapshots_org_select ON agent_ops_context_snapshots
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_context_snapshots_service_all ON agent_ops_context_snapshots;

CREATE POLICY agent_ops_context_snapshots_service_all ON agent_ops_context_snapshots
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_project_policies_org_select ON agent_ops_project_policies;

CREATE POLICY agent_ops_project_policies_org_select ON agent_ops_project_policies
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_project_policies_service_all ON agent_ops_project_policies;

CREATE POLICY agent_ops_project_policies_service_all ON agent_ops_project_policies
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS agent_ops_run_usage_events_org_select ON agent_ops_run_usage_events;

CREATE POLICY agent_ops_run_usage_events_org_select ON agent_ops_run_usage_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_run_usage_events_service_all ON agent_ops_run_usage_events;

CREATE POLICY agent_ops_run_usage_events_service_all ON agent_ops_run_usage_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Trigger function search paths
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.touch_agent_ops_runs_updated_at() SET search_path = public, pg_temp;

ALTER FUNCTION public.increment_agent_ops_artifact_count() SET search_path = public, pg_temp;

ALTER FUNCTION public.touch_agent_ops_findings_updated_at() SET search_path = public, pg_temp;

ALTER FUNCTION public.increment_agent_ops_finding_count() SET search_path = public, pg_temp;

ALTER FUNCTION public.touch_agent_ops_browser_qa_sessions_updated_at() SET search_path = public, pg_temp;

ALTER FUNCTION public.touch_agent_ops_product_layer_updated_at() SET search_path = public, pg_temp;

ALTER FUNCTION public.compute_agent_ops_run_latency() SET search_path = public, pg_temp;

ALTER FUNCTION public.rollup_agent_ops_run_usage_event() SET search_path = public, pg_temp;
