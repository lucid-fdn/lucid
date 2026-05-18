/**
 * Description Builder — Shared prose renderer for PM issue bodies.
 *
 * Every adapter calls `buildDescription()` to produce the body that will
 * land in the external tool. The builder prepends a hidden HTML comment
 * marker so webhook echoes can be short-circuited before any DB write,
 * and adds a DAG context block when the work item is attached to a Nerve
 * node (downstream dependency count, dag id for operator reference).
 *
 * The marker format is a stable contract — the webhook receiver grep-s
 * for it to detect echoes. Do NOT change the prefix without bumping a
 * migration that rewrites existing bodies.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.1
 */

import type { HumanWorkItemLite } from '@contracts/pm-adapter'

/** Hidden marker prepended to every PM issue body. */
export const LUCID_WORK_ITEM_MARKER_PREFIX = '<!-- lucid-work-item:'
const LUCID_WORK_ITEM_MARKER_SUFFIX = '-->'

/** Regex used by the webhook receiver to pull the work item id out of a body. */
export const LUCID_WORK_ITEM_MARKER_REGEX =
  /<!--\s*lucid-work-item:\s*([0-9a-f-]{36})\s*-->/i

/**
 * Render the work item body. Always prefixes the hidden marker, then the
 * work item description (or a placeholder), then the DAG context block
 * when present. Safe to pass null/undefined — the builder normalizes.
 */
export function buildDescription(wi: HumanWorkItemLite): string {
  const marker = `${LUCID_WORK_ITEM_MARKER_PREFIX} ${wi.id} ${LUCID_WORK_ITEM_MARKER_SUFFIX}`
  const body = (wi.description ?? '').trim()
  const placeholder = body.length > 0 ? body : '_No description provided._'

  const lines: string[] = [marker, '', placeholder]

  if (wi.dagContext) {
    lines.push(
      '',
      '---',
      '',
      '**Lucid DAG Context**',
      '',
      `- DAG: \`${wi.dagContext.dagId}\``,
      `- Node: \`${wi.dagContext.dagNodeId}\``,
      `- Downstream blocked: **${wi.dagContext.downstreamBlockedCount}** node(s)`,
      '',
      '_Closing this issue will unblock the downstream graph automatically._',
    )
  }

  if (wi.labels.length > 0) {
    lines.push('', `Labels: ${wi.labels.map((l) => `\`${l}\``).join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * Parse the hidden marker out of a body. Returns the work item id or null
 * when no marker is present. Used by webhook handlers to short-circuit
 * echo loops without hitting the DB.
 */
export function extractWorkItemIdFromBody(body: string | null | undefined): string | null {
  if (!body) return null
  const match = body.match(LUCID_WORK_ITEM_MARKER_REGEX)
  return match ? match[1] : null
}
