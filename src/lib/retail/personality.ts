import 'server-only'

import { AssistantOrgMismatchError, updateAssistant } from '@/lib/db'

import { resolveRetailAssistantForUser } from './ownership'
import { getRetailSoulPreset, RETAIL_SOUL_MAX_LENGTH } from './soul-presets'

/**
 * Possible failures when updating a retail agent's personality.
 * Thin sentinel type — the HTTP adapter maps these to status codes.
 * We deliberately collapse "unknown assistant" and "not yours" into a
 * single `not_found` so we never leak ownership information.
 */
export type RetailPersonalityError =
  | 'invalid_id'
  | 'not_found'
  | 'invalid_preset'
  | 'too_long'

export type RetailPersonalityResult =
  | { ok: true; assistantId: string; soulContent: string }
  | { ok: false; reason: RetailPersonalityError }

interface UpdatePersonalityParams {
  userId: string
  assistantId: string
  /** Either a known preset slug OR free-form content (not both). */
  presetId?: string
  /** Free-form soul_content override. Capped by RETAIL_SOUL_MAX_LENGTH. */
  content?: string
}

/**
 * Updates a retail agent's `soul_content` after verifying ownership.
 *
 * Two input modes, exactly one of which must be provided:
 *   - `presetId`: looks up a canned personality from `RETAIL_SOUL_PRESETS`
 *   - `content`: free-form text, trimmed, length-capped
 *
 * On success returns the stored `soul_content` so the client can reflect
 * the actual persisted value (relevant when a preset was picked — the UI
 * may want to show the underlying text in the edit box).
 *
 * All failure modes return `{ ok: false }` with a discriminator — the
 * caller decides whether to 400 or 404.
 */
export async function updateRetailAgentPersonality(
  params: UpdatePersonalityParams,
): Promise<RetailPersonalityResult> {
  const { userId, assistantId, presetId, content } = params

  const ownership = await resolveRetailAssistantForUser(userId, assistantId)
  if (!ownership.ok) {
    return { ok: false, reason: ownership.reason }
  }

  let nextContent: string
  if (presetId) {
    const preset = getRetailSoulPreset(presetId)
    if (!preset) {
      return { ok: false, reason: 'invalid_preset' }
    }
    nextContent = preset.content
  } else {
    // Free-text path — trim, then check length. Trim BEFORE the cap so a
    // user who pastes trailing whitespace doesn't get a spurious error.
    const trimmed = (content ?? '').trim()
    if (trimmed.length > RETAIL_SOUL_MAX_LENGTH) {
      return { ok: false, reason: 'too_long' }
    }
    nextContent = trimmed
  }

  // Empty free-text is a valid "clear the personality" — pass null so the
  // worker's soul injector skips the `## Agent Identity` block entirely.
  //
  // TOCTOU prevention: pass `ownership.orgId` as the third arg so
  // `updateAssistant` scopes the UPDATE with `eq('org_id', ...)`. If the
  // assistant was reassigned between `resolveRetailAssistantForUser` and
  // this write, the UPDATE matches 0 rows and throws
  // `AssistantOrgMismatchError` — we catch it and collapse to `not_found`
  // without ever leaking the mutation back to the caller.
  try {
    await updateAssistant(
      ownership.assistant.id,
      { soul_content: nextContent.length === 0 ? null : nextContent },
      ownership.orgId,
    )
  } catch (err) {
    if (err instanceof AssistantOrgMismatchError) {
      return { ok: false, reason: 'not_found' }
    }
    throw err
  }

  return {
    ok: true,
    assistantId: ownership.assistant.id,
    soulContent: nextContent,
  }
}
