'use client'

import * as React from 'react'

import { deriveBuilderStage } from '@/lib/ai/project-generation/chat'
import type {
  BuilderDecisionCard,
  BuilderStage,
  GeneratedBlueprintResult,
} from '@/lib/ai/project-generation/schemas'

export function useBuilderStage(input: {
  result: GeneratedBlueprintResult | null
  decisionCards?: BuilderDecisionCard[]
  activeTab?: 'summary' | 'config'
  initialStage?: BuilderStage
  isCreating?: boolean
}) {
  return React.useMemo(
    () => {
      if (input.isCreating) return 'deploy'

      const derived = deriveBuilderStage({
        result: input.result,
        decisionCards: input.decisionCards,
      }) ?? input.initialStage ?? 'create-agent'

      if (!input.result) return derived

      return derived
    },
    [input.activeTab, input.decisionCards, input.initialStage, input.isCreating, input.result],
  )
}
