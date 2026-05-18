/**
 * Discord bot token validation (live REST check).
 *
 * Called from the POST /api/assistants/[id]/channels route before persisting
 * a BYOB Discord channel. Prevents storing tokens that Discord will reject the
 * moment the runtime boots — catches the "revoked/typo" case up front so the
 * operator sees a clear error in the UI instead of a silent deactivation later.
 *
 * Pure helper:
 *   - no DB access, no logging, no env reads
 *   - returns a structured result — callers decide how to surface errors
 *   - timeouts + network errors map to `network` (treated as transient → block)
 */

const DISCORD_API = 'https://discord.com/api/v10'
const DEFAULT_TIMEOUT_MS = 5_000

export type DiscordTokenValidationReason =
  | 'invalid' // 401 — token revoked / malformed
  | 'forbidden' // 403 — token valid but lacks permissions
  | 'rate_limited' // 429 — retry later
  | 'server_error' // 5xx — Discord side
  | 'network' // fetch failed / timed out

export interface DiscordTokenValidationResult {
  ok: boolean
  reason?: DiscordTokenValidationReason
  status?: number
  bot?: { id: string; username: string }
}

export async function validateDiscordBotToken(
  token: string,
  options: { timeoutMs?: number } = {},
): Promise<DiscordTokenValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const resp = await fetch(`${DISCORD_API}/users/@me`, {
      method: 'GET',
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'Lucid (https://lucid.foundation, 1.0)',
      },
      signal: controller.signal,
    })

    if (resp.status === 200) {
      const body = (await resp.json().catch(() => null)) as
        | { id?: string; username?: string }
        | null
      if (!body?.id) {
        return { ok: false, reason: 'invalid', status: 200 }
      }
      return {
        ok: true,
        status: 200,
        bot: { id: body.id, username: body.username ?? '' },
      }
    }

    if (resp.status === 401) return { ok: false, reason: 'invalid', status: 401 }
    if (resp.status === 403) return { ok: false, reason: 'forbidden', status: 403 }
    if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
    if (resp.status >= 500) return { ok: false, reason: 'server_error', status: resp.status }

    // Any other non-2xx: treat as invalid (unexpected).
    return { ok: false, reason: 'invalid', status: resp.status }
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
