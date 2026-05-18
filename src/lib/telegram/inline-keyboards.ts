/**
 * Telegram inline keyboard builders + callback payload schema.
 * Spec: docs/superpowers/specs/2026-04-07-telegram-multi-agent-deep-link-design.md §3.3
 */

import { z } from 'zod'
import {
  describeTelegramVoiceMode,
  getTelegramVoiceOption,
  type TelegramVoiceMode,
} from './voice-settings'

export interface TelegramInlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
  style?: 'default' | 'primary' | 'success' | 'danger'
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export interface TelegramReplyKeyboardButton {
  text: string
}

export interface TelegramReplyKeyboard {
  keyboard: TelegramReplyKeyboardButton[][]
  resize_keyboard?: boolean
  is_persistent?: boolean
  input_field_placeholder?: string
}

export interface ChatBinding {
  id: string
  assistant_id: string
  org_id?: string
  assistant_name: string
  assistant_description?: string | null
  assistant_starter_prompts?: string[] | null
  assistant_role_title?: string | null
  assistant_essence?: string | null
  is_primary: boolean
}

export interface WorkspaceBinding {
  org_id: string
  org_name: string
  agent_count: number
  is_current: boolean
}

export interface TelegramVoiceSettingsSummary {
  mode: TelegramVoiceMode
  voiceId: string | null
}

/**
 * Max rows on the /agents keyboard, including the (optional) nav row.
 * Telegram allows ~100 buttons but anything past ~10 is a usability foot-gun
 * on mobile. When the chat has more bindings than PAGE_SIZE, we paginate.
 */
export const MAX_KEYBOARD_ROWS = 10

/**
 * Per-page agent count when pagination is active. 8 agents + 1 nav row =
 * 9 rows total (still under MAX_KEYBOARD_ROWS). When the total fits in
 * MAX_KEYBOARD_ROWS without needing a nav row, we render all of them.
 */
export const PAGE_SIZE = 8

/**
 * Build the keyboard rendered by /agents and after a /switch.
 * The active agent is prefixed with a check mark.
 *
 * If `bindings.length > MAX_KEYBOARD_ROWS`, paginate into PAGE_SIZE chunks
 * and append a nav row (`⬅ Prev | i/n | Next ➡`). The page is clamped to
 * `[0, totalPages-1]` so stale callback_data from a previous keyboard can
 * never crash the render.
 */
export function agentsKeyboard(
  bindings: ChatBinding[],
  opts: { page?: number } = {},
): TelegramInlineKeyboard {
  // Fast path: no pagination needed.
  if (bindings.length <= MAX_KEYBOARD_ROWS) {
    return {
      inline_keyboard: bindings.map((b) => [
        {
          text: formatAgentButtonLabel(b),
          callback_data: `switch:${b.assistant_id}`,
          ...(b.is_primary ? { style: 'success' as const } : {}),
        },
      ]),
    }
  }

  const totalPages = Math.ceil(bindings.length / PAGE_SIZE)
  const page = clamp(opts.page ?? 0, 0, totalPages - 1)
  const start = page * PAGE_SIZE
  const slice = bindings.slice(start, start + PAGE_SIZE)

  const rows: TelegramInlineKeyboardButton[][] = slice.map((b) => [
    {
      text: formatAgentButtonLabel(b),
      callback_data: `switch:${b.assistant_id}`,
      ...(b.is_primary ? { style: 'success' as const } : {}),
    },
  ])

  const navRow: TelegramInlineKeyboardButton[] = []
  if (page > 0) {
    navRow.push({ text: '⬅ Prev', callback_data: `page:${page - 1}` })
  }
  // Page indicator is a no-op button that just tells Telegram it was tapped
  // (we answerCallbackQuery with no text on `page:` taps that match the
  // current page, so a stale tap on the indicator is silently swallowed).
  navRow.push({
    text: `${page + 1}/${totalPages}`,
    callback_data: `page:${page}`,
  })
  if (page < totalPages - 1) {
    navRow.push({ text: 'Next ➡', callback_data: `page:${page + 1}` })
  }
  rows.push(navRow)

  return { inline_keyboard: rows }
}

function formatAgentButtonLabel(binding: ChatBinding): string {
  const title = binding.assistant_role_title?.trim()
  const base = title ? `${binding.assistant_name} • ${title}` : binding.assistant_name
  const truncated = base.length > 48 ? `${base.slice(0, 45).trimEnd()}…` : base
  return binding.is_primary ? `✅ ${truncated}` : truncated
}

export function onboardingKeyboard(): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: 'Talk Here', callback_data: 'panel:start', style: 'primary' }],
      [{ text: 'Meet Other Agents', callback_data: 'panel:agents' }],
    ],
  }
}

export function replyControlsKeyboard(): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: 'Switch Agent', callback_data: 'panel:switch', style: 'primary' },
        { text: 'Meet Others', callback_data: 'panel:agents' },
        { text: 'Help', callback_data: 'panel:help' },
      ],
    ],
  }
}

