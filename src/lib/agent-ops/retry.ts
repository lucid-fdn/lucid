import { getAgentOpsWorkflow } from './workflow-registry'
import type { AgentOpsDependencies } from './ports'
import type { AgentOpsRun } from './workflow-types'

export async function retryAgentOpsRun(
  input: { orgId: string; runId: string; fromNodeKey?: string },
  dependencies: Pick<AgentOpsDependencies, 'runStore' | 'orchestration' | 'missionControl'>,
): Promise<AgentOpsRun> {
  const run = await dependencies.runStore.getRun(input.runId)
  if (!run || run.orgId !== input.orgId) {
    throw new Error('Agent Ops run not found')
  }
  if (run.status !== 'failed') {
    throw new Error(`Agent Ops run is not retryable from status ${run.status}`)
  }
  if (!run.orchestrationDagId || !dependencies.orchestration) {
    return dependencies.runStore.updateRunStatus({
      runId: run.id,
      orgId: run.orgId,
      status: 'queued',
    })
  }

  const { dagId } = await dependencies.orchestration.retryDag({
    orgId: input.orgId,
    dagId: run.orchestrationDagId,
    fromNodeKey: input.fromNodeKey,
  })
  const updated = await dependencies.runStore.updateRunStatus({
    runId: run.id,
    orgId: run.orgId,
    status: 'running',
    orchestrationDagId: dagId,
  })
  await dependencies.missionControl?.projectRunUpdated({
    run: updated,
    workflow: getAgentOpsWorkflow(updated.workflowId),
  })
  return updated
}
