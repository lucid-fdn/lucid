import type { TemplateCatalogEntry } from '@contracts/template'

import { generationDraftSchema, type GenerationDraft, type MissingRequiredInput } from './schemas'

export interface GenerationValidationResult {
  draft: GenerationDraft
  warnings: string[]
  missingRequiredInputs: MissingRequiredInput[]
}

export function validateAndRepairDraft(
  input: GenerationDraft,
  templatesBySlug: Map<string, TemplateCatalogEntry>,
): GenerationValidationResult {
  const parsed = generationDraftSchema.parse(input)
  const draft = repairDraft(parsed)
  const warnings: string[] = []
  const missingRequiredInputs: MissingRequiredInput[] = []

  if (!draft.project.name.trim()) {
    throw new Error('Project name is required')
  }

  if (draft.runtime?.mode === 'shared' && draft.runtime.provider) {
    warnings.push('Shared runtime ignores a custom provider selection')
  }

  if (draft.mode === 'template') {
    const template = draft.template ? templatesBySlug.get(draft.template.slug) : null
    if (!template || !draft.template) {
      throw new Error('Template draft references an unavailable template')
    }

    const params = draft.template.params
    for (const param of template.params ?? []) {
      const value = params[param.key]?.trim()
      if (param.required && !value && !param.default) {
        missingRequiredInputs.push({
          key: param.key,
          label: param.label,
          reason: `${template.name} requires this value before deploy`,
        })
      }
    }
  }

  if (draft.mode === 'blank-agent') {
    if (!draft.agent?.system_prompt?.trim()) {
      throw new Error('Blank agent drafts require a system prompt')
    }
  }

  if (draft.mode === 'blank-team') {
    if (!draft.team) {
      throw new Error('Blank team drafts require a team spec')
    }
    if (draft.team.members.length < 2) {
      throw new Error('Generated teams need at least two members')
    }
    if (draft.team.members.length > 5) {
      throw new Error('Generated teams are limited to five members in v1')
    }

    const coordinatorCount = draft.team.members.filter((member) => member.is_coordinator).length
    if (coordinatorCount !== 1) {
      throw new Error('Generated teams must have exactly one coordinator')
    }

    const memberRoles = new Set(draft.team.members.map((member) => member.role))
    const invalidEdges = draft.team.edges.filter((edge) => !memberRoles.has(edge.from) || !memberRoles.has(edge.to))
    if (invalidEdges.length > 0) {
      throw new Error('Generated teams contain invalid handoff edges')
    }

    if (draft.team.edges.length === 0) {
      warnings.push('Team has no explicit handoffs; Lucid will still deploy it, but review the coordination shape')
    }
  }

  return {
    draft,
    warnings,
    missingRequiredInputs,
  }
}

function repairDraft(draft: GenerationDraft): GenerationDraft {
  if (draft.mode !== 'blank-team' || !draft.team) {
    return draft
  }

  let members = draft.team.members.map((member, index) => ({
    ...member,
    is_coordinator: index === 0 ? true : Boolean(member.is_coordinator),
  }))

  if (!members.some((member) => member.is_coordinator)) {
    members = members.map((member, index) => ({
      ...member,
      is_coordinator: index === 0,
    }))
  } else {
    let seenCoordinator = false
    members = members.map((member) => {
      if (!member.is_coordinator) return member
      if (!seenCoordinator) {
        seenCoordinator = true
        return member
      }
      return {
        ...member,
        is_coordinator: false,
      }
    })
  }

  const existingRoles = new Set(members.map((member) => member.role))
  const edges = draft.team.edges
    .filter((edge) => existingRoles.has(edge.from) && existingRoles.has(edge.to))
    .slice(0, 8)

  return {
    ...draft,
    team: {
      ...draft.team,
      members: members.slice(0, 5),
      edges,
    },
  }
}
