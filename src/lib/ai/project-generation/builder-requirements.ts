import type { GenerationDraft } from './schemas'

export interface BuilderRequiredInput {
  key: string
  label: string
  reason: string
}

export function getMissingDraftRequiredInputs(draft: GenerationDraft | null | undefined): BuilderRequiredInput[] {
  if (!draft) return []

  const missing: BuilderRequiredInput[] = []
  if (!draft.project.name.trim()) {
    missing.push({
      key: 'project.name',
      label: 'Name',
      reason: 'Add a name before creating.',
    })
  }

  if (draft.mode === 'blank-agent' && !draft.agent?.system_prompt?.trim()) {
    missing.push({
      key: 'agent.system_prompt',
      label: 'System prompt',
      reason: 'Add the agent instructions before creating.',
    })
  }

  if (draft.mode === 'blank-team' && !draft.team?.objective?.trim()) {
    missing.push({
      key: 'team.objective',
      label: 'Team objective',
      reason: 'Add the team objective before creating.',
    })
  }

  if (draft.mode === 'blank-team' && (!draft.team?.members || draft.team.members.length < 2)) {
    missing.push({
      key: 'team.members',
      label: 'At least two roles',
      reason: 'Add at least two team roles before creating.',
    })
  }

  for (const member of draft.team?.members ?? []) {
    if (!member.role.trim() || !member.system_prompt.trim()) {
      missing.push({
        key: `team.member.${member.role || 'role'}`,
        label: 'Team role instructions',
        reason: 'Each team role needs a name and instructions before creating.',
      })
      break
    }
  }

  return missing
}
