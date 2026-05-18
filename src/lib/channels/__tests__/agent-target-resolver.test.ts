import { describe, expect, it } from 'vitest'

import { resolveAgentTarget } from '@/lib/channels/agent-target-resolver'

const bindings = [
  {
    id: 'b1',
    assistant_id: 'a1',
    assistant_name: 'Sales',
    aliases: ['closer'],
  },
  {
    id: 'b2',
    assistant_id: 'a2',
    assistant_name: 'Marketing',
    aliases: ['copy'],
  },
]

describe('resolveAgentTarget', () => {
  it('resolves an explicit alias before defaults', () => {
    const result = resolveAgentTarget({
      bindings,
      explicitTarget: 'closer',
      conversationDefault: bindings[1],
    })

    expect(result).toEqual({
      kind: 'resolved',
      binding: bindings[0],
      source: 'explicit_target',
    })
  })

  it('returns ambiguous when the explicit target matches multiple bindings', () => {
    const result = resolveAgentTarget({
      bindings: [
        { id: 'b1', assistant_id: 'a1', assistant_name: 'Sales Alpha' },
        { id: 'b2', assistant_id: 'a2', assistant_name: 'Sales Beta' },
      ],
      explicitTarget: 'sales',
    })

    expect(result.kind).toBe('ambiguous')
  })

  it('falls back to the conversation default before the surface default', () => {
    const result = resolveAgentTarget({
      bindings,
      conversationDefault: bindings[1],
      surfaceDefault: bindings[0],
    })

    expect(result).toEqual({
      kind: 'resolved',
      binding: bindings[1],
      source: 'conversation_default',
    })
  })

  it('uses the surface default when there is no conversation default', () => {
    const result = resolveAgentTarget({
      bindings: [],
      surfaceDefault: bindings[0],
    })

    expect(result).toEqual({
      kind: 'resolved',
      binding: bindings[0],
      source: 'surface_default',
    })
  })

  it('returns unresolved when there are bindings but no default', () => {
    const result = resolveAgentTarget({
      bindings,
    })

    expect(result).toEqual({
      kind: 'unresolved',
      reason: 'no_conversation_default',
      bindings,
    })
  })
})
