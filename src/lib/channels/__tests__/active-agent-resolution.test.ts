import { describe, expect, it } from 'vitest'

import { resolveActiveAgentBinding } from '../active-agent-resolution'

describe('resolveActiveAgentBinding', () => {
  it('returns the primary binding when present', () => {
    expect(
      resolveActiveAgentBinding(
        { id: 'c1', assistant_id: 'a1', assistant_name: 'Sales', is_primary: true },
        [{ id: 'c2', assistant_id: 'a2', assistant_name: 'Marketing', is_primary: false }],
      ),
    ).toEqual({
      kind: 'primary',
      channel: { id: 'c1', assistant_id: 'a1' },
    })
  })

  it('returns no_bindings when none exist', () => {
    expect(resolveActiveAgentBinding(null, [])).toEqual({ kind: 'no_bindings' })
  })

  it('returns has_bindings_no_primary when bindings exist but none is primary', () => {
    expect(
      resolveActiveAgentBinding(null, [
        { id: 'c2', assistant_id: 'a2', assistant_name: 'Marketing', is_primary: false },
      ]),
    ).toEqual({
      kind: 'has_bindings_no_primary',
      bindings: [{ id: 'c2', assistant_id: 'a2', assistant_name: 'Marketing', is_primary: false }],
    })
  })
})
