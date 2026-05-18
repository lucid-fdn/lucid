import { describe, expect, it } from 'vitest'

import {
  matchNamedAgentBinding,
  resolveConversationBinding,
} from '../agent-routing'

describe('resolveConversationBinding', () => {
  it('returns the primary binding when present', () => {
    expect(
      resolveConversationBinding(
        { id: 'c1', assistant_id: 'a1' },
        [{ id: 'c2', assistant_id: 'a2' }],
      ),
    ).toEqual({
      kind: 'primary',
      binding: { id: 'c1', assistant_id: 'a1' },
    })
  })

  it('returns no_bindings when none exist', () => {
    expect(resolveConversationBinding(null, [])).toEqual({ kind: 'no_bindings' })
  })

  it('returns has_bindings_no_primary when bindings exist but no primary', () => {
    expect(
      resolveConversationBinding(null, [{ id: 'c2', assistant_id: 'a2' }]),
    ).toEqual({
      kind: 'has_bindings_no_primary',
      bindings: [{ id: 'c2', assistant_id: 'a2' }],
    })
  })
})

describe('matchNamedAgentBinding', () => {
  const bindings = [
    { id: '1', assistant_id: 'a1', assistant_name: 'Sales Closer', aliases: ['sales'] },
    { id: '2', assistant_id: 'a2', assistant_name: 'Marketing Writer', aliases: ['marketing'] },
    { id: '3', assistant_id: 'a3', assistant_name: 'Sales Ops', aliases: ['revops'] },
  ]

  it('prefers exact alias matches over partial name matches', () => {
    expect(matchNamedAgentBinding(bindings, 'sales')).toEqual({
      kind: 'resolved',
      binding: bindings[0],
    })
  })

  it('returns ambiguous when multiple bindings share the best partial match', () => {
    expect(matchNamedAgentBinding(bindings, 'sale')).toEqual({
      kind: 'ambiguous',
      bindings: [bindings[0], bindings[2]],
    })
  })

  it('returns not_found when no binding matches', () => {
    expect(matchNamedAgentBinding(bindings, 'support')).toEqual({ kind: 'not_found' })
  })
})
