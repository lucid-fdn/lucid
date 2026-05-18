import { describe, expect, it } from 'vitest'

import { getVisibleBuilderDecisionCards } from './builder-step-visibility'
import type { BuilderDecisionCard } from '@/lib/ai/project-generation/schemas'

describe('builder step visibility', () => {
  it('shows only one required template input at a time', () => {
    const cards: BuilderDecisionCard[] = [
      {
        kind: 'template_param',
        key: 'BRAND_NAME',
        label: 'Brand Name',
        reason: 'Required',
        placeholder: 'Required',
      },
      {
        kind: 'template_param',
        key: 'TOPIC',
        label: 'Topic',
        reason: 'Required',
        placeholder: 'Required',
      },
      {
        kind: 'configuration_panel',
        panel: 'channels',
        title: 'Choose where this agent should work',
        action_label: 'Set channels',
      },
    ]

    expect(getVisibleBuilderDecisionCards(cards)).toEqual([cards[0]])
  })

  it('does not show a fake step when no decision cards exist', () => {
    expect(getVisibleBuilderDecisionCards([])).toEqual([])
  })
})
