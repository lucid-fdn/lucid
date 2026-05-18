import { describe, expect, it } from 'vitest'

import type { GenerationDraft } from './schemas'

import { applyGeneratedTeamDraftToCreation } from './team-create-edit'

describe('team-create-edit', () => {
  it('maps a generated team draft onto the selected creation members', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: { name: 'Support Team' },
      starterName: 'Support Team',
      team: {
        kind: 'team',
        objective: 'Resolve customer issues',
        members: [
          { role: 'triage', is_coordinator: true, system_prompt: 'Lead intake' },
          { role: 'resolver', system_prompt: 'Resolve issues' },
        ],
        edges: [],
      },
    }

    const result = applyGeneratedTeamDraftToCreation({
      draft,
      members: [
        {
          assistant: {
            id: 'a-1',
            name: 'Alice',
            description: null,
            system_prompt: 'Original',
            lucid_model: 'openai/gpt-4.1-mini',
          },
          role: '',
          isCoordinator: false,
        },
        {
          assistant: {
            id: 'a-2',
            name: 'Bob',
            description: null,
            system_prompt: 'Original',
            lucid_model: 'openai/gpt-4.1-mini',
          },
          role: '',
          isCoordinator: true,
        },
      ],
    })

    expect(result.reason).toBeUndefined()
    expect(result.name).toBe('Support Team')
    expect(result.objective).toBe('Resolve customer issues')
    expect(result.members?.map((member) => ({ role: member.role, isCoordinator: member.isCoordinator }))).toEqual([
      { role: 'triage', isCoordinator: true },
      { role: 'resolver', isCoordinator: false },
    ])
  })

  it('rejects generated drafts that change member count', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: { name: 'Ops Team' },
      team: {
        kind: 'team',
        objective: 'Run ops',
        members: [
          { role: 'lead', is_coordinator: true, system_prompt: 'Lead ops' },
          { role: 'operator', system_prompt: 'Operate' },
          { role: 'reviewer', system_prompt: 'Review' },
        ],
        edges: [],
      },
    }

    const result = applyGeneratedTeamDraftToCreation({
      draft,
      members: [
        {
          assistant: {
            id: 'a-1',
            name: 'Alice',
            description: null,
            system_prompt: 'Original',
            lucid_model: 'openai/gpt-4.1-mini',
          },
          role: '',
          isCoordinator: true,
        },
        {
          assistant: {
            id: 'a-2',
            name: 'Bob',
            description: null,
            system_prompt: 'Original',
            lucid_model: 'openai/gpt-4.1-mini',
          },
          role: '',
          isCoordinator: false,
        },
      ],
    })

    expect(result.members).toBeUndefined()
    expect(result.reason).toContain('changes the number of team members')
  })
})
