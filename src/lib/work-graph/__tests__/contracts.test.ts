import { describe, expect, it } from 'vitest'

import {
  WorkArtifactLinkCreateSchema,
  WorkGraphDecompositionProposalSchema,
  WorkGraphHintSchema,
  WorkGraphPmFederationConfigSchema,
  WorkItemCheckoutCreateSchema,
} from '@contracts/work-graph'

describe('Work Graph contracts', () => {
  it('accepts template work graph hints', () => {
    const hint = WorkGraphHintSchema.parse({
      default_goals: [{ title: 'Launch research ops', priority: 'high' }],
      default_board: {
        name: 'Launch board',
        columns: [{ key: 'todo', label: 'To do' }],
      },
    })

    expect(hint.default_goals[0].title).toBe('Launch research ops')
    expect(hint.decomposition_style).toBe('balanced')
  })

  it('requires artifact links to point at a work item or goal and an external object', () => {
    expect(() => WorkArtifactLinkCreateSchema.parse({
      artifact_type: 'agent_ops_run',
      label: 'Run',
      ref_table: 'agent_ops_runs',
      ref_id: 'run-1',
    })).toThrow()

    const link = WorkArtifactLinkCreateSchema.parse({
      work_item_id: '11111111-1111-4111-8111-111111111111',
      artifact_type: 'agent_ops_run',
      label: 'Run',
      ref_table: 'agent_ops_runs',
      ref_id: '22222222-2222-4222-8222-222222222222',
    })
    expect(link.ref_table).toBe('agent_ops_runs')
  })

  it('models user and agent checkouts through one engine-agnostic contract', () => {
    const checkout = WorkItemCheckoutCreateSchema.parse({
      work_item_id: '11111111-1111-4111-8111-111111111111',
      owner_kind: 'agent',
      owner_agent_id: '22222222-2222-4222-8222-222222222222',
      purpose: 'Implement board projection',
      required_capabilities: [{ capability_id: 'work_graph.board.move' }],
    })

    expect(checkout.required_capabilities?.[0]?.capability_id).toBe('work_graph.board.move')
  })

  it('keeps decomposition proposals provider- and runtime-neutral', () => {
    const proposal = WorkGraphDecompositionProposalSchema.parse({
      goals: [{ title: 'Ship PM layer' }],
      work_items: [{ title: 'Create board API', goal_titles: ['Ship PM layer'] }],
      relations: [{
        source_title: 'Create board API',
        target_title: 'Create UI',
        relation_type: 'blocks',
      }],
    })

    expect(proposal.goals).toHaveLength(1)
    expect(proposal.board).toBeUndefined()
  })

  it('models PM federation as field authority over the shared Work Graph', () => {
    const config = WorkGraphPmFederationConfigSchema.parse({
      mode: 'bidirectional_review',
      field_authority: {
        title: 'lucid',
        description: 'last_writer_wins',
        status: 'provider',
        priority: 'last_writer_wins',
        assignee: 'review_required',
        labels: 'last_writer_wins',
        due_at: 'last_writer_wins',
        board_column: 'review_required',
      },
    })

    expect(config.field_authority.title).toBe('lucid')
    expect(config.conflict_state).toBe('clean')
  })
})
