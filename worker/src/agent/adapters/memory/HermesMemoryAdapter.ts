import type { EngineMemoryAdapter, EngineMemoryInput, EngineMemoryMountContext, EngineMountedMemory } from './types.js'
import { packetItemsForPromptMemory } from '../../../knowledge/prompt-packet.js'

export class HermesMemoryAdapter implements EngineMemoryAdapter {
  readonly engine = 'hermes' as const

  mountMemory(input: EngineMemoryInput, _ctx: EngineMemoryMountContext): EngineMountedMemory {
    if (input.knowledgePromptPacket) {
      return {
        systemSections: [],
        promptMemoryInjection: packetItemsForPromptMemory(input.knowledgePromptPacket),
        promptBoardMemories: [],
      }
    }

    return {
      systemSections: [],
      promptMemoryInjection: input.memories,
      promptBoardMemories: input.boardMemories ?? [],
    }
  }
}
