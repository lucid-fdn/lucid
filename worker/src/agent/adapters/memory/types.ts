import type { WorkerAgentEngine } from '../../engines/types.js'
import type { KnowledgePromptPacket } from '../../../knowledge/types.js'

export interface EngineMemoryMountContext {
  engine: WorkerAgentEngine
  runtimeFlavor?: string | null
  channelOwnership?: string | null
}

export interface EngineMemoryInput {
  memories: string[]
  boardMemories?: string[]
  knowledgePromptPacket?: KnowledgePromptPacket | null
}

export interface EngineMountedMemory {
  systemSections: string[]
  promptMemoryInjection: string[]
  promptBoardMemories: string[]
}

export interface EngineMemoryAdapter {
  engine: WorkerAgentEngine
  mountMemory(input: EngineMemoryInput, ctx: EngineMemoryMountContext): EngineMountedMemory
}
