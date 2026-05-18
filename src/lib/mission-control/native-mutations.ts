import type { NativeMutationCandidateRecord, NativeMutationOpsSummary } from '@/lib/db/mission-control'

export function formatMutationKindLabel(
  mutationKind: NativeMutationCandidateRecord['mutation_kind'],
) {
  switch (mutationKind) {
    case 'memory_write':
      return 'Memory write'
    case 'skill_create':
      return 'Skill create'
    case 'skill_update':
      return 'Skill update'
    case 'skill_delete':
      return 'Skill delete'
    default:
      return mutationKind
  }
}

export function formatCandidateStatusLabel(
  status: NativeMutationCandidateRecord['status'],
) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'applying':
      return 'Applying'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'promoted':
      return 'Promoted'
    default:
      return status
  }
}

export function getCandidateStatusBadgeClass(
  status: NativeMutationCandidateRecord['status'],
) {
  switch (status) {
    case 'applying':
      return 'bg-sky-500/15 text-sky-400'
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-400'
    case 'rejected':
      return 'bg-red-500/15 text-red-400'
    case 'promoted':
      return 'bg-blue-500/15 text-blue-400'
    case 'pending':
    default:
      return 'bg-amber-500/15 text-amber-400'
  }
}

export function getNativeMutationOpsHealth(
  summary: NativeMutationOpsSummary,
): {
  backlogVariant: 'default' | 'warning' | 'error'
  failureVariant: 'default' | 'warning' | 'error'
} {
  const backlogVariant =
    summary.pendingCount >= 25 ? 'error' : summary.pendingCount >= 10 ? 'warning' : 'default'
  const failureVariant =
    summary.failedLast24h >= 5 ? 'error' : summary.failedLast24h >= 1 ? 'warning' : 'default'

  return { backlogVariant, failureVariant }
}
