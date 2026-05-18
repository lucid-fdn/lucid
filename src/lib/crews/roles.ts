export const CUSTOM_CREW_ROLE_VALUE = '__custom__'
export const UNSET_CREW_ROLE_VALUE = '__unset__'

export interface CrewRolePreset {
  value: string
  label: string
  description: string
}

export const CREW_ROLE_PRESETS: CrewRolePreset[] = [
  {
    value: 'Researcher',
    label: 'Researcher',
    description: 'Finds context, sources, and supporting material.',
  },
  {
    value: 'Strategist',
    label: 'Strategist',
    description: 'Defines approach, priorities, and high-level plan.',
  },
  {
    value: 'Analyst',
    label: 'Analyst',
    description: 'Synthesizes information, compares options, and spots gaps.',
  },
  {
    value: 'Writer',
    label: 'Writer',
    description: 'Turns outputs into clear deliverables and polished copy.',
  },
  {
    value: 'Builder',
    label: 'Builder',
    description: 'Executes implementation work and ships changes.',
  },
  {
    value: 'Reviewer',
    label: 'Reviewer',
    description: 'Checks quality, validates details, and catches regressions.',
  },
  {
    value: 'Operator',
    label: 'Operator',
    description: 'Runs workflows, follows procedures, and handles execution.',
  },
  {
    value: 'Specialist',
    label: 'Specialist',
    description: 'Owns a narrow domain task with focused expertise.',
  },
]

export function isPresetCrewRole(role: string): boolean {
  return CREW_ROLE_PRESETS.some((preset) => preset.value === role)
}

export function getCrewRoleSelectValue(role: string): string {
  if (!role.trim()) return UNSET_CREW_ROLE_VALUE
  return isPresetCrewRole(role) ? role : CUSTOM_CREW_ROLE_VALUE
}
