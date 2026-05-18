import type { Agent as Assistant } from '@/types/agent'

import type { GenerationDraft } from './schemas'

export interface TeamCreationMemberDraft {
  assistant: Pick<Assistant, 'id' | 'name' | 'description' | 'system_prompt' | 'lucid_model'>
  role: string
  isCoordinator: boolean
}

export interface TeamCreationApplyResult {
  name?: string
  objective?: string
  members?: TeamCreationMemberDraft[]
  reason?: string
}

export function applyGeneratedTeamDraftToCreation(input: {
  draft: GenerationDraft
  members: TeamCreationMemberDraft[]
}): TeamCreationApplyResult {
  if (input.draft.mode !== 'blank-team' || !input.draft.team) {
    return {
      reason: 'This suggestion is not a team draft and cannot be applied in the team creation dialog.',
    }
  }

  if (input.draft.team.members.length !== input.members.length) {
    return {
      reason: 'This suggestion changes the number of team members. Adjust the member selection first, then refine again.',
    }
  }

  return {
    name: input.draft.starterName?.trim() || input.draft.project.name.trim(),
    objective: input.draft.team.objective?.trim() || '',
    members: input.members.map((member, index) => ({
      assistant: member.assistant,
      role: input.draft.team!.members[index]?.role?.trim() || member.role || member.assistant.name,
      isCoordinator: Boolean(input.draft.team!.members[index]?.is_coordinator),
    })),
  }
}
