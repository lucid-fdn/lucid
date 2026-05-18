import { describe, expect, it } from 'vitest'

import { buildRoutineExecutionContext } from '../target-context.js'

describe('Routine target execution context', () => {
  it('builds Work Graph guidance and receipt refs', () => {
    const context = buildRoutineExecutionContext({
      id: 'task-1',
      assistant_id: 'assistant-1',
      org_id: 'org-1',
      name: 'Update goal',
      task_prompt: 'Move blocked cards to review.',
      target_type: 'work_graph',
      task_kind: 'work_graph_action',
      target_id: '00000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000002',
      work_item_id: '00000000-0000-0000-0000-000000000003',
      trigger_config: { lane: 'review' },
    })

    expect(context.systemSection).toContain('Routine target: Work Graph')
    expect(context.systemSection).toContain('Attach or describe evidence refs')
    expect(context.userMessage).toContain('[ROUTINE TARGET: work_graph]')
    expect(context.dispatchSummary.target_type).toBe('work_graph')
    expect(context.receiptRefs.workGraphRefs).toEqual({
      target_id: '00000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000002',
      work_item_id: '00000000-0000-0000-0000-000000000003',
    })
  })

  it('keeps Engine Home routines constrained to EHV semantics', () => {
    const context = buildRoutineExecutionContext({
      id: 'task-2',
      assistant_id: 'assistant-1',
      org_id: 'org-1',
      name: 'Snapshot home',
      task_prompt: 'Snapshot the runtime home.',
      target_type: 'engine_home',
      task_kind: 'engine_home_job',
      trigger_config: {
        operation: 'snapshot',
        runtime_id: '00000000-0000-0000-0000-000000000004',
      },
    })

    expect(context.systemSection).toContain('Engine Home Virtualization')
    expect(context.systemSection).toContain('Do not write directly')
    expect(context.receiptRefs.engineHomeRefs).toEqual({
      target_id: null,
      runtime_id: '00000000-0000-0000-0000-000000000004',
      operation: 'snapshot',
      snapshot_id: null,
    })
  })
})
