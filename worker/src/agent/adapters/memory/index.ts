import type { WorkerAgentEngine } from '../../engines/types.js'
import { HermesMemoryAdapter } from './HermesMemoryAdapter.js'
import { OpenClawMemoryAdapter } from './OpenClawMemoryAdapter.js'
import type { EngineMemoryAdapter } from './types.js'

const adapters: Record<WorkerAgentEngine, EngineMemoryAdapter> = {
  openclaw: new OpenClawMemoryAdapter(),
  hermes: new HermesMemoryAdapter(),
}

export function getEngineMemoryAdapter(engine: WorkerAgentEngine): EngineMemoryAdapter {
  const adapter = adapters[engine]
  if (!adapter) {
    throw new Error(`Unsupported engine "${engine}"`)
  }
  return adapter
}

export type { EngineMemoryAdapter, EngineMemoryInput, EngineMemoryMountContext, EngineMountedMemory } from './types.js'
