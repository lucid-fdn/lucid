import { describe, expect, it, vi } from 'vitest'

import { buildAgentAvatarPrompt } from '../prompt'
import type { AgentAvatarSpec } from '../types'

vi.mock('server-only', () => ({}))

const baseSpec: AgentAvatarSpec = {
  orgId: 'org-1',
  userId: 'user-1',
  name: 'Atlas',
  role: 'Research Agent',
  description: 'Finds useful context across documents.',
  stylePreset: 'lucid-studio',
  angle: 'front-three-quarter',
  crop: 'head-and-shoulders',
  expression: 'focused',
  background: 'subtle-depth',
  lighting: 'soft-studio',
  genderPresentation: 'auto',
  pose: 'standard-portrait',
  lockIdentity: false,
  promptVersion: 'agent-avatar-v1',
}

describe('agent avatar prompt', () => {
  it('includes the stable visual constraints for an agent avatar', () => {
    const prompt = buildAgentAvatarPrompt(baseSpec)

    expect(prompt).toContain('Agent name: Atlas')
    expect(prompt).toContain('Camera angle: front three-quarter portrait')
    expect(prompt).toContain('Crop: head-and-shoulders portrait')
    expect(prompt).toContain('Gender presentation: infer naturally')
    expect(prompt).toContain('Pose: standard premium portrait pose')
    expect(prompt).toContain('Hard exclusions: no text, no letters, no logos')
    expect(prompt).toContain('safe circular-avatar margins')
  })

  it('adds identity locking instructions when a reference is present', () => {
    const prompt = buildAgentAvatarPrompt({
      ...baseSpec,
      lockIdentity: true,
      referenceImageUrl: 'https://example.com/avatar.webp',
    })

    expect(prompt).toContain('Identity lock')
    expect(prompt).toContain('keep the same face')
    expect(prompt).toContain('pose family')
  })

  it('supports anime style and explicit presentation controls', () => {
    const prompt = buildAgentAvatarPrompt({
      ...baseSpec,
      stylePreset: 'anime-editorial',
      genderPresentation: 'feminine',
      pose: 'confident-shoulder-turn',
    })

    expect(prompt).toContain('premium anime editorial portrait')
    expect(prompt).toContain('Gender presentation: feminine')
    expect(prompt).toContain('subtle confident shoulder turn')
  })
})
