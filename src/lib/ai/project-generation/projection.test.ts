import { describe, expect, it } from 'vitest'

import { projectDraftFromAssistant, projectDraftFromTeam } from './projection'

describe('project generation projection helpers', () => {
  it('projects an existing assistant into a blank-agent draft', () => {
    const draft = projectDraftFromAssistant({
      name: 'Support Bot',
      description: 'Handles support.',
      system_prompt: 'Answer support questions.',
      runtime_flavor: 'c1_managed',
      engine: 'openclaw',
    })

    expect(draft).toEqual({
      version: '1.0',
      mode: 'blank-agent',
      project: {
        name: 'Support Bot',
        description: 'Handles support.',
      },
      starterName: 'Support Bot',
      runtime: {
        mode: 'dedicated',
        engine: 'openclaw',
      },
      agent: {
        kind: 'agent',
        system_prompt: 'Answer support questions.',
      },
    })
  })

  it('projects a team config into a blank-team draft', () => {
    const draft = projectDraftFromTeam({
      crew: {
        name: 'Growth Team',
        description: 'Runs growth work.',
        objective: 'Acquire customers',
      },
      members: [
        {
          role: 'Coordinator',
          isCoordinator: true,
          assistant: {
            name: 'Lead',
            description: 'Coordinates work.',
            system_prompt: 'Coordinate the team.',
            lucid_model: 'openai/gpt-4.1',
          },
        },
        {
          role: 'Researcher',
          assistant: {
            name: 'Researcher',
            description: 'Finds insights.',
            system_prompt: 'Research opportunities.',
            lucid_model: 'openai/gpt-4.1-mini',
          },
        },
      ],
      edges: [{ from: 'Coordinator', to: 'Researcher', label: 'delegate' }],
    })

    expect(draft.mode).toBe('blank-team')
    expect(draft.team?.objective).toBe('Acquire customers')
    expect(draft.team?.members).toHaveLength(2)
    expect(draft.team?.members[0]?.is_coordinator).toBe(true)
    expect(draft.team?.edges).toEqual([{ from: 'Coordinator', to: 'Researcher', label: 'delegate' }])
  })
})
