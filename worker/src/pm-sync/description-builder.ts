/**
 * PM Sync — Shared Description Builder.
 *
 * Builds the work-item description body injected into external PM tools.
 * Embeds a hidden HTML comment marker (`<!-- lucid-work-item: <uuid> -->`)
 * so the adapter can detect echoes of its own writes.
 *
 * Two format modes:
 *   - `markdown` — Linear, GitHub Issues, any tool that renders Markdown
 *   - `plaintext` — Asana (notes), Trello (desc), Monday (text column)
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import type { HumanWorkItemLite } from './types.js'

/** HTML comment marker prefix embedded in every external description. */
export const LUCID_MARKER_PREFIX = '<!-- lucid-work-item:'

/** Regex to extract the work-item UUID from the marker. */
export const LUCID_MARKER_REGEX = /<!--\s*lucid-work-item:\s*([0-9a-f-]{36})\s*-->/i

export type DescriptionFormat = 'markdown' | 'plaintext'

/**
 * Build the description body for an external PM issue/task/card.
 *
 * Always starts with the Lucid marker comment (invisible in most
 * rendered views), followed by the work item body and optional
 * DAG context section.
 */
export function buildDescription(
  wi: HumanWorkItemLite,
  format: DescriptionFormat = 'plaintext',
): string {
  const marker = `${LUCID_MARKER_PREFIX} ${wi.id} -->`
  const body = (wi.description ?? '').trim()

  const placeholder =
    format === 'markdown'
      ? (body.length > 0 ? body : '_No description provided._')
      : (body.length > 0 ? body : 'No description provided.')

  const lines: string[] = [marker, '', placeholder]

  if (wi.dagContext) {
    if (format === 'markdown') {
      lines.push(
        '',
        '---',
        '',
        '**Lucid DAG Context**',
        '',
        `- DAG: \`${wi.dagContext.dagId}\``,
        `- Node: \`${wi.dagContext.dagNodeId}\``,
        `- Downstream blocked: **${wi.dagContext.downstreamBlockedCount}** node(s)`,
      )
    } else {
      lines.push(
        '',
        '---',
        '',
        'Lucid DAG Context',
        `  DAG: ${wi.dagContext.dagId}`,
        `  Node: ${wi.dagContext.dagNodeId}`,
        `  Downstream blocked: ${wi.dagContext.downstreamBlockedCount} node(s)`,
      )
    }
  }
  return lines.join('\n')
}
