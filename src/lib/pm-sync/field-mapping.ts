/**
 * Field Mapping — Generic helpers for status/priority conversion.
 *
 * Providers all use different vocabularies (Linear: "Backlog/Todo/Started/
 * Done/Canceled", Asana: completed bool, Trello: list id, Monday: label).
 * Individual adapters keep their own provider-specific maps, but these
 * helpers capture the shared logic (bidirectional lookup, fallback to
 * neutral values) so each adapter doesn't reinvent it.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import type { HumanWorkItemLite } from '@contracts/pm-adapter'

export type WorkItemStatus = HumanWorkItemLite['status']
export type WorkItemPriority = HumanWorkItemLite['priority']

export const WORK_ITEM_STATUSES: readonly WorkItemStatus[] = [
  'open',
  'in_progress',
  'waiting',
  'done',
  'cancelled',
  'rejected',
] as const

export const WORK_ITEM_PRIORITIES: readonly WorkItemPriority[] = [
  'critical',
  'high',
  'normal',
  'low',
] as const

/**
 * Build a pair of lookup functions from a bidirectional map. Returns
 * `mapToExternal(status)` and `mapFromExternal(externalValue)`. Both
 * fall back to the supplied defaults when a key is missing so adapters
 * never throw on unknown values — drift is normal.
 */
export function buildStatusMap<T extends string>(
  map: Record<WorkItemStatus, T>,
  fallbackExternal: T,
  fallbackInternal: WorkItemStatus,
) {
  // Build the reverse map once. When multiple internal statuses share
  // an external value, the first one wins (caller controls ordering).
  const reverse = new Map<T, WorkItemStatus>()
  for (const s of WORK_ITEM_STATUSES) {
    const ext = map[s]
    if (!reverse.has(ext)) reverse.set(ext, s)
  }

  function toExternal(status: WorkItemStatus): T {
    return map[status] ?? fallbackExternal
  }

  function fromExternal(value: string | null | undefined): WorkItemStatus {
    if (value == null) return fallbackInternal
    return reverse.get(value as T) ?? fallbackInternal
  }

  return { toExternal, fromExternal }
}

/**
 * Same shape as `buildStatusMap` but for priorities. Split because
 * priorities are usually numeric (Linear 0-4) while statuses are
 * usually named.
 */
export function buildPriorityMap<T extends string | number>(
  map: Record<WorkItemPriority, T>,
  fallbackExternal: T,
  fallbackInternal: WorkItemPriority = 'normal',
) {
  const reverse = new Map<T, WorkItemPriority>()
  for (const p of WORK_ITEM_PRIORITIES) {
    const ext = map[p]
    if (!reverse.has(ext)) reverse.set(ext, p)
  }

  function toExternal(priority: WorkItemPriority): T {
    return map[priority] ?? fallbackExternal
  }

  function fromExternal(value: T | null | undefined): WorkItemPriority {
    if (value == null) return fallbackInternal
    return reverse.get(value) ?? fallbackInternal
  }

  return { toExternal, fromExternal }
}

/**
 * Resolve the "closed" bucket for a given internal status. Used by
 * reconcile to decide whether the mirror is in a terminal state.
 */
export function isTerminalStatus(status: WorkItemStatus): boolean {
  return status === 'done' || status === 'cancelled' || status === 'rejected'
}
