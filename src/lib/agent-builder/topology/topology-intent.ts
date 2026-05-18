import type { LanguageModel } from 'ai'

import { generateStructuredObject } from '@/lib/ai/generation'

import {
  aiBuilderTopologyIntentSchema,
  type AiBuilderTopologyIntent,
} from './topology-schema'

export async function extractBuilderTopologyIntent(input: {
  model: string | LanguageModel
  prompt: string
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
  }
}): Promise<AiBuilderTopologyIntent> {
  const result = await generateStructuredObject({
    model: input.model,
    schema: aiBuilderTopologyIntentSchema,
    system: [
      'You classify whether a Lucid builder request should become one agent, a coordinated team, or a clarification.',
      'Return structured data only.',
      'Default to single-agent unless distinct roles, handoffs, parallel stages, or review loops materially improve the setup.',
      'Multiple apps or integrations alone do not require a team.',
      'Use clarify only when the topology choice materially changes the setup and the prompt does not give enough signal.',
    ].join(' '),
    messages: [
      {
        role: 'user',
        content: [
          `Prompt: ${input.prompt}`,
          '',
          'Decide topology. Include suggested roles only if recommending team.',
        ].join('\n'),
      },
    ],
    telemetry: {
      userId: input.telemetry?.userId,
      orgId: input.telemetry?.orgId,
      modelId: input.telemetry?.modelId,
      feature: 'builder-topology-intent',
    },
  })

  return result.object
}
