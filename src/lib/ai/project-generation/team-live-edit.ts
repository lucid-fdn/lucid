import type { CrewEdge, CrewMember } from '@contracts/crew'

import type { GenerationDraft } from './schemas'

export interface TeamDraftApplyPlan {
  crew: {
    name: string
    description: string | null
    objective: string
  }
  memberUpdates: Array<{
    memberId: string
    currentRole: string
    role: string
    isCoordinator: boolean
  }>
  memberAdditions: Array<{
    role: string
    isCoordinator: boolean
  }>
  memberRemovals: Array<{
    memberId: string
    role: string
  }>
  edges: Array<{
    fromRole: string
    toRole: string
    label?: string
  }>
}

export interface TeamDraftApplyPlanResult {
  plan?: TeamDraftApplyPlan
  reason?: string
}

export function buildTeamDraftApplyPlan(input: {
  draft: GenerationDraft
  members: Array<Pick<CrewMember, 'id' | 'join_order' | 'role'>>
}): TeamDraftApplyPlanResult {
  if (input.draft.mode !== 'blank-team' || !input.draft.team) {
    return {
      reason: 'This suggestion is no longer a team draft and cannot be applied directly to the current team.',
    }
  }

  const proposedMembers = input.draft.team.members
  const currentMembers = [...input.members].sort((left, right) => left.join_order - right.join_order)

  const coordinatorCount = proposedMembers.filter((member) => member.is_coordinator).length
  if (coordinatorCount !== 1) {
    return {
      reason: 'This suggestion does not resolve to exactly one coordinator, so it cannot be applied safely.',
    }
  }

  const proposedRoles = proposedMembers.map((member) => member.role.trim())
  if (proposedRoles.some((role) => !role)) {
    return {
      reason: 'This suggestion contains an empty team role and cannot be applied safely.',
    }
  }

  if (new Set(proposedRoles).size !== proposedRoles.length) {
    return {
      reason: 'This suggestion reuses the same team role name more than once, which makes live edge mapping ambiguous.',
    }
  }

  const roleToMemberId = new Map<string, string>()
  const memberUpdates = proposedMembers.slice(0, currentMembers.length).map((member, index) => {
    const target = currentMembers[index]
    const role = member.role.trim()
    roleToMemberId.set(role, target.id)
    return {
      memberId: target.id,
      currentRole: target.role,
      role,
      isCoordinator: Boolean(member.is_coordinator),
    }
  })

  const memberAdditions = proposedMembers.slice(currentMembers.length).map((member) => ({
    role: member.role.trim(),
    isCoordinator: Boolean(member.is_coordinator),
  }))

  const memberRemovals = currentMembers.slice(proposedMembers.length).map((member) => ({
    memberId: member.id,
    role: member.role,
  }))

  return {
    plan: {
      crew: {
        name: input.draft.starterName?.trim() || input.draft.project.name.trim(),
        description: input.draft.project.description?.trim() || null,
        objective: input.draft.team.objective?.trim() || '',
      },
      memberUpdates,
      memberAdditions,
      memberRemovals,
      edges: input.draft.team.edges.map((edge) => ({
        fromRole: edge.from,
        toRole: edge.to,
        ...(edge.label?.trim() ? { label: edge.label.trim() } : {}),
      })),
    },
  }
}

export function sortCrewMembersForDraft<T extends Pick<CrewMember, 'join_order'>>(members: T[]): T[] {
  return [...members].sort((left, right) => left.join_order - right.join_order)
}

export function mapCrewEdgesToRoleHandoffs(input: {
  members: Array<Pick<CrewMember, 'id' | 'role' | 'join_order'>>
  edges: Array<Pick<CrewEdge, 'source_member_id' | 'target_member_id' | 'label'>>
}): Array<{ from: string; to: string; label?: string }> {
  const roleById = new Map(
    sortCrewMembersForDraft(input.members).map((member) => [member.id, member.role]),
  )

  return input.edges
    .map((edge) => {
      const from = roleById.get(edge.source_member_id)
      const to = roleById.get(edge.target_member_id)
      if (!from || !to) return null
      return {
        from,
        to,
        ...(edge.label?.trim() ? { label: edge.label.trim() } : {}),
      }
    })
    .filter((edge): edge is { from: string; to: string; label?: string } => Boolean(edge))
}
