/**
 * plan_dag — Phase 4N-a, Task 31.
 *
 * Agent-facing runtime tool that turns an operator-authored DAG template
 * into a live DAG instance. Flow:
 *
 *   1. Load template by slug (org-scoped OR global)    — template-loader.ts
 *   2. Instantiate nodes + edges via DagPlanner        — planner.ts
 *   3. Promote roots + enqueue leaves via scheduler    — scheduler.ts
 *
 * Returns a JSON envelope with `dag_id`, `total_nodes`, and
 * `root_node_ids` on success, or `{ error }` on failure. Never throws —
 * the agent loop expects string results.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTemplateBySlug, TemplateNotFoundError, TemplateValidationError } from '../../pulse/dag/template-loader.js'
import { DagPlanner, DagCycleError, DagSizeError } from '../../pulse/dag/planner.js'
import type { IncrementalScheduler } from '../../pulse/dag/scheduler.js'

export interface PlanDagParams {
  template_slug: string
  version?: number
  root_event_id?: string
  root_event_type?: 'inbound' | 'outbound' | 'scheduled' | 'webhook'
}

export interface PlanDagContext {
  supabase: SupabaseClient
  assistantId: string
  orgId: string
  /** Optional — when provided, scheduler.onDagCreated fires after instantiation. */
  scheduler?: IncrementalScheduler
}

export async function toolPlanDag(
  params: PlanDagParams,
  ctx: PlanDagContext,
): Promise<string> {
  if (!params.template_slug || typeof params.template_slug !== 'string') {
    return JSON.stringify({ error: 'template_slug is required' })
  }

  try {
    const template = await loadTemplateBySlug(
      ctx.supabase,
      ctx.orgId,
      params.template_slug,
      params.version,
    )

    const planner = new DagPlanner(ctx.supabase)
    const result = await planner.instantiateFromTemplate({
      spec: template.spec,
      agentId: ctx.assistantId,
      orgId: ctx.orgId,
      source: 'template',
      templateId: template.id,
      rootEventId: params.root_event_id ?? null,
      rootEventType: params.root_event_type ?? null,
    })

    // Fire the scheduler if one was provided — promotes roots and
    // enqueues leaves. Errors here are non-fatal for the tool call;
    // the DAG rows still exist and can be driven forward later.
    if (ctx.scheduler) {
      try {
        await ctx.scheduler.onDagCreated(result.dagId)
      } catch (schedErr) {
        return JSON.stringify({
          dag_id: result.dagId,
          total_nodes: result.totalNodes,
          ready_nodes: result.readyNodes,
          root_node_ids: result.rootNodeIds,
          warning: `scheduler onDagCreated failed: ${schedErr instanceof Error ? schedErr.message : String(schedErr)}`,
        })
      }
    }

    return JSON.stringify({
      dag_id: result.dagId,
      total_nodes: result.totalNodes,
      ready_nodes: result.readyNodes,
      root_node_ids: result.rootNodeIds,
    })
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      return JSON.stringify({ error: `template not found: ${params.template_slug}` })
    }
    if (err instanceof TemplateValidationError) {
      return JSON.stringify({ error: `template invalid: ${err.message}` })
    }
    if (err instanceof DagCycleError) {
      return JSON.stringify({ error: `cycle in template: ${err.cycleNodes.join(' -> ')}` })
    }
    if (err instanceof DagSizeError) {
      return JSON.stringify({
        error: 'dag_too_large',
        message: `template ${err.kind} count ${err.count} exceeds platform limit ${err.limit}`,
        kind: err.kind,
        count: err.count,
        limit: err.limit,
      })
    }
    return JSON.stringify({
      error: `plan_dag failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