export const TELEGRAM_LAUNCHER_SWITCH_TEXT = '/switch'
export const TELEGRAM_LAUNCHER_AGENTS_TEXT = '/agents'
export const TELEGRAM_LAUNCHER_WORKSPACE_TEXT = '/workspace'
export const TELEGRAM_LAUNCHER_VOICE_TEXT = '/voice'
export const TELEGRAM_LAUNCHER_WHOAMI_TEXT = '/whoami'

export function launcherKeyboard(): TelegramReplyKeyboard {
  return {
    keyboard: [
      [{ text: TELEGRAM_LAUNCHER_SWITCH_TEXT }, { text: TELEGRAM_LAUNCHER_AGENTS_TEXT }],
      [{ text: TELEGRAM_LAUNCHER_WORKSPACE_TEXT }, { text: TELEGRAM_LAUNCHER_VOICE_TEXT }],
      [{ text: TELEGRAM_LAUNCHER_WHOAMI_TEXT }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Message the active Lucid agent',
  }
}

export function scopeSwitchKeyboard(input: { assistantId?: string; connectToken?: string }): TelegramInlineKeyboard {
  const callbackData = input.assistantId
    ? `scopea:${input.assistantId}`
    : input.connectToken
      ? `scopet:${input.connectToken}`
      : null
  if (!callbackData) {
    throw new Error('scopeSwitchKeyboard requires assistantId or connectToken')
  }

  return {
    inline_keyboard: [[
      { text: 'Switch Workspace', callback_data: callbackData, style: 'primary' },
      { text: 'Keep Current', callback_data: 'scopecancel', style: 'success' },
    ]],
  }
}

export function workspaceKeyboard(workspaces: WorkspaceBinding[]): TelegramInlineKeyboard {
  return {
    inline_keyboard: workspaces.map((workspace) => [
      {
        text: workspace.is_current
          ? `✅ ${workspace.org_name} (${workspace.agent_count})`
          : `${workspace.org_name} (${workspace.agent_count})`,
        callback_data: `workspace:${workspace.org_id}`,
        ...(workspace.is_current ? { style: 'success' as const } : {}),
      },
    ]),
  }
}

export function voiceSettingsKeyboard(settings: TelegramVoiceSettingsSummary): TelegramInlineKeyboard {
  const currentVoice = getTelegramVoiceOption(settings.voiceId)
  return {
    inline_keyboard: [
      [
        {
          text: settings.mode === 'off' ? '✅ Off' : 'Off',
          callback_data: 'voicemode:off',
          ...(settings.mode === 'off' ? { style: 'success' as const } : {}),
        },
        {
          text: settings.mode === 'auto' ? '✅ Auto' : 'Auto',
          callback_data: 'voicemode:auto',
          ...(settings.mode === 'auto' ? { style: 'success' as const } : {}),
        },
        {
          text: settings.mode === 'always' ? '✅ Always' : 'Always',
          callback_data: 'voicemode:always',
          ...(settings.mode === 'always' ? { style: 'success' as const } : {}),
        },
      ],
      [
        {
          text: currentVoice?.id === 'coral' ? '✅ Warm' : 'Warm',
          callback_data: 'voicepick:coral',
          ...(currentVoice?.id === 'coral' ? { style: 'success' as const } : {}),
        },
        {
          text: currentVoice?.id === 'onyx' ? '✅ Deep' : 'Deep',
          callback_data: 'voicepick:onyx',
          ...(currentVoice?.id === 'onyx' ? { style: 'success' as const } : {}),
        },
        {
          text: currentVoice?.id === 'echo' ? '✅ Clear' : 'Clear',
          callback_data: 'voicepick:echo',
          ...(currentVoice?.id === 'echo' ? { style: 'success' as const } : {}),
        },
      ],
      [
        {
          text: currentVoice?.id === 'nova' ? '✅ Bright' : 'Bright',
          callback_data: 'voicepick:nova',
          ...(currentVoice?.id === 'nova' ? { style: 'success' as const } : {}),
        },
        {
          text: currentVoice?.id === 'sage' ? '✅ Calm' : 'Calm',
          callback_data: 'voicepick:sage',
          ...(currentVoice?.id === 'sage' ? { style: 'success' as const } : {}),
        },
        {
          text: currentVoice?.id === 'shimmer' ? '✅ Soft' : 'Soft',
          callback_data: 'voicepick:shimmer',
          ...(currentVoice?.id === 'shimmer' ? { style: 'success' as const } : {}),
        },
      ],
      [{ text: 'Open Advanced Settings', callback_data: 'voicepanel:miniapp', style: 'primary' }],
    ],
  }
}

export function buildVoiceSettingsText(input: {
  assistantName: string
  mode: TelegramVoiceMode
  voiceId: string | null
}): string {
  const voice = getTelegramVoiceOption(input.voiceId)
  return [
    `Voice settings for ${input.assistantName}`,
    '',
    `Replies: ${describeTelegramVoiceMode(input.mode)}`,
    `Voice: ${voice ? `${voice.label} (${voice.description})` : 'Default'}`,
    '',
    'Use the buttons below for quick changes, or open the Mini App for advanced tuning.',
  ].join('\n')
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  if (n < lo) return lo
  if (n > hi) return hi
  return Math.floor(n)
}

/**
 * Telegram hard-caps inline button callback_data at 64 bytes (UTF-8).
 * Payloads longer than this are silently dropped by Telegram's client, so we
 * enforce the cap on both the emit side (via assertCallbackDataFits) and the
 * parse side (reject overlong inputs before regex matching — defense against
 * forged payloads that would otherwise never have reached our keyboards).
 * Upstream: extensions/telegram/src/approval-callback-data.ts
 */
export const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64

/** Returns true if `value` fits in Telegram's 64-byte callback_data limit. */
export function fitsTelegramCallbackData(value: string): boolean {
  return Buffer.byteLength(value, 'utf8') <= TELEGRAM_CALLBACK_DATA_MAX_BYTES
}

/**
 * Zod schemas for callback_data — validated on every callback_query.
 * Two variants: `switch:<uuid>` (set primary) and `page:<int>` (paginate).
 */
const switchSchema = z
  .string()
  .regex(/^switch:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const pageSchema = z.string().regex(/^page:\d{1,2}$/)
const panelSchema = z.enum(['panel:agents', 'panel:help', 'panel:switch', 'panel:start'])
const scopeAssistantSchema = z
  .string()
  .regex(/^scopea:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const scopeTokenSchema = z
  .string()
  .regex(/^scopet:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const scopeCancelSchema = z.literal('scopecancel')
const workspaceSchema = z
  .string()
  .regex(/^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const voiceModeSchema = z.enum(['voicemode:off', 'voicemode:auto', 'voicemode:always'])
const voicePickSchema = z
  .string()
  .regex(/^voicepick:(coral|onyx|echo|nova|sage|shimmer)$/)
const voicePanelSchema = z.enum(['voicepanel:miniapp'])

/** Back-compat alias — some tests import the old name. */
export const callbackDataSchema = switchSchema

export type ParsedCallback =
  | { kind: 'switch'; assistantId: string }
  | { kind: 'page'; page: number }
  | { kind: 'panel'; panel: 'agents' | 'help' | 'switch' | 'start' }
  | { kind: 'scope'; mode: 'assistant'; assistantId: string }
  | { kind: 'scope'; mode: 'token'; token: string }
  | { kind: 'scope'; mode: 'cancel' }
  | { kind: 'workspace'; orgId: string }
  | { kind: 'voice'; action: 'mode'; mode: TelegramVoiceMode }
  | { kind: 'voice'; action: 'pick'; voiceId: string }
  | { kind: 'voice'; action: 'miniapp' }

export function parseCallbackData(data: string): ParsedCallback | null {
  // Reject anything over the Telegram 64-byte cap before regex matching.
  // Valid payloads we emit are 43 bytes (`switch:<uuid>`) or 6-7 bytes
  // (`page:<N>`), so any longer input is a forged or stale payload.
  if (!fitsTelegramCallbackData(data)) return null
  if (switchSchema.safeParse(data).success) {
    return { kind: 'switch', assistantId: data.slice('switch:'.length) }
  }
  if (pageSchema.safeParse(data).success) {
    const page = Number.parseInt(data.slice('page:'.length), 10)
    if (Number.isFinite(page) && page >= 0 && page <= 99) {
      return { kind: 'page', page }
    }
  }
  const panel = panelSchema.safeParse(data)
  if (panel.success) {
    return { kind: 'panel', panel: data.slice('panel:'.length) as 'agents' | 'help' | 'switch' | 'start' }
  }
  if (scopeAssistantSchema.safeParse(data).success) {
    return { kind: 'scope', mode: 'assistant', assistantId: data.slice('scopea:'.length) }
  }
  if (scopeTokenSchema.safeParse(data).success) {
    return { kind: 'scope', mode: 'token', token: data.slice('scopet:'.length) }
  }
  if (scopeCancelSchema.safeParse(data).success) {
    return { kind: 'scope', mode: 'cancel' }
  }
  if (workspaceSchema.safeParse(data).success) {
    return { kind: 'workspace', orgId: data.slice('workspace:'.length) }
  }
  if (voiceModeSchema.safeParse(data).success) {
    return { kind: 'voice', action: 'mode', mode: data.slice('voicemode:'.length) as TelegramVoiceMode }
  }
  if (voicePickSchema.safeParse(data).success) {
    return { kind: 'voice', action: 'pick', voiceId: data.slice('voicepick:'.length) }
  }
  if (voicePanelSchema.safeParse(data).success) {
    return { kind: 'voice', action: 'miniapp' }
  }
  return null
}
