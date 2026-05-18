import { describe, expect, it } from 'vitest'
import { buildMutationPolicyPrompt, getEngineMutationPolicy, type EngineMutationPolicy } from '../mutation-policy.js'

describe('mutation policy', () => {
  it('marks shared Hermes native mutations as denied', () => {
    const policy = getEngineMutationPolicy('hermes', 'shared')

    expect(policy.runtimeFlavor).toBe('shared')
    expect(policy.rules.memory_write.mode).toBe('deny')
    expect(policy.rules.skill_create.mode).toBe('deny')
    expect(policy.rules.skill_update.mode).toBe('deny')
    expect(policy.rules.skill_delete.mode).toBe('deny')
  })

  it('allows durable Hermes native mutation on dedicated runtime flavors', () => {
    const managed = getEngineMutationPolicy('hermes', 'c1_managed')
    const autonomous = getEngineMutationPolicy('hermes', 'c2a_autonomous')

    expect(managed.rules.memory_write.mode).toBe('allow')
    expect(autonomous.rules.skill_update.mode).toBe('allow')
  })

  it('returns a shared-runtime warning prompt only for shared Hermes', () => {
    const sharedPrompt = buildMutationPolicyPrompt(getEngineMutationPolicy('hermes', 'shared'))
    const dedicatedPrompt = buildMutationPolicyPrompt(getEngineMutationPolicy('hermes', 'c1_managed'))
    const openclawPrompt = buildMutationPolicyPrompt(getEngineMutationPolicy('openclaw', 'shared'))

    expect(sharedPrompt).toContain('shared multi-tenant compute')
    expect(sharedPrompt).toContain('denied')
    expect(sharedPrompt).toContain('candidate-only')
    expect(dedicatedPrompt).toBe('')
    expect(openclawPrompt).toBe('')
  })

  it('describes candidate-only mode when a shared policy uses it', () => {
    const candidatePolicy: EngineMutationPolicy = {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      rules: {
        memory_write: {
          kind: 'memory_write',
          mode: 'candidate_only',
          reason: 'Candidate writes only',
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

    const prompt = buildMutationPolicyPrompt(candidatePolicy)

    expect(prompt).toContain('candidate-only')
    expect(prompt).toContain('later review')
  })
})
