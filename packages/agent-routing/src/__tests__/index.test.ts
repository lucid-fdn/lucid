import { describe, expect, it } from 'vitest'
import {
  matchNamedAgentBinding,
  resolveAgentTarget,
  resolveConversationBinding,
  type CanonicalNamedAgentBinding,
} from '../index.js'

type Binding = CanonicalNamedAgentBinding & {
  isPrimary?: boolean
}

const toCanonical = (binding: Binding) => binding

describe('@lucid/agent-routing', () => {
  it('resolves exact alias matches before partials', () => {
    const bindings: Binding[] = [
      { id: '1', assistantId: 'a1', assistantName: 'Sales Agent', aliases: ['sales'] },
      { id: '2', assistantId: 'a2', assistantName: 'Marketing Agent', aliases: ['market'] },
    ]

    expect(matchNamedAgentBinding(bindings, 'sales', toCanonical)).toEqual({
      kind: 'resolved',
      binding: bindings[0],
    })
  })

  it('reports ambiguity when the best-ranked matches tie', () => {
    const bindings: Binding[] = [
      { id: '1', assistantId: 'a1', assistantName: 'Sales Alpha', aliases: ['sales'] },
      { id: '2', assistantId: 'a2', assistantName: 'Sales Beta', aliases: ['sales'] },
    ]

    expect(matchNamedAgentBinding(bindings, 'sales', toCanonical)).toEqual({
      kind: 'ambiguous',
      bindings,
    })
  })

  it('prefers explicit targets before defaults in agent resolution', () => {
    const bindings: Binding[] = [
      { id: '1', assistantId: 'a1', assistantName: 'Sales Agent', aliases: ['sales'] },
      { id: '2', assistantId: 'a2', assistantName: 'Support Agent', aliases: ['support'] },
    ]

    expect(resolveAgentTarget({
      bindings,
      explicitTarget: 'support',
      conversationDefault: bindings[0],
      toCanonical,
    })).toEqual({
      kind: 'resolved',
      binding: bindings[1],
      source: 'explicit_target',
    })
  })

  it('falls back to conversation binding resolution when no explicit target is present', () => {
    const bindings: Binding[] = [
      { id: '1', assistantId: 'a1', assistantName: 'Sales Agent' },
    ]

    expect(resolveConversationBinding(null, bindings)).toEqual({
      kind: 'has_bindings_no_primary',
      bindings,
    })
  })
})
