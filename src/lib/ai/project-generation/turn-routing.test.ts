import { describe, expect, it } from 'vitest'

import {
  classifyBuilderTurn,
  shouldUseDeterministicBuilderTurnClassification,
} from './turn-routing'

describe('classifyBuilderTurn', () => {
  it('routes runtime availability questions to answer-only fallback', () => {
    const result = classifyBuilderTurn({
      prompt: 'what engines are available?',
    })

    expect(result.type).toBe('product_question')
    expect(result.topic).toBe('engine')
  })

  it('routes generic runtime questions to answer-only fallback', () => {
    const result = classifyBuilderTurn({
      prompt: 'what are runtimes?',
    })

    expect(result.type).toBe('product_question')
    expect(result.topic).toBe('runtime')
  })

  it('routes information-seeking prompts to answer-only fallback', () => {
    const result = classifyBuilderTurn({
      prompt: 'tell me about runtimes',
    })

    expect(result.type).toBe('product_question')
    expect(result.topic).toBe('runtime')
  })

  it('classifies builder status questions separately from config changes', () => {
    const result = classifyBuilderTurn({
      prompt: 'what are you doing?',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
        },
      },
    })

    expect(result.type).toBe('builder_status_question')
  })

  it('keeps real edits on the config change path', () => {
    const result = classifyBuilderTurn({
      prompt: 'add slack and make the tone more formal',
    })

    expect(result.type).toBe('config_change')
  })

  it('keeps request-shaped questions on the config change path', () => {
    const result = classifyBuilderTurn({
      prompt: 'can you add Slack and switch the engine to Hermes?',
    })

    expect(result.type).toBe('config_change')
  })

  it('trusts explicit deterministic edits without AI classifier', () => {
    const result = classifyBuilderTurn({
      prompt: 'create assistant',
    })

    expect(result.type).toBe('config_change')
    expect(shouldUseDeterministicBuilderTurnClassification(result)).toBe(true)
  })

  it('trusts typoed explicit create requests without AI classifier', () => {
    for (const prompt of ['creare assistant', 'create assisntat', 'createe my personal agent']) {
      const result = classifyBuilderTurn({ prompt })

      expect(result.type, prompt).toBe('config_change')
      expect(shouldUseDeterministicBuilderTurnClassification(result), prompt).toBe(true)
    }
  })

  it('does not trust ambiguous default config changes without AI classifier', () => {
    const result = classifyBuilderTurn({
      prompt: 'warmer',
    })

    expect(result.type).toBe('config_change')
    expect(shouldUseDeterministicBuilderTurnClassification(result)).toBe(false)
  })

  it('trusts implicit assistant creation phrases without the AI classifier', () => {
    for (const prompt of ['daily assistant', 'daily asisitant', 'personal asistant']) {
      const result = classifyBuilderTurn({ prompt })

      expect(result.type, prompt).toBe('config_change')
      expect(result.reason, prompt).toBe('matched implicit builder creation request')
      expect(shouldUseDeterministicBuilderTurnClassification(result), prompt).toBe(true)
    }
  })

  it('keeps assistant questions on the answer-only path', () => {
    const result = classifyBuilderTurn({
      prompt: 'what is a daily assistant?',
    })

    expect(result.type).toBe('product_question')
  })

  it('routes agent validation requirement questions to answer-only guidance', () => {
    const result = classifyBuilderTurn({
      prompt: 'what needs to be indicated to validate an agent?',
    })

    expect(result.type).toBe('product_question')
    expect(result.topic).toBe('validation')
  })

  it('routes current draft validation questions to readiness guidance', () => {
    const result = classifyBuilderTurn({
      prompt: 'what is required before creating this agent?',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'Help with daily work.',
        },
      },
    })

    expect(result.type).toBe('builder_status_question')
  })
})
