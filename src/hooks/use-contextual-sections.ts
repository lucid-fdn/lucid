'use client'

/**
 * useContextualSections — Config section highlighting by agent state.
 *
 * Returns a map of section IDs to highlight colors based on real operational data.
 * Only highlights sections that actually need attention — no decorative badges.
 */

import { useMemo } from 'react'
import type { IntrospectionEmotion } from '@contracts/introspection'
import type { AgentHealthScore } from '@/hooks/use-health-score'

export type SectionHighlight = 'emerald' | 'amber' | 'red' | null

interface ContextualSectionsInput {
  emotion: IntrospectionEmotion
  isActive: boolean
  healthScore?: number | null
  channelCount?: number
  pendingTaskCount?: number
}

export function useContextualSections(
  emotionOrInput: IntrospectionEmotion | ContextualSectionsInput,
  isActiveParam?: boolean,
): Record<string, SectionHighlight> {
  // Support both old (emotion, isActive) and new (input object) signatures
  const input: ContextualSectionsInput = typeof emotionOrInput === 'string'
    ? { emotion: emotionOrInput, isActive: isActiveParam ?? false }
    : emotionOrInput

  const { emotion, isActive, healthScore, channelCount, pendingTaskCount } = input

  return useMemo(() => {
    const highlights: Record<string, SectionHighlight> = {}

    // Health — only highlight when degraded
    if (healthScore != null && healthScore <= 40) {
      highlights.health = 'red'
    } else if (healthScore != null && healthScore <= 75) {
      highlights.health = 'amber'
    }

    // Channels — amber when none connected (agent can't receive messages)
    if (channelCount === 0) {
      highlights.channels = 'amber'
    }

    // Tasks — emerald when tasks are pending (system is working)
    if ((pendingTaskCount ?? 0) > 0) {
      highlights.tasks = 'emerald'
    }

    // Guardrails — red when agent is strained (errors detected)
    if (emotion === 'strained') {
      highlights.guardrails = 'red'
    }

    return highlights
  }, [emotion, isActive, healthScore, channelCount, pendingTaskCount])
}
