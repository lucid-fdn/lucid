import 'server-only'

import type { BrainIntakeClassifyRequest, BrainIntakeClassifyResponse } from './schema'
import { planBrainIntakeWithAI } from './ai-planner'
import { classifyBrainIntake } from './classify-brain-intake'
import { compareBrainIntakeItems } from './compare-brain-intake'
import { buildBrainIntakePreview } from './preview-brain-intake'
import { rankBrainIntakeItems } from './rank-brain-intake'
import { validateBrainIntakeItems } from './validate-brain-intake'

export async function planBrainIntake(input: {
  request: BrainIntakeClassifyRequest
  userId: string
}): Promise<BrainIntakeClassifyResponse> {
  const deterministic = classifyBrainIntake(input.request)
  const aiItems = await planBrainIntakeWithAI({
    request: input.request,
    deterministicItems: deterministic.items,
    userId: input.userId,
  })

  if (!aiItems) return deterministic

  const ranked = validateBrainIntakeItems(rankBrainIntakeItems(compareBrainIntakeItems(aiItems)))
  return {
    items: ranked,
    ...buildBrainIntakePreview(ranked),
  }
}
