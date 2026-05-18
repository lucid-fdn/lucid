import type { AgentTemplateSpec, TeamMemberSpec, TeamTemplateSpec } from '@contracts/template'

import { generationDraftSchema, type GenerationDraft } from './schemas'
import { normalizeTeamSystemPrompts, withAutoTeamMemberPrompt } from './team-member-prompt'

export type BuilderDraftStructure = 'agent' | 'team'

export function getDraftStructure(draft: Pick<GenerationDraft, 'mode' | 'template'>): BuilderDraftStructure {
  if (draft.mode === 'blank-team') return 'team'
  if (draft.mode === 'template' && draft.template?.kind === 'team') return 'team'
  return 'agent'
}

export function getDraftStructureLabel(draft: Pick<GenerationDraft, 'mode' | 'template'>): string {
  return getDraftStructure(draft) === 'team' ? 'Team' : 'Single agent'
}

export function getDraftCapabilities(draft: GenerationDraft): {
  skills: string[]
  plugins: string[]
} {
  if (draft.agent) {
    return {
      skills: dedupeStrings(draft.agent.skills ?? []),
      plugins: dedupeStrings(draft.agent.plugins ?? []),
    }
  }

  if (draft.team) {
    return {
      skills: dedupeStrings(draft.team.members.flatMap((member) => member.skills ?? [])),
      plugins: dedupeStrings(draft.team.members.flatMap((member) => member.plugins ?? [])),
    }
  }

  return { skills: [], plugins: [] }
}

export function setDraftCapabilities(
  draft: GenerationDraft,
  capabilities: {
    skills: string[]
    plugins: string[]
  },
): GenerationDraft {
  const skills = dedupeStrings(capabilities.skills)
  const plugins = dedupeStrings(capabilities.plugins)

  if (draft.agent) {
    return generationDraftSchema.parse({
      ...draft,
      agent: {
        ...draft.agent,
        skills: skills.length ? skills : undefined,
        plugins: plugins.length ? plugins : undefined,
      },
    })
  }

  if (!draft.team) return draft

  const members = draft.team.members.length
    ? draft.team.members
    : createDefaultTeamMembers({
        name: draft.starterName ?? draft.project.name,
        objective: draft.team.objective ?? draft.project.description ?? draft.sourcePrompt ?? draft.project.name,
        systemPrompt: draft.team.objective ?? draft.project.description ?? draft.sourcePrompt ?? draft.project.name,
      })
  const targetIndex = Math.max(0, members.findIndex((member) => member.is_coordinator))

  return generationDraftSchema.parse({
    ...draft,
    team: {
      ...draft.team,
      members: members.map((member, index) => index === targetIndex
        ? {
            ...member,
            skills: skills.length ? skills : undefined,
            plugins: plugins.length ? plugins : undefined,
          }
        : removeManagedCapabilities(member)),
    },
  })
}

export function convertDraftToTeam(draft: GenerationDraft): GenerationDraft {
  if (getDraftStructure(draft) === 'team' && draft.team) {
    return generationDraftSchema.parse({
      ...draft,
      agent: undefined,
    })
  }

  const agent = draft.agent
  const name = (draft.starterName ?? draft.project.name) || 'Agent'
  const objective = draft.project.description?.trim()
    || agent?.description?.trim()
    || draft.sourcePrompt?.trim()
    || agent?.system_prompt?.trim()
    || `Coordinate work for ${name}.`

  const team: TeamTemplateSpec = {
    kind: 'team',
    objective,
    members: createDefaultTeamMembers({
      name,
      objective,
      systemPrompt: agent?.system_prompt ?? objective,
      skills: agent?.skills,
      plugins: agent?.plugins,
      modelHint: agent?.model_hint,
    }),
    edges: [
      {
        from: 'Coordinator',
        to: 'Operator',
        label: 'delegates',
      },
    ],
    ...(agent?.channel_hints?.length ? { channel_hints: agent.channel_hints } : {}),
    ...(agent?.eval_pack?.length ? { eval_pack: agent.eval_pack } : {}),
  }

  return generationDraftSchema.parse({
    ...draft,
    mode: 'blank-team',
    template: undefined,
    agent: undefined,
    team,
  })
}

export function convertDraftToAgent(draft: GenerationDraft): GenerationDraft {
  if (getDraftStructure(draft) === 'agent' && draft.agent) {
    return generationDraftSchema.parse({
      ...draft,
      team: undefined,
    })
  }

  const team = draft.team
  const name = (draft.starterName ?? draft.project.name) || 'Agent'
  const objective = team?.objective?.trim()
    || draft.project.description?.trim()
    || draft.sourcePrompt?.trim()
    || `Operate as ${name}.`
  const normalizedTeam = team ? normalizeTeamSystemPrompts(team) : undefined
  const coordinator = normalizedTeam?.members.find((member) => member.is_coordinator) ?? normalizedTeam?.members[0]
  const memberSummary = team?.members.length
    ? normalizedTeam?.members
        .map((member) => `${member.role}: ${member.description ?? member.responsibilities?.join(', ') ?? 'handles assigned work'}`)
        .join('\n')
    : ''

  const agent: AgentTemplateSpec = {
    kind: 'agent',
    description: draft.project.description ?? objective,
    system_prompt: [
      coordinator?.system_prompt?.trim() || `You are ${name}. ${objective}`,
      memberSummary ? `\nMerged team responsibilities:\n${memberSummary}` : '',
    ].join('').trim(),
    ...(coordinator?.soul_content ? { soul_content: coordinator.soul_content } : {}),
    ...(coordinator?.model_hint ? { model_hint: coordinator.model_hint } : {}),
    skills: dedupeStrings(normalizedTeam?.members.flatMap((member) => member.skills ?? []) ?? []),
    plugins: dedupeStrings(normalizedTeam?.members.flatMap((member) => member.plugins ?? []) ?? []),
    ...(team?.channel_hints?.length ? { channel_hints: team.channel_hints } : {}),
    memory_enabled: true,
    memory_strategy: 'auto',
    default_schedules: dedupeSchedules(normalizedTeam?.members.flatMap((member) => member.default_schedules ?? []) ?? []),
    eval_pack: team?.eval_pack,
  }

  return generationDraftSchema.parse({
    ...draft,
    mode: 'blank-agent',
    template: undefined,
    team: undefined,
    agent,
  })
}

