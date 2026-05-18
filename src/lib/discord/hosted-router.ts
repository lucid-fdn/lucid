/**
 * Pure routing helpers for the hosted Discord interactions webhook.
 *
 * Two kinds of helpers:
 *
 *   1. `parseInteractionPayload` — turns the Discord interaction POST body
 *      into a discriminated union. No I/O. Used by the interactions route
 *      immediately after Ed25519 verification.
 *
 *   2. `resolveActiveAgent` — async DB helper that returns which agent
 *      should receive a plain @mention in a guild. Mirrors the Telegram
 *      `resolveActiveAgent` pattern scoped to `channel_type='discord'`.
 *
 * Why both live in the same file: the interactions webhook composes them
 * with zero ceremony — parse → verify → dispatch → resolve. Keeping them
 * together makes the control flow obvious when reading the route.
 *
 * Spec: docs/plans/2026-04-08-discord-byob-and-shared-bot.md §2f
 */

import { getPrimaryDiscordChannelForGuild, listDiscordChannelsForGuild } from '@/lib/db'
import {
  resolveActiveAgentBinding,
  type ActiveAgentResolution as SharedActiveAgentResolution,
} from '@/lib/channels/active-agent-resolution'

/**
 * Discord interaction types (subset we handle). Full list:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type
 */
export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const

/**
 * Interaction response types we emit.
 *   PONG                                  — answer to PING
 *   CHANNEL_MESSAGE_WITH_SOURCE           — immediate reply (<3s window)
 *   DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE  — "thinking..." placeholder, follow up via webhook
 *   UPDATE_MESSAGE                        — edit component message in place
 *   DEFERRED_UPDATE_MESSAGE               — ACK component click without visible change
 *   MODAL                                 — present a modal form
 *   AUTOCOMPLETE_RESULT                   — return autocomplete choices
 */
export const INTERACTION_RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const

/**
 * Discord message flags we care about. `EPHEMERAL = 64` makes a reply
 * visible only to the invoking user — the right default for admin UX
 * (switch/whoami/leave confirmations shouldn't spam the channel).
 */
export const MESSAGE_FLAGS = {
  EPHEMERAL: 1 << 6,
} as const

export type ActiveAgentResolution = SharedActiveAgentResolution<{
  id: string
  assistant_id: string
  assistant_name: string
  is_primary: boolean
}>

export type ParsedInteraction =
  | { kind: 'ping' }
  | {
      kind: 'slash_command'
      interactionId: string
      interactionToken: string
      applicationId: string | null
      guildId: string | null
      channelId: string | null
      userId: string
      memberPermissions: string | null
      commandName: string
      options: ReadonlyArray<{ name: string; type: number; value?: unknown }>
    }
  | {
      kind: 'autocomplete'
      interactionId: string
      interactionToken: string
      applicationId: string | null
      guildId: string | null
      userId: string
      commandName: string
      focusedOption: { name: string; value: string } | null
    }
  | {
      kind: 'component'
      interactionId: string
      interactionToken: string
      applicationId: string | null
      guildId: string | null
      channelId: string | null
      userId: string
      memberPermissions: string | null
      customId: string
      componentType: number
      values: ReadonlyArray<string>
    }
  | {
      kind: 'modal_submit'
      interactionId: string
      interactionToken: string
      applicationId: string | null
      guildId: string | null
      userId: string
      memberPermissions: string | null
      customId: string
      components: ReadonlyArray<{ customId: string; value: string }>
    }
  | { kind: 'unknown'; reason: string }

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null
}

/**
 * Parse the raw decoded JSON of a Discord interactions POST body into a
 * discriminated union. Tolerates missing fields gracefully — returns
 * `{ kind: 'unknown', reason }` rather than throwing, so the webhook
 * can always respond with a well-formed PONG / error and never crash.
 *
 * The `memberPermissions` bitfield is returned as-is (string). Owner-only
 * commands (/leave) check ADMINISTRATOR or MANAGE_GUILD bits against it.
 */
