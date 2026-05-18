import type { AgentRunResult, AssistantConfig } from '../types.js'
import type { OpenClawAgentParams } from '../OpenClawAgent.js'

export type WorkerAgentEngine = NonNullable<AssistantConfig['engine']>
export type EngineSupportLevel = 'stable' | 'experimental' | 'planned' | 'unsupported'

export interface EngineRunnerCapabilities {
  sharedExecution: EngineSupportLevel
  toolRuntime: EngineSupportLevel
  approvals: EngineSupportLevel
  usageAccounting: EngineSupportLevel
  mutationPolicy: EngineSupportLevel
}

export interface EngineRunner {
  engine: WorkerAgentEngine
  capabilities: EngineRunnerCapabilities
  run(params: OpenClawAgentParams): Promise<AgentRunResult>
}
