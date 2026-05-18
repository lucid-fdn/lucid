import 'server-only'

import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { TeamEdgeSpec, TeamMemberSpec } from '@contracts/template'

import type { BuilderCapabilityRegistry } from './capability-registry'
import type { GenerationDraft } from './schemas'

export interface BuilderTeamTopologyPlan {
  mode: GenerationDraft['mode']
  rationale: string
  objective?: string
  members: TeamMemberSpec[]
  edges: TeamEdgeSpec[]
  runtimeMode?: RuntimeBlueprint['mode']
}

function buildSingleAgentPlan(prompt: string): BuilderTeamTopologyPlan {
  return {
    mode: 'blank-agent',
    rationale: `A single operator is enough for "${prompt}" unless the user asks for explicit review loops or handoffs.`,
    edges: [],
    members: [],
  }
}

function buildDefaultTeamMembers(prompt: string, registry: BuilderCapabilityRegistry): TeamMemberSpec[] {
  const lower = prompt.toLowerCase()
  const sharedSkills = registry.skills
    .filter((skill) => /(analysis|research|ops|support|automation|planning)/i.test(skill.slug))
    .slice(0, 2)
    .map((skill) => skill.slug)

  if (/(research|brief|market|competitive|analyst)/i.test(lower)) {
    return [
      {
        role: 'Coordinator',
        is_coordinator: true,
        description: 'Owns the outcome, prioritizes requests, and turns findings into operator-ready actions.',
        responsibilities: ['Triage requests', 'Decide next action', 'Assemble the final brief'],
        system_prompt: 'Coordinate the research workflow and keep the user focused on the next high-leverage action.',
        skills: sharedSkills,
      },
      {
        role: 'Research Analyst',
        description: 'Collects facts, compares sources, and drafts structured findings.',
        responsibilities: ['Gather source material', 'Compare options', 'Draft concise findings'],
        system_prompt: 'Research quickly, compare options, and return concise structured findings with citations or caveats.',
        skills: sharedSkills,
      },
    ]
  }

  if (/(review|approve|handoff|team|multi-agent|escalat)/i.test(lower)) {
    return [
      {
        role: 'Coordinator',
        is_coordinator: true,
        description: 'Owns task intake, orchestration, and final accountability.',
        responsibilities: ['Own final answer quality', 'Route work', 'Resolve blockers'],
        system_prompt: 'Coordinate work across specialists and keep the final output concise and decision-ready.',
        skills: sharedSkills,
      },
      {
        role: 'Specialist',
        description: 'Executes the domain work and returns draft outputs to the coordinator.',
        responsibilities: ['Do the specialized work', 'Return structured output', 'Escalate blockers early'],
        system_prompt: 'Execute the specialist task directly, return structured work, and surface blockers without delay.',
        skills: sharedSkills,
      },
    ]
  }

  return [
    {
      role: 'Coordinator',
      is_coordinator: true,
      description: 'Owns the final deliverable and keeps the workflow moving.',
      responsibilities: ['Own final output', 'Route work', 'Keep the workflow on track'],
      system_prompt: 'Coordinate the workflow, keep work crisp, and make sure the final output is actionable.',
      skills: sharedSkills,
    },
    {
      role: 'Operator',
      description: 'Handles the execution work requested by the user.',
      responsibilities: ['Execute the task', 'Report progress', 'Return structured output'],
      system_prompt: 'Handle the main execution work directly and return concise structured output to the coordinator.',
      skills: sharedSkills,
    },
  ]
}

export function recommendRuntimeMode(
  prompt: string,
  preferred?: RuntimeBlueprint['mode'],
): RuntimeBlueprint['mode'] | undefined {
  if (preferred) return preferred
  const lower = prompt.toLowerCase()
  if (/(dedicated|private runtime|isolate|secure enclave|always-on)/i.test(lower)) return 'dedicated'
  if (/(bring your own|byo|self-hosted runtime|external runtime)/i.test(lower)) return 'byo'
  return 'shared'
}

export function planBuilderTeamTopology(input: {
  prompt: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: RuntimeBlueprint['mode']
  registry: BuilderCapabilityRegistry
}): BuilderTeamTopologyPlan {
  const { prompt, preferredMode, registry } = input
  const lower = prompt.toLowerCase()
  const explicitTeam = preferredMode === 'team' || /(team|multi-agent|handoff|review loop|reviewer|coordinator)/i.test(lower)
  const explicitSingle = preferredMode === 'agent' || /(single agent|solo agent|one agent)/i.test(lower)

  if (!explicitTeam && explicitSingle) {
    return {
      ...buildSingleAgentPlan(prompt),
      runtimeMode: recommendRuntimeMode(prompt, input.runtimeMode),
    }
  }

  if (!explicitTeam) {
    return {
      ...buildSingleAgentPlan(prompt),
      runtimeMode: recommendRuntimeMode(prompt, input.runtimeMode),
    }
  }

  const members = buildDefaultTeamMembers(prompt, registry)
  const coordinator = members.find((member) => member.is_coordinator)?.role ?? members[0]?.role ?? 'Coordinator'
  const edges = members
    .filter((member) => member.role !== coordinator)
    .map((member) => ({
      from: coordinator,
      to: member.role,
      label: 'delegates',
    }))

  return {
    mode: 'blank-team',
    rationale: `A team is appropriate because the request implies distinct roles, review, or handoffs for "${prompt}".`,
    objective: prompt.trim(),
    members,
    edges,
    runtimeMode: recommendRuntimeMode(prompt, input.runtimeMode),
  }
}
