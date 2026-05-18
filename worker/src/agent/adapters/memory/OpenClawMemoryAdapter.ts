import type { EngineMemoryAdapter, EngineMemoryInput, EngineMemoryMountContext, EngineMountedMemory } from './types.js'
import {
  packetItemsForPromptMemory,
  renderKnowledgePromptPacket,
} from '../../../knowledge/prompt-packet.js'

export class OpenClawMemoryAdapter implements EngineMemoryAdapter {
  readonly engine = 'openclaw' as const

  mountMemory(input: EngineMemoryInput, _ctx: EngineMemoryMountContext): EngineMountedMemory {
    const systemSections: string[] = []

    if (input.knowledgePromptPacket) {
      const rendered = renderKnowledgePromptPacket(input.knowledgePromptPacket)
      if (rendered) {
        systemSections.push(rendered)
      }
      return {
        systemSections,
        promptMemoryInjection: packetItemsForPromptMemory(input.knowledgePromptPacket),
        promptBoardMemories: [],
      }
    }

    if (input.memories.length > 0) {
      systemSections.push(`\n\n## Memories\n${input.memories.join('\n')}`)
    }

    if (input.boardMemories?.length) {
      systemSections.push(
        `\n\n## Organization Knowledge\n<org_knowledge>\n${input.boardMemories.join('\n')}\n</org_knowledge>`,
      )
    }

    return {
      systemSections,
      promptMemoryInjection: input.memories,
      promptBoardMemories: input.boardMemories ?? [],
    }
  }
}
