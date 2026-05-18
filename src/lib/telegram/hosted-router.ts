/**
 * Pure routing helpers for the hosted Telegram webhook.
 *
 * No I/O — these functions are easy to unit test and have no DB dependency.
 * The webhook handler composes them with `@/lib/db` calls.
 *
 * Spec: docs/superpowers/specs/2026-04-07-telegram-multi-agent-deep-link-design.md
 */

import { getPrimaryTelegramChannelForChat, listTelegramChannelsForChat } from '@/lib/db'
import {
  resolveActiveAgentBinding,
  type ActiveAgentResolution as SharedActiveAgentResolution,
} from '@/lib/channels/active-agent-resolution'

export type StartPayload =
  | { kind: 'none' }
  | { kind: 'connect_token'; token: string }
  | { kind: 'agent_share'; assistantId: string }

export type ActiveAgentResolution = SharedActiveAgentResolution<{
  id: string
  assistant_id: string
  assistant_name: string
  is_primary: boolean
}>

const START_REGEX = /^\/start(?:@\w+)?(?:\s+(.+))?$/
const AGENT_SHARE_PREFIX = 'agent_'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Parse a `/start` message text into a discriminated payload.
 *
 * Forms accepted:
 *   /start                       → { kind: 'none' }
 *   /start <opaque-token>        → { kind: 'connect_token', token }
 *   /start agent_<uuid>          → { kind: 'agent_share', assistantId }
 *   /start@LucidBot ...          → same as above (group-chat suffix tolerated)
 *
 * Returns null if the input is not a /start command at all.
 */
export function parseStartPayload(text: string): StartPayload | null {
  const match = text.match(START_REGEX)
  if (!match) return null

  const raw = match[1]?.trim()
  if (!raw) return { kind: 'none' }

  if (raw.startsWith(AGENT_SHARE_PREFIX)) {
    const assistantId = raw.slice(AGENT_SHARE_PREFIX.length)
    if (UUID_REGEX.test(assistantId)) {
      return { kind: 'agent_share', assistantId }
    }
    // Malformed agent share payload — fall through to connect_token so we
    // don't accidentally swallow legitimate opaque tokens that happen to start
    // with the literal string "agent_". The DB lookup will reject it cleanly.
  }

  return { kind: 'connect_token', token: raw }
}

/**
 * Resolve which agent should receive a plain inbound message for a given chat.
 *
 * Three discriminated outcomes:
 *  - primary: route the message to this channel (existing inbound flow).
 *  - has_bindings_no_primary: the chat has known agents but none is primary
 *    (e.g. owner ran /leave). Caller should reply with a /agents prompt and
 *    drop the message instead of guessing.
 *  - no_bindings: never connected. Caller should reply with onboarding text.
 */
export async function resolveActiveAgent(chatId: string): Promise<ActiveAgentResolution> {
  const primary = await getPrimaryTelegramChannelForChat(chatId)
  if (primary) {
    return { kind: 'primary', channel: primary }
  }
  const bindings = await listTelegramChannelsForChat(chatId)
  return resolveActiveAgentBinding(primary, bindings)
}
