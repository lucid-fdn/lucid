import type { TeamMemberSpec, TeamTemplateSpec } from '@contracts/template'

export function composeTeamMemberSystemPrompt(
  member: Pick<TeamMemberSpec, 'role' | 'is_coordinator' | 'description' | 'responsibilities'>,
  team: Pick<TeamTemplateSpec, 'objective'>,
): string {
  const role = member.role.trim() || 'Team member'
  const objective = team.objective?.trim()
  const mission = member.description?.trim()
  const responsibilities = dedupeStrings(member.responsibilities ?? [])

  return [
    `You are ${role}${member.is_coordinator ? ', the coordinator for this Lucid team' : ', a specialist in this Lucid team'}.`,
    objective ? `Team objective:\n${objective}` : null,
    mission ? `Mission:\n${mission}` : null,
    responsibilities.length
      ? `Responsibilities:\n${responsibilities.map((item) => `- ${item}`).join('\n')}`
      : null,
    member.is_coordinator
      ? 'Coordinate work, route tasks to the right role, resolve blockers, and own the final answer quality.'
      : 'Execute your assigned work directly, return concise structured output, and surface blockers early.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function resolveTeamMemberRuntimeSystemPrompt(
  member: TeamMemberSpec,
  team: Pick<TeamTemplateSpec, 'objective'>,
): string {
  const existing = member.system_prompt.trim()

  // Existing templates predate system_prompt_mode and often contain rich authored prompts.
  // Preserve them unless the builder has explicitly opted the member into auto-composition.
  if (member.system_prompt_mode !== 'auto' && existing) return existing

  return composeTeamMemberSystemPrompt(member, team)
}

export function normalizeTeamSystemPrompts<T extends TeamTemplateSpec>(team: T): T {
  return {
    ...team,
    members: team.members.map((member) => ({
      ...member,
      system_prompt: resolveTeamMemberRuntimeSystemPrompt(member, team),
    })),
  }
}

export function withAutoTeamMemberPrompt(
  member: TeamMemberSpec,
  team: Pick<TeamTemplateSpec, 'objective'>,
): TeamMemberSpec {
  return {
    ...member,
    system_prompt_mode: 'auto',
    system_prompt: composeTeamMemberSystemPrompt(
      {
        role: member.role,
        is_coordinator: member.is_coordinator,
        description: member.description,
        responsibilities: member.responsibilities,
      },
      team,
    ),
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
