import type { CreateSystemNoticeInput } from '@contracts/system-notice'
import type { AgentOpsRun } from './workflow-types'

export function buildAgentOpsRunSystemNotice(run: AgentOpsRun): CreateSystemNoticeInput | null {
  const policy = readRecord(run.metadata.run_mode_policy)
  const effectiveMode = readString(policy.effectiveMode) ?? run.runMode
  const reason = readString(policy.reason) ?? run.errorMessage ?? null

  if (run.status === 'blocked') {
    const runtimeBlocked = Boolean(readRecord(run.metadata.runtime_selection).blocked)
    return {
      orgId: run.orgId,
      projectId: run.projectId,
      runId: run.id,
      agentId: run.assistantId,
      type: runtimeBlocked ? 'runtime_incompatible' : effectiveMode === 'handoff' ? 'handoff_required' : 'run_blocked',
      tone: runtimeBlocked ? 'danger' : 'warning',
      title: runtimeBlocked ? 'Runtime compatibility blocked this run' : 'Agent Ops run is blocked',
      body: reason ?? 'This Agent Ops run is blocked before dispatch.',
      dedupeKey: `agent-ops-run:${run.id}:blocked`,
      metadata: [
        { label: 'Workflow', value: run.workflowId, kind: 'text' },
        { label: 'Mode', value: effectiveMode, kind: 'text' },
      ],
      actions: [],
      details: {
        workflow_id: run.workflowId,
        run_mode: run.runMode,
        effective_mode: effectiveMode,
        run_status: run.status,
      },
    }
  }

  if (effectiveMode === 'plan_only') {
    return {
      orgId: run.orgId,
      projectId: run.projectId,
      runId: run.id,
      agentId: run.assistantId,
      type: 'planning_mode',
      tone: 'info',
      title: 'Agent Ops is running in planning mode',
      body: reason ?? 'This run can analyze and recommend, but cannot mutate systems.',
      dedupeKey: `agent-ops-run:${run.id}:planning-mode`,
      metadata: [
        { label: 'Workflow', value: run.workflowId, kind: 'text' },
        { label: 'Mode', value: effectiveMode, kind: 'text' },
      ],
      actions: [],
      details: {
        workflow_id: run.workflowId,
        run_mode: run.runMode,
        effective_mode: effectiveMode,
      },
    }
  }

  return null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
