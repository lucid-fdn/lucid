import { getAgentOpsWorkflow } from './workflow-registry'
import { startAgentOpsRunInputSchema, type AgentOpsRun, type StartAgentOpsRunInput } from './workflow-types'
import type { AgentOpsDependencies } from './ports'
import {
  buildAgentOpsWorkflowTeamOpsProjection,
  evaluateTeamOpsRuntimeCompatibility,
  type TeamOpsRuntimeCandidate,
  type TeamOpsRuntimeCompatibility,
} from './team-ops'
import {
  buildAgentOpsTeamPolicyBlockedReason,
  serializeAgentOpsTeamPolicyEvaluation,
} from './team-policy'
import { resolveAgentOpsRunModePolicy } from './run-modes'
import { buildAgentOpsWorkflowWithWorkGraphRequirements } from './work-graph'

export const AGENT_OPS_NO_COMPATIBLE_RUNTIME_MESSAGE =
  'No compatible runtime is currently available for this Agent Ops workflow.'

export async function startAgentOpsRun(
  input: StartAgentOpsRunInput,
  dependencies: AgentOpsDependencies,
): Promise<AgentOpsRun> {
  const validated = startAgentOpsRunInputSchema.parse(input)
  const workflow = buildAgentOpsWorkflowWithWorkGraphRequirements(
    getAgentOpsWorkflow(validated.workflowId),
    validated.metadata,
  )
  const teamPolicyEvaluation = await dependencies.teamPolicyGate?.evaluateRunStart({
    orgId: validated.orgId,
    projectId: validated.projectId ?? null,
    assistantId: validated.assistantId ?? null,
    workflow,
    scope: validated.scope,
    input: validated.input,
  })
  const policyBlockedReason = teamPolicyEvaluation
    ? buildAgentOpsTeamPolicyBlockedReason(teamPolicyEvaluation)
    : null
  const skipRuntimeSelectionForMode = validated.runMode === 'blocked' || validated.runMode === 'handoff'
  const [runtimeCandidates, specialistTelemetry] = policyBlockedReason || skipRuntimeSelectionForMode
    ? [undefined, undefined] as const
    : await Promise.all([
        dependencies.runtimeSelector?.listCandidates({
          orgId: validated.orgId,
          projectId: validated.projectId ?? null,
          assistantId: validated.assistantId ?? null,
          workflow,
        }),
        dependencies.specialistTelemetry?.list({
          orgId: validated.orgId,
          projectId: validated.projectId ?? null,
          assistantId: validated.assistantId ?? null,
          workflow,
        }),
      ])
  const runtimeCompatibility = runtimeCandidates
    ? evaluateTeamOpsRuntimeCompatibility({ workflow, candidates: runtimeCandidates })
    : null
  if (!policyBlockedReason) {
    await dependencies.runtimeSelector?.onCompatibilityEvaluated?.({
      workflow,
      candidates: runtimeCandidates ?? [],
      compatibility: runtimeCompatibility ?? [],
    })
  }
  const compatibleRuntimes = runtimeCompatibility?.filter((runtime) => runtime.compatible) ?? null
  const runtimeBlockedReason = runtimeCompatibility && compatibleRuntimes?.length === 0
    ? buildNoCompatibleRuntimeReason(runtimeCandidates ?? [], runtimeCompatibility)
    : null
  const preRunBlockedReason = policyBlockedReason ?? runtimeBlockedReason
  const runModePolicy = resolveAgentOpsRunModePolicy({
    requestedMode: validated.runMode,
    workflow,
    runInput: validated,
    blockedReason: preRunBlockedReason,
  })
  const runModeBlockedReason = runModePolicy.effectiveMode === 'blocked' || runModePolicy.effectiveMode === 'handoff'
    ? runModePolicy.reason
    : null
  const blockedReason = preRunBlockedReason ?? runModeBlockedReason
  const teamOpsProjection = buildAgentOpsWorkflowTeamOpsProjection(workflow, {
    candidates: runtimeCandidates,
    teamPolicyEvaluation,
    specialistTelemetry,
  })
  const run = await dependencies.runStore.createRun({
    ...validated,
    metadata: {
      ...validated.metadata,
      team_ops: teamOpsProjection,
      ...(teamPolicyEvaluation
        ? {
            team_policy_gate: serializeAgentOpsTeamPolicyEvaluation(teamPolicyEvaluation),
          }
        : {}),
      run_mode_policy: runModePolicy,
      ...(blockedReason
        ? {
            blocked_reason: blockedReason,
            ...(runtimeBlockedReason
              ? {
                  runtime_selection: {
                    blocked: true,
                    candidate_count: runtimeCandidates?.length ?? 0,
                    missing_capabilities: uniqueStrings(runtimeCompatibility?.flatMap((runtime) => runtime.missingCapabilities) ?? []),
                  },
                }
              : {}),
          }
        : {}),
    },
    workflow,
    status: blockedReason ? 'blocked' : workflow.executionMode === 'dag' || !dependencies.runtime ? 'queued' : 'running',
    errorMessage: blockedReason,
  })
  await dependencies.runModeRecorder?.record({
    run,
    policy: runModePolicy,
    metadata: {
      source: 'start_agent_ops_run',
      workflow_id: workflow.id,
    },
  }).catch(() => null)

  if (blockedReason) {
    await dependencies.missionControl?.projectRunStarted({ run, workflow })
    return run
  }

  if (workflow.executionMode === 'dag') {
    if (!dependencies.orchestration) {
      return run
    }

    const { dagId } = await dependencies.orchestration.startDag({ run, workflow })
    const updated = await dependencies.runStore.updateRunStatus({
      runId: run.id,
      orgId: run.orgId,
      status: 'running',
      orchestrationDagId: dagId,
    })
    await dependencies.missionControl?.projectRunStarted({ run: updated, workflow })
    return updated
  }

  if (dependencies.runtime) {
    const result = await dependencies.runtime.startSingleRun({ run, workflow })
    const updated = await dependencies.runStore.updateRunStatus({
      runId: run.id,
      orgId: run.orgId,
      status: 'completed',
      rootAgentRunId: result.agentRunId ?? null,
      output: result.output ?? null,
      metadata: result.agentRunId ? { ...run.metadata, agentRunId: result.agentRunId } : run.metadata,
    })
    await dependencies.missionControl?.projectRunStarted({ run: updated, workflow })
    return updated
  }

  await dependencies.missionControl?.projectRunStarted({ run, workflow })
  return run
}

function buildNoCompatibleRuntimeReason(
  candidates: readonly TeamOpsRuntimeCandidate[],
  compatibility: readonly TeamOpsRuntimeCompatibility[],
): string {
  if (candidates.length === 0) {
    return `${AGENT_OPS_NO_COMPATIBLE_RUNTIME_MESSAGE} No runtime candidates were returned by the runtime selector.`
  }

  const missing = uniqueStrings(compatibility.flatMap((runtime) => runtime.missingCapabilities))
  if (missing.length > 0) {
    return `${AGENT_OPS_NO_COMPATIBLE_RUNTIME_MESSAGE} Missing capabilities: ${missing.join(', ')}.`
  }

  const unavailable = compatibility.filter((runtime) => runtime.candidate?.unavailable).length
  if (unavailable > 0) {
    return `${AGENT_OPS_NO_COMPATIBLE_RUNTIME_MESSAGE} ${unavailable} candidate runtime${unavailable === 1 ? ' is' : 's are'} unavailable.`
  }

  return AGENT_OPS_NO_COMPATIBLE_RUNTIME_MESSAGE
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}
