export const SECTION_GROUPS = {
  configure: {
    label: 'Configure',
    description: 'Set up your agent',
    sections: ['settings', 'channels', 'wallet', 'skills'] as const,
  },
  monitor: {
    label: 'Monitor',
    description: 'Observe and control',
    sections: ['health', 'tasks', 'guardrails', 'runtime'] as const,
  },
  advanced: {
    label: 'Advanced',
    description: 'Memory, identity, proofs',
    sections: ['memories', 'operating-context', 'verification'] as const,
  },
} as const

export type SectionGroupKey = keyof typeof SECTION_GROUPS
export type SectionId = (typeof SECTION_GROUPS)[SectionGroupKey]['sections'][number]

export function getSectionGroup(sectionId: string): SectionGroupKey | null {
  for (const [key, group] of Object.entries(SECTION_GROUPS)) {
    if ((group.sections as readonly string[]).includes(sectionId)) {
      return key as SectionGroupKey
    }
  }
  return null
}