export function updateTeamMember(
  draft: GenerationDraft,
  role: string,
  updater: (member: TeamMemberSpec) => TeamMemberSpec,
): GenerationDraft {
  if (!draft.team) return draft
  const currentMember = draft.team.members.find((member) => member.role === role)
  const nextRole = currentMember ? updater(currentMember).role : role
  return generationDraftSchema.parse({
    ...draft,
    team: {
      ...draft.team,
      members: draft.team.members.map((member) => (
        member.role === role ? updater(member) : member
      )),
      edges: draft.team.edges.map((edge) => ({
        ...edge,
        from: edge.from === role ? nextRole : edge.from,
        to: edge.to === role ? nextRole : edge.to,
      })),
    },
  })
}

export function updateTeamMemberStructured(
  draft: GenerationDraft,
  role: string,
  updater: (member: TeamMemberSpec) => TeamMemberSpec,
): GenerationDraft {
  if (!draft.team) return draft
  const nextDraft = updateTeamMember(draft, role, (member) => updater(member))
  if (!nextDraft.team) return nextDraft

  return generationDraftSchema.parse({
    ...nextDraft,
    team: {
      ...nextDraft.team,
      members: nextDraft.team.members.map((member) => (
        member.system_prompt_mode === 'manual'
          ? member
          : withAutoTeamMemberPrompt(member, nextDraft.team!)
      )),
    },
  })
}

export function addTeamMember(draft: GenerationDraft): GenerationDraft {
  const teamDraft = draft.team ? draft : convertDraftToTeam(draft)
  const team = teamDraft.team
  if (!team) return teamDraft
  const existingRoles = new Set(team.members.map((member) => member.role))
  const role = buildUniqueRole(existingRoles, 'New role')
  const coordinator = team.members.find((member) => member.is_coordinator)?.role ?? team.members[0]?.role ?? 'Coordinator'
  return generationDraftSchema.parse({
    ...teamDraft,
    team: {
      ...team,
      members: [
        ...team.members,
        {
          role,
          description: '',
          responsibilities: [''],
          system_prompt: '',
          system_prompt_mode: 'auto',
        },
      ],
      edges: [
        ...team.edges,
        {
          from: coordinator,
          to: role,
          label: 'delegates',
        },
      ],
    },
  })
}

export function removeTeamMember(draft: GenerationDraft, role: string): GenerationDraft {
  if (!draft.team || draft.team.members.length <= 2) return draft
  const members = draft.team.members.filter((member) => member.role !== role)
  const hasCoordinator = members.some((member) => member.is_coordinator)
  return generationDraftSchema.parse({
    ...draft,
    team: {
      ...draft.team,
      members: members.map((member, index) => ({
        ...member,
        is_coordinator: hasCoordinator ? member.is_coordinator : index === 0,
      })),
      edges: draft.team.edges.filter((edge) => edge.from !== role && edge.to !== role),
    },
  })
}

function createDefaultTeamMembers(input: {
  name: string
  objective: string
  systemPrompt: string
  skills?: string[]
  plugins?: string[]
  modelHint?: string
}): TeamMemberSpec[] {
  return [
    {
      role: 'Coordinator',
      is_coordinator: true,
      description: 'Owns intake, routing, and final answer quality.',
      responsibilities: ['Clarify priorities', 'Route work', 'Deliver final output'],
      system_prompt: [
        `You are the coordinator for ${input.name}.`,
        input.systemPrompt,
        'Route work to specialists when useful and keep the final output concise and actionable.',
      ].join('\n\n'),
      ...(input.modelHint ? { model_hint: input.modelHint } : {}),
      ...(input.skills?.length ? { skills: dedupeStrings(input.skills) } : {}),
      ...(input.plugins?.length ? { plugins: dedupeStrings(input.plugins) } : {}),
    },
    {
      role: 'Operator',
      description: 'Executes the core work and returns structured progress to the coordinator.',
      responsibilities: ['Execute assigned work', 'Report progress', 'Surface blockers'],
      system_prompt: [
        `You are the operator for ${input.name}.`,
        input.objective,
        'Execute assigned work directly and return concise structured updates.',
      ].join('\n\n'),
      ...(input.modelHint ? { model_hint: input.modelHint } : {}),
    },
  ]
}

function removeManagedCapabilities(member: TeamMemberSpec): TeamMemberSpec {
  const next = { ...member }
  delete next.skills
  delete next.plugins
  return next
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function dedupeSchedules(schedules: NonNullable<AgentTemplateSpec['default_schedules']>): NonNullable<AgentTemplateSpec['default_schedules']> | undefined {
  const seen = new Set<string>()
  const next = schedules.filter((schedule) => {
    const key = `${schedule.cron}:${schedule.prompt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return next.length ? next : undefined
}

function buildUniqueRole(existingRoles: Set<string>, baseRole: string): string {
  if (!existingRoles.has(baseRole)) return baseRole
  let index = 2
  while (existingRoles.has(`${baseRole} ${index}`)) index += 1
  return `${baseRole} ${index}`
}
