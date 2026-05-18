import type { PmIssuePatch } from '@contracts/pm-adapter'
import type { WorkGraphFieldAuthority, WorkGraphProviderFieldMap } from '@contracts/work-graph'
import type {
  WorkGraphFederatedField,
  WorkGraphPmInboundDecision,
  WorkGraphPmInboundDecisionInput,
} from './types'

const PATCH_FIELD_MAP = Object.freeze({
  title: 'title',
  description: 'description',
  priority: 'priority',
  labels: 'labels',
  assigneeUserId: 'assignee',
  dueAt: 'due_at',
} satisfies Partial<Record<keyof PmIssuePatch, WorkGraphFederatedField>>)

export function listPatchFields(patch: PmIssuePatch | null | undefined): WorkGraphFederatedField[] {
  if (!patch) return []
  const fields = new Set<WorkGraphFederatedField>()
  for (const [patchKey, field] of Object.entries(PATCH_FIELD_MAP)) {
    if ((patch as Record<string, unknown>)[patchKey] !== undefined) fields.add(field)
  }
  return [...fields].sort()
}

export function decideInboundPmPatch(input: WorkGraphPmInboundDecisionInput): WorkGraphPmInboundDecision {
  const fields = listPatchFields(input.patch)
  if (fields.length === 0) {
    return {
      applyPatch: false,
      conflictState: 'clean',
      mode: input.config.mode,
      fields: [],
      needsReview: false,
      reason: 'No Work Graph mapped fields were present on the provider event.',
    }
  }

  const decisions = fields.map((field) => {
    const authority = authorityForField(input.config.field_authority, field)
    return {
      field,
      authority,
      apply: shouldApplyInboundField(input.config.mode, authority),
      reason: inboundFieldReason(input.config.mode, authority),
    }
  })

  const appliedCount = decisions.filter((decision) => decision.apply).length
  const needsReview = decisions.some((decision) => decision.authority === 'review_required')
  const conflict = decisions.some((decision) => decision.authority === 'lucid' || decision.authority === 'review_required')
  const applyPatch = appliedCount > 0 && appliedCount === decisions.length

  return {
    applyPatch,
    conflictState: needsReview ? 'needs_review' : conflict ? 'conflict' : 'remote_changed',
    mode: input.config.mode,
    fields: decisions,
    needsReview,
    reason: applyPatch
      ? 'Provider update is allowed by Work Graph field authority.'
      : 'Provider update requires Work Graph review before canonical fields change.',
  }
}

function authorityForField(
  fieldAuthority: WorkGraphProviderFieldMap,
  field: WorkGraphFederatedField,
): WorkGraphFieldAuthority {
  return fieldAuthority[field] ?? 'review_required'
}

function shouldApplyInboundField(
  mode: WorkGraphPmInboundDecisionInput['config']['mode'],
  authority: WorkGraphFieldAuthority,
): boolean {
  if (mode === 'lucid_authoritative') return false
  if (mode === 'mirror_only') return authority !== 'lucid' && authority !== 'review_required'
  if (mode === 'provider_authoritative') return authority === 'provider' || authority === 'last_writer_wins'
  return authority === 'provider' || authority === 'last_writer_wins'
}

function inboundFieldReason(
  mode: WorkGraphPmInboundDecisionInput['config']['mode'],
  authority: WorkGraphFieldAuthority,
): string {
  if (mode === 'lucid_authoritative') return 'Lucid is authoritative for this provider.'
  if (authority === 'lucid') return 'Lucid owns this field.'
  if (authority === 'provider') return 'Provider owns this field.'
  if (authority === 'last_writer_wins') return 'Field is configured as last-writer-wins.'
  return 'Field requires operator review.'
}
