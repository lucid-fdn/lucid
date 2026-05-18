import type { AgentOpsDependencies } from './ports'
import type { AgentOpsRun } from './workflow-types'

export async function getAgentOpsRun(
  runId: string,
  dependencies: Pick<AgentOpsDependencies, 'runStore'>,
): Promise<AgentOpsRun | null> {
  return dependencies.runStore.getRun(runId)
}
