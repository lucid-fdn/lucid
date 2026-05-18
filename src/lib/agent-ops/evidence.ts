import {
  appendAgentOpsArtifactInputSchema,
  appendAgentOpsFindingInputSchema,
  type AgentOpsArtifact,
  type AgentOpsFinding,
  type AppendAgentOpsArtifactInput,
  type AppendAgentOpsFindingInput,
} from './workflow-types'
import type { AgentOpsDependencies } from './ports'

export async function appendAgentOpsArtifact(
  input: AppendAgentOpsArtifactInput,
  dependencies: Required<Pick<AgentOpsDependencies, 'evidence'>>,
): Promise<AgentOpsArtifact> {
  return dependencies.evidence.appendArtifact(appendAgentOpsArtifactInputSchema.parse(input))
}

export async function appendAgentOpsFinding(
  input: AppendAgentOpsFindingInput,
  dependencies: Required<Pick<AgentOpsDependencies, 'evidence'>>,
): Promise<AgentOpsFinding> {
  return dependencies.evidence.appendFinding(appendAgentOpsFindingInputSchema.parse(input))
}
