import { describe, expect, it } from 'vitest'

import {
  ROUTINE_TARGET_ADAPTERS,
  inferRoutineKinds,
} from '../registry'

describe('Routine target registry', () => {
  it('keeps all domain targets explicit and execution-assistant aware', () => {
    expect(Object.keys(ROUTINE_TARGET_ADAPTERS).sort()).toEqual([
      'agent_ops',
      'assistant',
      'browser_procedure',
      'engine_home',
      'knowledge',
      'plugin_job',
      'pm_sync',
      'team',
      'work_graph',
    ])

    expect(ROUTINE_TARGET_ADAPTERS.work_graph.needsExecutionAssistant).toBe(true)
    expect(ROUTINE_TARGET_ADAPTERS.team.needsExecutionAssistant).toBe(false)
    expect(ROUTINE_TARGET_ADAPTERS.engine_home.requiredCapabilities.map((capability) => capability.id)).toContain('engine_home.snapshot')
  })

  it('validates target-specific identifiers instead of accepting opaque assistant runs', () => {
    expect(ROUTINE_TARGET_ADAPTERS.browser_procedure.validate({
      assistantId: '00000000-0000-0000-0000-000000000001',
    })).toContain('target_id or trigger_config.procedure_id is required for Browser Procedure routines')

    expect(ROUTINE_TARGET_ADAPTERS.browser_procedure.validate({
      assistantId: '00000000-0000-0000-0000-000000000001',
      triggerConfig: { procedure_id: 'proc_1' },
    })).toEqual([])

    expect(ROUTINE_TARGET_ADAPTERS.knowledge.validate({
      assistantId: '00000000-0000-0000-0000-000000000001',
      knowledgeScope: { project_id: '00000000-0000-0000-0000-000000000002' },
    })).toEqual([])
  })

  it('infers team routines from team_id while preserving explicit target kinds', () => {
    expect(inferRoutineKinds({
      team_id: '00000000-0000-0000-0000-000000000001',
    })).toEqual({ targetType: 'team', taskKind: 'team_run' })

    expect(inferRoutineKinds({
      target_type: 'pm_sync',
    })).toEqual({ targetType: 'pm_sync', taskKind: 'pm_sync' })
  })
})
