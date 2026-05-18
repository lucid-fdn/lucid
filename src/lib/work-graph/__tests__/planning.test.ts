import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createFallbackDecompositionProposal } from '../planning'
import { workGraphHintFromProposal } from '../builder-bridge'

describe('Work Graph planning', () => {
  it('creates a reviewable fallback proposal with stable proposal ids', () => {
    const proposal = createFallbackDecompositionProposal({
      org_id: '11111111-1111-4111-8111-111111111111',
      project_id: '22222222-2222-4222-8222-222222222222',
      prompt: 'Launch a cross-engine research workflow',
      decomposition_style: 'balanced',
      constraints: {},
      required_capabilities: [{ capability_id: 'work_graph.board.move' }],
    })

    expect(proposal.goals[0]?.proposal_id).toBe('goal-1-primary')
    expect(proposal.work_items).toHaveLength(3)
    expect(proposal.work_items.every((item) => item.proposal_id)).toBe(true)
    expect(proposal.relations).toHaveLength(2)
    expect(proposal.board?.kind).toBe('kanban')
    expect(proposal.work_items[0]?.required_capabilities[0]?.capability_id).toBe('work_graph.board.move')
  })

  it('keeps fallback proposals runtime and provider neutral', () => {
    const proposal = createFallbackDecompositionProposal({
      org_id: '11111111-1111-4111-8111-111111111111',
      prompt: 'Plan Hermes and OpenClaw project management',
      decomposition_style: 'conservative',
      constraints: {},
      required_capabilities: [],
    })
    const serialized = JSON.stringify(proposal)

    expect(serialized).not.toContain('HERMES_HOME')
    expect(serialized).not.toContain('OPENCLAW_RUNTIME_BINARY')
    expect(proposal.notes[0]).toContain('deterministic fallback')
  })

  it('projects reviewed proposals into builder blueprint hints', () => {
    const proposal = createFallbackDecompositionProposal({
      org_id: '11111111-1111-4111-8111-111111111111',
      prompt: 'Create a partner launch plan',
      decomposition_style: 'balanced',
      constraints: {},
      required_capabilities: [],
    })

    const hint = workGraphHintFromProposal(proposal)

    expect(hint.default_goals[0]?.title).toBe(proposal.goals[0]?.title)
    expect(hint.default_board?.name).toBe('Project Work')
  })
})
