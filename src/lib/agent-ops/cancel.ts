import { getAgentOpsWorkflow } from './workflow-registry'
import type { AgentOpsDependencies } from './ports'
import type { AgentOpsRun } from './workflow-types'

export async function cancelAgentOpsRun(
  input: { orgId: string; runId: string; reason?: string },
  dependencies: Pick<AgentOpsDependencies, 'runStore' | 'orchestration' | 'missionControl'>,
): Promise<AgentOpsRun> {
  const run = await dependencies.runStore.getRun(input.runId)
  if (!run || run.orgId !== input.orgId) {
    throw new Error('Agent Ops run not found')
  }

  if (run.orchestrationDagId && dependencies.orchestration) {
    await dependencies.orchestration.cancelDag({
      orgId: input.orgId,
      dagId: run.orchestrationDagId,
      reason: input.reason,
    })
  }

  const updated = await dependencies.runStore.updateRunStatus({
    runId: run.id,
    orgId: run.orgId,
    status: 'cancelled',
    metadata: input.reason ? { cancelReason: input.reason } : undefined,
  })
  await dependencies.missionControl?.projectRunUpdated({
    run: updated,
    workflow: getAgentOpsWorkflow(updated.workflowId),
  })
  return updated
}