export function parseInteractionPayload(body: unknown): ParsedInteraction {
  const obj = asObject(body)
  if (!obj) return { kind: 'unknown', reason: 'body_not_object' }

  const type = obj.type
  if (typeof type !== 'number') return { kind: 'unknown', reason: 'missing_type' }

  if (type === INTERACTION_TYPE.PING) return { kind: 'ping' }

  const interactionId = asString(obj.id)
  const interactionToken = asString(obj.token)
  const applicationId = asString(obj.application_id)
  if (!interactionId || !interactionToken) {
    return { kind: 'unknown', reason: 'missing_id_or_token' }
  }

  const guildId = asString(obj.guild_id)
  const channelId = asString(obj.channel_id)

  // Discord sends `member` (in guilds) or `user` (in DMs). We prefer member.user.id.
  const member = asObject(obj.member)
  const user = asObject(member?.user) ?? asObject(obj.user)
  const userId = asString(user?.id)
  if (!userId) return { kind: 'unknown', reason: 'missing_user_id' }

  const memberPermissions = asString(member?.permissions)

  if (type === INTERACTION_TYPE.APPLICATION_COMMAND) {
    const data = asObject(obj.data)
    const commandName = asString(data?.name)
    if (!commandName) return { kind: 'unknown', reason: 'missing_command_name' }
    const rawOptions = asArray(data?.options) ?? []
    const options = rawOptions
      .map((o) => asObject(o))
      .filter((o): o is Record<string, unknown> => o !== null)
      .map((o) => ({
        name: asString(o.name) ?? '',
        type: typeof o.type === 'number' ? o.type : 0,
        value: o.value,
      }))
      .filter((o) => o.name.length > 0)
    return {
      kind: 'slash_command',
      interactionId,
      interactionToken,
      applicationId,
      guildId,
      channelId,
      userId,
      memberPermissions,
      commandName,
      options,
    }
  }

  if (type === INTERACTION_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE) {
    const data = asObject(obj.data)
    const commandName = asString(data?.name)
    if (!commandName) return { kind: 'unknown', reason: 'missing_command_name' }
    const rawOptions = asArray(data?.options) ?? []
    const focused = rawOptions
      .map((o) => asObject(o))
      .find((o) => o?.focused === true)
    const focusedOption = focused
      ? { name: asString(focused.name) ?? '', value: asString(focused.value) ?? '' }
      : null
    return {
      kind: 'autocomplete',
      interactionId,
      interactionToken,
      applicationId,
      guildId,
      userId,
      commandName,
      focusedOption,
    }
  }

  if (type === INTERACTION_TYPE.MESSAGE_COMPONENT) {
    const data = asObject(obj.data)
    const customId = asString(data?.custom_id)
    if (!customId) return { kind: 'unknown', reason: 'missing_custom_id' }
    const componentType = typeof data?.component_type === 'number' ? data.component_type : 0
    const rawValues = asArray(data?.values) ?? []
    const values = rawValues
      .map((v) => asString(v))
      .filter((v): v is string => v !== null)
    return {
      kind: 'component',
      interactionId,
      interactionToken,
      applicationId,
      guildId,
      channelId,
      userId,
      memberPermissions,
      customId,
      componentType,
      values,
    }
  }

  if (type === INTERACTION_TYPE.MODAL_SUBMIT) {
    const data = asObject(obj.data)
    const customId = asString(data?.custom_id)
    if (!customId) return { kind: 'unknown', reason: 'missing_custom_id' }
    // Modal components come as action rows → components (TextInput). Flatten.
    const actionRows = asArray(data?.components) ?? []
    const components: Array<{ customId: string; value: string }> = []
    for (const row of actionRows) {
      const rowObj = asObject(row)
      const rowComponents = asArray(rowObj?.components) ?? []
      for (const c of rowComponents) {
        const cObj = asObject(c)
        const cid = asString(cObj?.custom_id)
        const val = asString(cObj?.value) ?? ''
        if (cid) components.push({ customId: cid, value: val })
      }
    }
    return {
      kind: 'modal_submit',
      interactionId,
      interactionToken,
      applicationId,
      guildId,
      userId,
      memberPermissions,
      customId,
      components,
    }
  }

  return { kind: 'unknown', reason: `unsupported_type_${type}` }
}

/**
 * Discord guild permission bits we care about.
 * https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
 */
const PERM_ADMINISTRATOR = 1n << 3n
const PERM_MANAGE_GUILD = 1n << 5n

/**
 * Check whether a member permissions bitfield string grants owner-level
 * control of the guild. Used by `/leave` and any other guild-mutating
 * command so random chat members can't unbind an org's agent.
 *
 * Discord delivers the permissions as a decimal string (because JS
 * numbers can't hold the full 64-bit bitfield). We parse with BigInt.
 */
export function hasGuildAdminPerms(permissions: string | null): boolean {
  if (!permissions) return false
  let bits: bigint
  try {
    bits = BigInt(permissions)
  } catch {
    return false
  }
  return (bits & PERM_ADMINISTRATOR) !== 0n || (bits & PERM_MANAGE_GUILD) !== 0n
}

/**
 * Resolve which agent should receive a plain @mention in a guild.
 *
 * Three discriminated outcomes (same semantics as the Telegram version):
 *  - primary: route the mention to this channel (existing inbound flow)
 *  - has_bindings_no_primary: the guild has known agents but none is primary
 *    (e.g. admin ran /leave on the primary). Caller should reply with a
 *    /agents prompt and drop the mention instead of guessing.
 *  - no_bindings: guild never installed an agent. Caller should reply with
 *    an onboarding hint pointing at the install URL.
 */
export async function resolveActiveAgent(guildId: string): Promise<ActiveAgentResolution> {
  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (primary) {
    return { kind: 'primary', channel: primary }
  }
  const bindings = await listDiscordChannelsForGuild(guildId)
  return resolveActiveAgentBinding(primary, bindings)
}
