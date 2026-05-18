import type { WorkerAgentEngine } from '../../engines/types.js'
import { HermesSkillAdapter } from './HermesSkillAdapter.js'
import { OpenClawSkillAdapter } from './OpenClawSkillAdapter.js'
import type { EngineSkillAdapter } from './types.js'

const adapters: Record<WorkerAgentEngine, EngineSkillAdapter> = {
  openclaw: new OpenClawSkillAdapter(),
  hermes: new HermesSkillAdapter(),
}

export function getEngineSkillAdapter(engine: WorkerAgentEngine): EngineSkillAdapter {
  const adapter = adapters[engine]
  if (!adapter) {
    throw new Error(`Unsupported engine "${engine}"`)
  }
  return adapter
}

export type {
  CatalogSkillRecord,
  EngineMountedSkills,
  EngineSkillAdapter,
  EngineSkillMountContext,
  SkillExclusionSummary,
  SkillExclusionDecision,
  SkillSelectionSummary,
  SkillSelectionDecision,
} from './types.js'
