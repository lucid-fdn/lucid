import { describe, expect, it } from 'vitest'

import { getMissingDraftRequiredInputs } from './builder-requirements'
import type { GenerationDraft } from './schemas'

describe('builder requirements', () => {
  it('requires a project name and agent prompt for blank agents', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-agent',
      project: { name: '' },
      agent: {
        kind: 'agent',
        system_prompt: '',
      },
    }

    expect(getMissingDraftRequiredInputs(draft)).toEqual([
      expect.objectContaining({ key: 'project.name' }),
      expect.objectContaining({ key: 'agent.system_prompt' }),
    ])
  })

  it('requires objective and at least two complete roles for blank teams', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: { name: 'Ops Team' },
      team: {
        kind: 'team',
        objective: '',
        members: [
          { role: 'Coordinator', system_prompt: 'Coordinate.' },
          { role: '', system_prompt: '' },
        ],
        edges: [],
      },
    }

    expect(getMissingDraftRequiredInputs(draft)).toEqual([
      expect.objectContaining({ key: 'team.objective' }),
      expect.objectContaining({ key: 'team.member.role' }),
    ])
  })

  it('accepts complete blank team drafts', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: { name: 'Ops Team' },
      team: {
        kind: 'team',
        objective: 'Run operations.',
        members: [
          { role: 'Coordinator', system_prompt: 'Coordinate.' },
          { role: 'Analyst', system_prompt: 'Analyze.' },
        ],
        edges: [{ from: 'Coordinator', to: 'Analyst' }],
      },
    }

    expect(getMissingDraftRequiredInputs(draft)).toEqual([])
  })
})
