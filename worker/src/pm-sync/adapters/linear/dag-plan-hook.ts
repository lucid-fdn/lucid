/**
 * Linear Agent DAG Plan Hook — Phase 3 of Linear Agents API Integration.
 *
 * Called by the DAG scheduler after a node completes. Looks up a Linear
 * agent session for the DAG, and if found, publishes updated plan progress.
 * Fire-and-forget — never blocks the scheduler.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 3
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { LinearAgentClient } from './agent-client.js'
import { updateDagPlanProgress } from './plan-publisher.js'

/**
 * Notify Linear of DAG node completion. Looks up a Linear agent session
 * by the DAG ID (sessions store `run_id` as `dag:{dagId}:*`), loads all
 * DAG nodes, the org's PM config, creates a LinearAgentClient, and
 * updates the plan progress.
 *
 * No-op when:
 *   - No linear_agent_sessions row for this DAG
 *   - No org_pm_config for the session's org
 *   - Any step fails (fire-and-forget)
 */
export async function onDagNodeCompleteLinearHook(
  supabase: SupabaseClient,
  dagId: string,
  completedNodeId: string,
): Promise<void> {
  try {
    // 1. Look up linear_agent_sessions by run_id pattern (dag:{dagId}:*)
    const runIdPrefix = `dag:${dagId}:`
    const { data: session, error: sessionErr } = await supabase
      .from('linear_agent_sessions')
      .select('id, org_id, linear_session_id')
      .like('run_id', `${runIdPrefix}%`)
      .in('status', ['pending', 'active', 'awaiting_input'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionErr || !session) return // No active session for this DAG

    // 2. Load all DAG nodes for the plan
    const { data: nodeRows, error: nodesErr } = await supabase
      .from('orchestration_dag_nodes')
      .select('id, node_key, node_type, status')
      .eq('dag_id', dagId)
      .order('created_at', { ascending: true })

    if (nodesErr || !nodeRows || nodeRows.length === 0) return

    // Map to PlanNodeInput shape
    const allNodes = (nodeRows as Array<{ id: string; node_key: string; node_type: string; status: string }>).map((n) => ({
      id: n.id,
      name: n.node_key,
      status: n.status,
    }))

    // 3. Load org_pm_config for the Linear agent connection ID
    const { data: pmConfig, error: pmErr } = await supabase
      .from('org_pm_config')
      .select('config')
      .eq('org_id', session.org_id)
      .eq('provider', 'linear')
      .maybeSingle()

    if (pmErr || !pmConfig?.config) return // No PM config

    const config = pmConfig.config as Record<string, unknown>
    const connectionId = (config.agentConnectionId as string) ?? session.org_id

    // 4. Create LinearAgentClient and update plan
    const agentClient = new LinearAgentClient(connectionId)
    await updateDagPlanProgress(
      agentClient,
      session.linear_session_id,
      allNodes,
      completedNodeId,
    )
  } catch (err) {
    // Fire-and-forget: never block the scheduler
    console.warn(
      `[dag-plan-hook] Failed to update Linear plan for dag ${dagId}, node ${completedNodeId}:`,
      (err as Error).message,
    )
  }
}
