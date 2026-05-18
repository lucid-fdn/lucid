/**
 * In-chat command handlers for the hosted Telegram bot.
 *
 * Each handler returns a `TelegramReply` describing what to send back to
 * Telegram. Network I/O (calling the Telegram API) stays in the webhook so
 * tests can stub the DB layer and assert on the structured reply.
 *
 * Spec: docs/superpowers/specs/2026-04-07-telegram-multi-agent-deep-link-design.md §3.3
 */

import {
  getAssistant,
  getPrimaryTelegramChannelForChat,
  getTelegramVoiceSettingsForChat,
  listTelegramChannelsForChat,
  listTelegramWorkspacesForChat,
  persistTelegramChatScope,
  setPrimaryTelegramChannel,
  switchTelegramChatWorkspace,
  unbindTelegramChannel,
  updateTelegramVoiceSettingsForChat,
} from '@/lib/db'
import { personaFromBinding } from './entity-presence'
import { escapeTelegramHtml, telegramBold, type TelegramParseMode } from './format'
import {
  agentsKeyboard,
  buildVoiceSettingsText,
  launcherKeyboard,
  onboardingKeyboard,
  type ChatBinding,
  type TelegramInlineKeyboard,
  type TelegramReplyKeyboard,
  voiceSettingsKeyboard,
  workspaceKeyboard,
} from './inline-keyboards'
import { getTelegramVoiceStylePreset, type TelegramVoiceMode } from './voice-settings'
import { resolveAgentTarget } from '@/lib/channels/agent-target-resolver'
import {
  buildAgentOpsChannelCommandUsage,
  parseChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { runChannelNativeAction } from '@/lib/db/channel-native-actions'

export interface TelegramReply {
  text: string
  reply_markup?: TelegramInlineKeyboard | TelegramReplyKeyboard
  parse_mode?: TelegramParseMode
  link_preview_options?: {
    is_disabled?: boolean
    prefer_large_media?: boolean
    show_above_text?: boolean
  }
}

const ONBOARDING_TEXT =
  `${telegramBold("You're at the edge of Lucid.")}\n\n` +
  'Open a shared agent or connect one from Studio to let a living agent step into this chat.'

const HELP_TEXT =
  `${telegramBold('How this chat works')}\n\n` +
  'Talk normally. The active Lucid entity will answer.\n\n' +
  `${telegramBold('/agents')}: meet the agents bound to this chat\n` +
  `${telegramBold('/switch')}: open the agent picker\n` +
  `${telegramBold('/switch <name>')}: bring a different agent forward\n` +
  `${telegramBold('/workspace')}: switch workspace for this chat\n` +
  `${telegramBold('/whoami')}: see who is speaking\n` +
  `${telegramBold('/leave')}: let the current agent step out\n` +
  `${telegramBold('/voice')}: tune voice replies for this room\n` +
  `${telegramBold('/ops <workflow> <target>')}: launch Agent Ops from this chat\n` +
  `${telegramBold('/check <url>')}: check a page with Browser Operator\n` +
  `${telegramBold('/buy <request>')}: prepare a governed purchase with approval gates\n` +
  `${telegramBold('/research <url>')}: research a website with Browser Operator\n` +
  `${telegramBold('/plan <goal>')}: start plan-only Agent Ops\n` +
  `${telegramBold('/search <query>')}: search Mission Control\n` +
  `${telegramBold('/remember <fact>')}: save a Knowledge claim\n` +
  `${telegramBold('/claims <query>')}: list active Knowledge claims\n` +
  `${telegramBold('/forget <id>')}: archive a Knowledge claim\n` +
  `${telegramBold('/extract <what> from <url>')}: extract structured web data\n` +
  `${telegramBold('/monitor <url>')}: monitor a page\n` +
  `${telegramBold('/help')}: this guide`

function buildEntitiesText(bindings: ChatBinding[]): string {
  const active = bindings.find((binding) => binding.is_primary)
  if (!active) {
    return `${telegramBold('Agents in this chat')}\n\nNo one is active right now.\nChoose who should step in.`
  }
  const persona = personaFromBinding(active)
  return (
    `${telegramBold('Agents in this chat')}\n\n` +
    `${telegramBold('Active now')}: ${escapeTelegramHtml(persona.displayName)}\n` +
    `${escapeTelegramHtml(persona.roleTitle)}\n` +
    `${escapeTelegramHtml(persona.essence)}`
  )
}

/** /agents - list bindings as an inline keyboard. */
export async function handleAgentsCommand(chatId: string): Promise<TelegramReply> {
  const bindings = await listTelegramChannelsForChat(chatId)
  if (bindings.length === 0) {
    return { text: ONBOARDING_TEXT, reply_markup: onboardingKeyboard(), parse_mode: 'HTML' }
  }

  return {
    text: buildEntitiesText(bindings),
    reply_markup: agentsKeyboard(bindings),
    parse_mode: 'HTML',
  }
}

/** /switch <name> - text-based switch by case-insensitive name. */
export async function handleSwitchCommand(chatId: string, rawArg: string): Promise<TelegramReply> {
  const bindings = await listTelegramChannelsForChat(chatId)
  if (bindings.length === 0) {
    return { text: ONBOARDING_TEXT, reply_markup: onboardingKeyboard(), parse_mode: 'HTML' }
  }

  const name = rawArg.trim().toLowerCase()
  if (!name) {
    return {
      text: `${telegramBold('Choose the next active agent.')}`,
      reply_markup: agentsKeyboard(bindings),
      parse_mode: 'HTML',
    }
  }

  const resolution = resolveAgentTarget({
    bindings,
    explicitTarget: name,
  })
  if (resolution.kind === 'unresolved') {
    return {
      text: `No Lucid entity matching "${escapeTelegramHtml(rawArg)}" is with this chat yet.\nTry /agents.`,
      parse_mode: 'HTML',
    }
  }

  if (resolution.kind === 'ambiguous') {
    return {
      text: `More than one agent answers to "${escapeTelegramHtml(rawArg)}".\nChoose who should step in:`,
      reply_markup: agentsKeyboard(resolution.bindings),
      parse_mode: 'HTML',
    }
  }

  const target = resolution.binding
  const result = await setPrimaryTelegramChannel(chatId, target.assistant_id)
  if (!result.ok) {
    return {
      text: `${escapeTelegramHtml(target.assistant_name)} could not step in right now.\nTry again.`,
      parse_mode: 'HTML',
    }
  }
  if (target.org_id) {
    await persistTelegramChatScope(chatId, target.org_id)
  }

  return {
    text: `${telegramBold('Active now')}: ${escapeTelegramHtml(target.assistant_name)}`,
    reply_markup: launcherKeyboard(),
    parse_mode: 'HTML',
  }
}

/** /workspace - list or switch workspaces linked to this chat. */
export async function handleWorkspaceCommand(chatId: string, rawArg = ''): Promise<TelegramReply> {
  const workspaces = await listTelegramWorkspacesForChat(chatId)
  if (workspaces.length === 0) {
    return { text: ONBOARDING_TEXT, reply_markup: onboardingKeyboard(), parse_mode: 'HTML' }
  }

  const current = workspaces.find((workspace) => workspace.is_current) ?? workspaces[0]
  const name = rawArg.trim().toLowerCase()
  if (!name) {
    return {
      text:
        `${telegramBold('Current workspace')}: ${escapeTelegramHtml(current.org_name)}\n` +
        'Choose a workspace for this Telegram chat.',
      reply_markup: workspaceKeyboard(workspaces),
      parse_mode: 'HTML',
    }
  }

  const matches = workspaces.filter((workspace) => workspace.org_name.toLowerCase().includes(name))
  if (matches.length === 0) {
    return {
      text: `No workspace matching "${escapeTelegramHtml(rawArg)}" is linked to this chat yet.`,
      parse_mode: 'HTML',
    }
  }
  if (matches.length > 1) {
    return {
      text: `More than one workspace matches "${escapeTelegramHtml(rawArg)}".\nChoose one:`,
      reply_markup: workspaceKeyboard(matches),
      parse_mode: 'HTML',
    }
  }

  const target = matches[0]
  const result = await switchTelegramChatWorkspace(chatId, target.org_id)
  if (!result.ok) {
    return {
      text: `${escapeTelegramHtml(target.org_name)} could not take over this chat right now.\nTry again.`,
      parse_mode: 'HTML',
    }
  }

  const assistant = result.assistantId ? await getAssistant(result.assistantId) : null
  return {
    text: assistant
      ? (
        `${telegramBold('Current workspace')}: ${escapeTelegramHtml(target.org_name)}\n` +
        `${telegramBold('Active now')}: ${escapeTelegramHtml(assistant.telegram_display_name ?? assistant.name)}`
      )
      : `${telegramBold('Current workspace')}: ${escapeTelegramHtml(target.org_name)}`,
    reply_markup: launcherKeyboard(),
    parse_mode: 'HTML',
  }
}

/** /whoami - show the active agent. */
export async function handleWhoamiCommand(chatId: string): Promise<TelegramReply> {
  const primary = await getPrimaryTelegramChannelForChat(chatId)
  if (!primary) {
    const bindings = await listTelegramChannelsForChat(chatId)
    if (bindings.length === 0) {
      return { text: ONBOARDING_TEXT, reply_markup: onboardingKeyboard(), parse_mode: 'HTML' }
    }
    return {
      text: 'No one is active right now.\nChoose who should step in.',
      reply_markup: agentsKeyboard(bindings),
      parse_mode: 'HTML',
    }
  }

  const bindings = await listTelegramChannelsForChat(chatId)
  const active = bindings.find((b) => b.assistant_id === primary.assistant_id)
  if (!active) {
    return {
      text: `${telegramBold('Active now')}: one of your Lucid agents.`,
      parse_mode: 'HTML',
    }
  }
  const persona = personaFromBinding(active)
  return {
    text:
      `${telegramBold('Active now')}: ${escapeTelegramHtml(persona.displayName)}\n` +
      `${escapeTelegramHtml(persona.roleTitle)}\n` +
      `${escapeTelegramHtml(persona.essence)}`,
    reply_markup: launcherKeyboard(),
    parse_mode: 'HTML',
  }
}

/** /leave - unbind the currently active agent. */
export async function handleLeaveCommand(chatId: string): Promise<TelegramReply> {
  const primary = await getPrimaryTelegramChannelForChat(chatId)
  if (!primary) {
    return { text: 'No agent is active right now.\nRun /agents to bring one in.', parse_mode: 'HTML' }
  }

  const bindings = await listTelegramChannelsForChat(chatId)
  const active = bindings.find((binding) => binding.assistant_id === primary.assistant_id)
  if (active?.org_id) {
    await persistTelegramChatScope(chatId, active.org_id)
  }
  await unbindTelegramChannel(chatId, primary.assistant_id)
  return {
    text: active
      ? `${escapeTelegramHtml(active.assistant_name)} stepped out of this room.`
      : 'That agent stepped out of this room.',
    reply_markup: launcherKeyboard(),
    parse_mode: 'HTML',
  }
}

export async function handleVoiceCommand(chatId: string): Promise<TelegramReply> {
  const settings = await getTelegramVoiceSettingsForChat(chatId)
  if (!settings) {
    const bindings = await listTelegramChannelsForChat(chatId)
    if (bindings.length === 0) {
      return { text: ONBOARDING_TEXT, reply_markup: onboardingKeyboard(), parse_mode: 'HTML' }
    }
    return {
      text: 'No one is active right now.\nChoose who should step in first.',
      reply_markup: agentsKeyboard(bindings),
      parse_mode: 'HTML',
    }
  }

  return {
    text: buildVoiceSettingsText(settings),
    reply_markup: voiceSettingsKeyboard(settings),
  }
}

export async function handleVoiceModeUpdate(chatId: string, mode: TelegramVoiceMode): Promise<TelegramReply | null> {
  const settings = await updateTelegramVoiceSettingsForChat({ chatId, mode })
  if (!settings) return null
  return {
    text: buildVoiceSettingsText(settings),
    reply_markup: voiceSettingsKeyboard(settings),
  }
}

export async function handleVoicePickUpdate(chatId: string, voiceId: string): Promise<TelegramReply | null> {
  const settings = await updateTelegramVoiceSettingsForChat({ chatId, voiceId })
  if (!settings) return null
  return {
    text: buildVoiceSettingsText(settings),
    reply_markup: voiceSettingsKeyboard(settings),
  }
}

export async function handleVoicePresetUpdate(chatId: string, presetId: string): Promise<TelegramReply | null> {
  const preset = getTelegramVoiceStylePreset(presetId)
  if (!preset) return null
  const settings = await updateTelegramVoiceSettingsForChat({ chatId, instructions: preset.instructions || null })
  if (!settings) return null
  return {
    text: buildVoiceSettingsText(settings),
    reply_markup: voiceSettingsKeyboard(settings),
  }
}

export async function handleAgentOpsCommand(
  chatId: string,
  rawArg: string,
  externalUserId?: string | null,
): Promise<TelegramReply> {
  const command = parseChannelNativeCommand(rawArg)
  if (!command) {
    return { text: buildAgentOpsChannelCommandUsage('Telegram') }
  }

  const primary = await getPrimaryTelegramChannelForChat(chatId)
  const bindings = await listTelegramChannelsForChat(chatId)
  const active = primary
    ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
    : bindings.find((binding) => binding.is_primary)

  if (!active) {
    if (bindings.length === 0) {
      return { text: ONBOARDING_TEXT, reply_markup: onboardingKeyboard(), parse_mode: 'HTML' }
    }
    return {
      text: 'No one is active right now.\nChoose who should launch Agent Ops.',
      reply_markup: agentsKeyboard(bindings),
      parse_mode: 'HTML',
    }
  }

  return {
    text: await runChannelNativeAction({
      channelType: 'telegram',
      channelLabel: 'Telegram',
      surfaceId: chatId,
      externalUserId,
      rawCommandArg: rawArg,
      binding: active,
    }),
  }
}

/** /help - static command list. */
export function handleHelpCommand(): TelegramReply {
  return {
    text: HELP_TEXT,
    reply_markup: launcherKeyboard(),
    parse_mode: 'HTML',
  }
}

/** Convenience: pure text replies used by the webhook for non-command branches. */
export const TEXTS = {
  onboarding: ONBOARDING_TEXT,
  noPrimaryHasBindings: 'No one is active right now.\nChoose who should step in.',
  shareDisabled: 'This agent is private. Ask its owner for an invite link.',
  agentNotFound: 'That agent does not exist or has been deleted.',
  bindFailed: 'Could not connect to that agent right now.\nPlease try again.',
  groupChatNotSupported: 'Multi-agent commands are only available in private chats with the bot.',
  deepLinkBound: (name: string) => `${telegramBold('Active now')}: ${escapeTelegramHtml(name)}`,
} as const

/** Re-exported so route.ts can build keyboards for callback_query updates. */
export type { ChatBinding }
