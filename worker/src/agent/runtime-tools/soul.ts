/**
 * soul_edit — Agent self-modification of persistent identity (SOUL).
 *
 * Updates the agent's `soul_content` column in `ai_assistants`.
 * Content persists across all conversations and is injected into
 * the system prompt as ## Agent Identity.
 *
 * Rate-limited to 3 edits per run to prevent loop-hammering.
 * Emits feed event for Mission Control visibility.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { emitAgentFeedEvent } from './feed-events.js'

interface SoulEditContext {
  supabase: SupabaseClient
  assistantId: string
  orgId: string
  runId?: string
}

const MAX_SOUL_LENGTH = 10_000
const MAX_EDITS_PER_RUN = 3

/** Per-run edit counter — keyed by runId, cleared when run ends. */
const runEditCounts = new Map<string, number>()

/** Clean up counter for a finished run. */
export function clearRunEditCount(runId: string): void {
  runEditCounts.delete(runId)
}

export async function toolSoulEdit(
  args: { content: string },
  ctx: SoulEditContext,
): Promise<string> {
  // ── Validation ──────────────────────────────────────────────────────
  if (!args.content || typeof args.content !== 'string') {
    return JSON.stringify({ ok: false, error: 'content is required and must be a string' })
  }

  if (args.content.length > MAX_SOUL_LENGTH) {
    return JSON.stringify({
      ok: false,
      error: `content exceeds maximum length of ${MAX_SOUL_LENGTH} characters (got ${args.content.length})`,
    })
  }

  // ── Rate limit (per-run) ────────────────────────────────────────────
  if (ctx.runId) {
    const count = runEditCounts.get(ctx.runId) ?? 0
    if (count >= MAX_EDITS_PER_RUN) {
      return JSON.stringify({
        ok: false,
        error: `soul_edit rate limit: max ${MAX_EDITS_PER_RUN} edits per run`,
      })
    }
    runEditCounts.set(ctx.runId, count + 1)
  }

  // ── Persist ─────────────────────────────────────────────────────────
  const { error } = await ctx.supabase
    .from('ai_assistants')
    .update({ soul_content: args.content, updated_at: new Date().toISOString() })
    .eq('id', ctx.assistantId)

  if (error) {
    console.error(`[soul_edit] Failed to update soul for ${ctx.assistantId}:`, error.message)
    return JSON.stringify({ ok: false, error: 'Failed to persist soul update' })
  }

  // ── Feed event (fire-and-forget) ────────────────────────────────────
  emitAgentFeedEvent(ctx.supabase, {
    agentId: ctx.assistantId,
    orgId: ctx.orgId,
    eventType: 'soul_updated',
    runId: ctx.runId,
    payload: {
      content_length: args.content.length,
      preview: args.content.slice(0, 200),
    },
  })

  return JSON.stringify({
    ok: true,
    message: 'Soul updated. Changes will take effect on your next conversation.',
    contentLength: args.content.length,
  })
}
