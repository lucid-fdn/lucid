import { describe, expect, it } from 'vitest'

import {
  CUSTOM_CREW_ROLE_VALUE,
  UNSET_CREW_ROLE_VALUE,
  getCrewRoleSelectValue,
  isPresetCrewRole,
} from './roles'

describe('crew role helpers', () => {
  it('recognizes built-in presets', () => {
    expect(isPresetCrewRole('Researcher')).toBe(true)
    expect(isPresetCrewRole('Builder')).toBe(true)
    expect(isPresetCrewRole('Custom thing')).toBe(false)
  })

  it('maps empty, preset, and custom roles to select values', () => {
    expect(getCrewRoleSelectValue('')).toBe(UNSET_CREW_ROLE_VALUE)
    expect(getCrewRoleSelectValue('Researcher')).toBe('Researcher')
    expect(getCrewRoleSelectValue('Partner Liaison')).toBe(CUSTOM_CREW_ROLE_VALUE)
  })
})
