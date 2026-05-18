import { describe, expect, it } from 'vitest'
import { getEngineMutationPolicy, type EngineMutationPolicy } from '../../contracts/mutation-policy.js'
import { classifyHermesNativeMutationTool, guardHermesNativeMutationToolCall } from '../hermes-native-mutation-guard.js'

describe('hermes native mutation guard', () => {
  it('classifies Hermes-native mutation tools', () => {
    expect(classifyHermesNativeMutationTool('memory')).toBe('memory_write')
    expect(classifyHermesNativeMutationTool('skill_manage')).toBe('skill_update')
    expect(classifyHermesNativeMutationTool('wallet_send')).toBeNull()
  })

  it('blocks Hermes-native mutation tools on shared policy', () => {
    const policy = getEngineMutationPolicy('hermes', 'shared')

    const result = guardHermesNativeMutationToolCall(policy, 'memory')

    expect(result.blocked).toBe(true)
    expect(result.responseText).toContain('not allowed')
  })

  it('allows Hermes-native mutation tools on dedicated-capable policy', () => {
    const policy = getEngineMutationPolicy('hermes', 'c1_managed')

    const result = guardHermesNativeMutationToolCall(policy, 'skill_manage')

    expect(result.blocked).toBe(false)
  })

  it('returns a candidate proposal when the policy is candidate-only', () => {
    const policy: EngineMutationPolicy = {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      rules: {
        memory_write: {
          kind: 'memory_write',
          mode: 'candidate_only',
          reason: 'Shared candidate path',
        },
        skill_create: {
          kind: 'skill_create',
          mode: 'deny',
          reason: 'Denied',
        },
        skill_update: {
          kind: 'skill_update',
          mode: 'deny',
          reason: 'Denied',
        },
        skill_delete: {
          kind: 'skill_delete',
          mode: 'deny',
          reason: 'Denied',
        },
      },
    }

    const result = guardHermesNativeMutationToolCall(policy, 'memory', { content: 'remember this' })

    expect(result.blocked).toBe(true)
    expect(result.candidate).toEqual({
      engine: 'hermes',
      runtimeFlavor: 'shared',
      kind: 'memory_write',
      toolName: 'memory',
      toolArgs: { content: 'remember this' },
      reason: 'Shared candidate path',
    })
  })
})
