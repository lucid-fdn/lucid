/**
 * Linear Agent Plan Publisher — Phase 3 of Linear Agents API Integration.
 *
 * Maps DAG nodes → Linear plan format and publishes/updates plan progress
 * on Linear agent sessions. Fire-and-forget: failures log warnings but
 * never throw.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 3
 */

import type { LinearAgentClient, PlanStep } from './agent-client.js'
import { redact } from '../../../utils/pii-redactor.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinearPlanStep {
  content: string
  status: 'pending' | 'inProgress' | 'completed' | 'canceled'
}

/**
 * Minimal node shape the plan publisher needs. Works with DAG node rows,
 * promoted nodes, or any object with these fields.
 */
export interface PlanNodeInput {
  id: string
  label?: string
  name?: string
  status: string
}

// ─── Status Mapping ─────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, LinearPlanStep['status']> = {
  // Pending / not started
  pending: 'pending',
  ready: 'pending',
  // In progress
  running: 'inProgress',
  claimed: 'inProgress',
  in_progress: 'inProgress',
  // Completed
  complete: 'completed',
  done: 'completed',
  completed: 'completed',
  // Canceled / failed
  failed: 'canceled',
  cancelled: 'canceled',
  skipped: 'canceled',
  error: 'canceled',
}

/**
 * Map DAG node statuses to Linear plan step format.
 */
export function dagNodesToLinearPlan(nodes: PlanNodeInput[]): LinearPlanStep[] {
  return nodes.map((node) => ({
    content: node.label || node.name || node.id,
    status: STATUS_MAP[node.status] ?? 'pending',
  }))
}

/**
 * Convert LinearPlanStep[] to the PlanStep[] shape the agent client expects.
 */
function toClientPlanSteps(steps: LinearPlanStep[]): PlanStep[] {
  const statusMap: Record<LinearPlanStep['status'], PlanStep['status']> = {
    pending: 'pending',
    inProgress: 'in_progress',
    completed: 'completed',
    canceled: 'failed',
  }

  return steps.map((s) => ({
    title: s.content,
    status: statusMap[s.status],
  }))
}

/**
 * Publish an initial DAG plan to a Linear agent session.
 * Fire-and-forget — logs on failure, never throws.
 */
export async function publishDagPlanToLinear(
  agentClient: LinearAgentClient,
  linearSessionId: string,
  nodes: PlanNodeInput[],
): Promise<void> {
  try {
    const steps = dagNodesToLinearPlan(nodes)
    const clientSteps = toClientPlanSteps(steps)
    await agentClient.publishPlan(linearSessionId, clientSteps)
  } catch (err) {
    console.warn(
      `[plan-publisher] Failed to publish DAG plan for session ${redact(linearSessionId)}:`,
      redact((err as Error).message),
    )
  }
}

/**
 * Update plan progress after a DAG node completes. Marks the completed
 * node and refreshes the full plan on the Linear session.
 * Fire-and-forget — logs on failure, never throws.
 */
export async function updateDagPlanProgress(
  agentClient: LinearAgentClient,
  linearSessionId: string,
  nodes: PlanNodeInput[],
  completedNodeId: string,
): Promise<void> {
  try {
    // Build the plan steps, overriding the completed node's status
    const steps = nodes.map((node) => {
      const effectiveStatus = node.id === completedNodeId ? 'completed' : node.status
      return {
        content: node.label || node.name || node.id,
        status: STATUS_MAP[effectiveStatus] ?? 'pending',
      } as LinearPlanStep
    })

    const clientSteps = toClientPlanSteps(steps)
    await agentClient.publishPlan(linearSessionId, clientSteps)
  } catch (err) {
    console.warn(
      `[plan-publisher] Failed to update DAG plan progress for session ${redact(linearSessionId)}:`,
      redact((err as Error).message),
    )
  }
}
