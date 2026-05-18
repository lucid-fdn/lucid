import { describe, expect, it } from 'vitest'

import { toEnvKey } from './features'

describe('toEnvKey', () => {
  it('converts standard camelCase flags to FEATURE_* env keys', () => {
    expect(toEnvKey('videoStudio')).toBe('FEATURE_VIDEO_STUDIO')
    expect(toEnvKey('projectSwitcher')).toBe('FEATURE_PROJECT_SWITCHER')
  })

  it('preserves acronym groups in env keys', () => {
    expect(toEnvKey('crewAIGeneration')).toBe('FEATURE_CREW_AI_GENERATION')
    expect(toEnvKey('aiImageGeneration')).toBe('FEATURE_AI_IMAGE_GENERATION')
  })
})
