/**
 * Centralized Channel Type System
 * 
 * Provides type-safe definitions for all supported communication channels.
 * Used across frontend and API for consistent validation and UI rendering.
 */

import { z } from 'zod'

// ─── Channel Types ───────────────────────────────────────────────────────────

export const CHANNEL_TYPES = [
  'telegram',
  'whatsapp',
  'discord',
  'slack',
  'msteams',
  'imessage',
] as const

export type ChannelType = (typeof CHANNEL_TYPES)[number]

export const DEFERRED_CHANNEL_TYPES = [] as const

export type DeferredChannelType = (typeof DEFERRED_CHANNEL_TYPES)[number]

export const CONNECTION_MODES = ['byob', 'hosted'] as const
export type ConnectionMode = (typeof CONNECTION_MODES)[number]

// ─── Channel Metadata ────────────────────────────────────────────────────────

export interface ChannelMetadata {
  type: ChannelType
  name: string
  icon: string
  emoji: string
  color: string
  supportsHosted: boolean
  requiresWebhook: boolean
  docsUrl: string
  setupComplexity: 'simple' | 'moderate' | 'complex'
}

export interface DeferredChannelMetadata {
  type: DeferredChannelType
  name: string
  iconSlug: string
  emoji: string
  color: string
  availability: 'deferred'
  summary: string
}

export const CHANNEL_METADATA: Record<ChannelType, ChannelMetadata> = {
  telegram: {
    type: 'telegram',
    name: 'Telegram',
    icon: 'MessageCircle',
    emoji: '🤖',
    color: 'bg-blue-500',
    supportsHosted: true,
    requiresWebhook: true,
    docsUrl: 'https://core.telegram.org/bots',
    setupComplexity: 'simple',
  },
  whatsapp: {
    type: 'whatsapp',
    name: 'WhatsApp',
    icon: 'MessageSquare',
    emoji: '📱',
    color: 'bg-green-500',
    supportsHosted: true,
    requiresWebhook: true,
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    setupComplexity: 'complex',
  },
  discord: {
    type: 'discord',
    name: 'Discord',
    icon: 'Hash',
    emoji: '🎮',
    color: 'bg-indigo-500',
    supportsHosted: true,
    requiresWebhook: false, // Uses Gateway WebSocket
    docsUrl: 'https://discord.com/developers/docs',
    setupComplexity: 'moderate',
  },
  slack: {
    type: 'slack',
    name: 'Slack',
    icon: 'Hash',
    emoji: '💬',
    color: 'bg-[#4A154B]',
    supportsHosted: true,
    requiresWebhook: false, // Uses Socket Mode (WebSocket)
    docsUrl: 'https://api.slack.com/docs',
    setupComplexity: 'moderate',
  },
  msteams: {
    type: 'msteams',
    name: 'Microsoft Teams',
    icon: 'MessageSquare',
    emoji: '🟦',
    color: 'bg-[#6264A7]',
    supportsHosted: true,
    requiresWebhook: true,
    docsUrl: 'https://www.lucid.foundation/docs/platform/integrations/teams',
    setupComplexity: 'complex',
  },
  imessage: {
    type: 'imessage',
    name: 'iMessage',
    icon: 'MessageCircle',
    emoji: '💭',
    color: 'bg-zinc-500',
    supportsHosted: true,
    requiresWebhook: true,
    docsUrl: 'https://docs.openclaw.ai/channels/imessage',
    setupComplexity: 'complex',
  },
}
export const DEFERRED_CHANNEL_METADATA: Record<DeferredChannelType, DeferredChannelMetadata> = {}

// ─── Validation Schemas ──────────────────────────────────────────────────────

/**
 * Prefix validation for inbound routing
 * - Max 32 characters
 * - No spaces
 * - Optional/nullable
 */
export const prefixSchema = z
  .string()
  .max(32, 'Prefix must be 32 characters or less')
  .refine((v) => !v.includes(' '), 'Prefix must not contain spaces')
  .optional()
  .nullable()

/**
 * Inbound routing configuration
 * Controls how channels respond to incoming messages
 */
export const inboundRoutingConfigSchema = z
  .object({
    /** Respond to all messages in this channel */
    dedicated_channel: z.boolean().optional(),
    /** Command prefix (e.g., !lucid, /ask) */
    prefix: prefixSchema,
    /** Respond when bot is mentioned */
    respond_on_mention: z.boolean().optional(),
    /** Support threaded conversations */
    thread_support: z.boolean().optional(),
    /** Ignore messages from other bots */
    ignore_bots: z.boolean().optional(),
  })
  .optional()

export type InboundRoutingConfig = z.infer<typeof inboundRoutingConfigSchema>

// ─── Channel Form Data ───────────────────────────────────────────────────────

/**
 * Form data for creating a new channel
 * Combines secrets (encrypted) and config (plaintext)
 */
export interface ChannelFormData {
  // Core
  channelType: ChannelType
  connectionMode: ConnectionMode

  // Secrets (will be encrypted)
  botToken?: string
  appToken?: string // Slack Socket Mode (xapp-...)
  signingSecret?: string
  phoneNumber?: string
  phoneNumberId?: string
  appSecret?: string
  verifyToken?: string
  businessAccountId?: string

  // Teams credentials
  appId?: string // Azure Bot Service app UUID
  appPassword?: string // Azure AD client secret
  tenantId?: string // Azure AD tenant ID or "common"
  cliPath?: string
  dbPath?: string
  service?: string
  region?: string
  accountId?: string

  // Config (plaintext)
  channelId?: string
  inboundRoutingConfig?: InboundRoutingConfig
}

// ─── Channel Display State ───────────────────────────────────────────────────

/**
 * Channel status for UI display
 */
export type ChannelStatus = 'active' | 'inactive' | 'error' | 'pending'

export interface ChannelDisplayInfo {
  id: string
  type: ChannelType
  status: ChannelStatus
  name: string
  description: string
  webhookUrl?: string
  createdAt: Date
  errorMessage?: string
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get metadata for a channel type
 */
export function getChannelMetadata(type: ChannelType): ChannelMetadata {
  return CHANNEL_METADATA[type]
}

/**
 * Check if a channel type supports hosted mode
 */
export function supportsHostedMode(type: ChannelType): boolean {
  return CHANNEL_METADATA[type].supportsHosted
}

/**
 * Internal transport rows like `web` are valid backend records but should not
 * appear in user-facing connected-channel UI.
 */
export function isUserVisibleChannelType(type: string): type is ChannelType {
  return CHANNEL_TYPES.includes(type as ChannelType)
}

export function isDeferredChannelType(type: string): type is DeferredChannelType {
  return DEFERRED_CHANNEL_TYPES.includes(type as DeferredChannelType)
}

export type UiChannelLike = {
  channel_type: string
  is_active: boolean
  id?: string
  external_channel_id?: string | null
  channel_config?: Record<string, unknown> | null
  inbound_routing_config?: Record<string, unknown> | null
  connection_mode?: 'byob' | 'hosted' | null
}

function getChannelInstallStatus(channel: UiChannelLike): string | null {
  const rawStatus = channel.channel_config?.install_status
  return typeof rawStatus === 'string' && rawStatus.trim().length > 0
    ? rawStatus.trim()
    : null
}

export function getSlackWorkspaceNameForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  const workspaceName = channel.channel_config?.slack_team_name
  if (typeof workspaceName === 'string' && workspaceName.trim().length > 0) {
    return workspaceName.trim()
  }
  const workspaceId = channel.channel_config?.slack_team_id
  return typeof workspaceId === 'string' && workspaceId.trim().length > 0
    ? workspaceId.trim()
    : null
}

export function getSlackConversationLabelForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  const configuredLabel = channel.channel_config?.slack_conversation_label
  if (typeof configuredLabel === 'string' && configuredLabel.trim().length > 0) {
    return configuredLabel.trim()
  }
  return typeof channel.external_channel_id === 'string' && channel.external_channel_id.trim().length > 0
    ? channel.external_channel_id.trim()
    : null
}

export function getSlackStatusDescriptionForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  if (channel.is_active) {
    return 'Listening in the bound Slack conversation'
  }
  if (isSlackInstalledUnbound(channel)) {
    return 'Installed in Slack, waiting for a DM or channel bind'
  }
  return 'Not receiving messages'
}

export function getSlackBindGuidanceForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  if (channel.is_active) return null
  if (getChannelInstallStatus(channel) !== 'installed_unbound') return null
  return 'Finish from Lucid, Slack App Home, or run /lucid bind in the target conversation.'
}

export function getSlackRoutingSummaryForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  const config =
    channel.inbound_routing_config && typeof channel.inbound_routing_config === 'object'
      ? channel.inbound_routing_config
      : null
  if (!config) return null

  const parts: string[] = []
  if (config.dedicated_channel !== false) {
    parts.push('every message')
  }
  if (config.respond_on_mention !== false) {
    parts.push('@mentions')
  }
  if (typeof config.prefix === 'string' && config.prefix.trim().length > 0) {
    parts.push(`prefix ${config.prefix.trim()}`)
  }
  if (config.thread_support === true) {
    parts.push('threads')
  }
  if (config.ignore_bots !== false) {
    parts.push('ignores bots')
  }

  return parts.length > 0 ? `Routing: ${parts.join(', ')}` : null
}

export function getSlackDeliverySummaryForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  const config = channel.channel_config && typeof channel.channel_config === 'object'
    ? channel.channel_config
    : null
  if (!config) return null

  const streamingPreview = config.slack_streaming_preview !== false
  const streamingMode =
    config.slack_streaming_mode === 'off' ||
    config.slack_streaming_mode === 'block' ||
    config.slack_streaming_mode === 'progress'
      ? config.slack_streaming_mode
      : 'partial'
  const nativeStreaming = config.slack_native_streaming === true
  const typingReaction =
    Object.prototype.hasOwnProperty.call(config, 'slack_typing_reaction') &&
    (!config.slack_typing_reaction || typeof config.slack_typing_reaction !== 'string')
      ? null
      : typeof config.slack_typing_reaction === 'string' &&
          config.slack_typing_reaction.trim().length > 0
        ? config.slack_typing_reaction.trim()
        : 'hourglass_flowing_sand'
  const replyToMode =
    config.slack_reply_to_mode === 'first' || config.slack_reply_to_mode === 'all'
      ? config.slack_reply_to_mode
      : 'off'
  const threadHistoryScope =
    config.slack_thread_history_scope === 'channel' ? 'include channel context' : 'thread only'
  const inheritParent = config.slack_thread_inherit_parent === true ? ', inherit parent' : ''
  const initialHistoryLimit =
    typeof config.slack_thread_initial_history_limit === 'number' &&
    Number.isInteger(config.slack_thread_initial_history_limit) &&
    config.slack_thread_initial_history_limit >= 0
      ? `, last ${config.slack_thread_initial_history_limit} messages`
      : ''
  const replyThreading =
    replyToMode === 'off'
      ? 'chat only'
      : replyToMode === 'first'
        ? 'first reply only'
        : 'all reply chunks'

  return `Delivery UX: live preview ${streamingPreview ? 'on' : 'off'}, mode ${streamingMode}${nativeStreaming ? ' + native' : ''}, typing ${typingReaction ? `:${typingReaction}:` : 'off'}, reply threading ${replyThreading}, thread context ${threadHistoryScope}${inheritParent}${initialHistoryLimit}`
}

export function getSlackAllowedUsersSummaryForUi(channel: UiChannelLike): string | null {
  if (channel.channel_type !== 'slack') return null
  const config = channel.channel_config && typeof channel.channel_config === 'object'
    ? channel.channel_config
    : null
  if (!config || !Array.isArray(config.slack_allowed_user_ids)) return null

  const users = config.slack_allowed_user_ids
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())

  return users.length > 0 ? `Allowed users: ${users.join(', ')}` : null
}

/**
 * Hosted Slack uses a two-step lifecycle:
 * 1. workspace app install
 * 2. final DM/channel bind inside Slack
 *
 * The workspace install is a real connected state from a product perspective,
 * even though the row is not yet `is_active`.
 */
export function isSlackInstalledUnbound(channel: UiChannelLike): boolean {
  return (
    channel.channel_type === 'slack' &&
    !channel.is_active &&
    getChannelInstallStatus(channel) === 'installed_unbound'
  )
}

export function getPreferredSlackChannelForUi<T extends UiChannelLike>(channels: T[]): T | null {
  const slackChannels = channels.filter((channel) => channel.channel_type === 'slack')
  if (slackChannels.length === 0) return null

  const hostedActive = slackChannels.find(
    (channel) => channel.connection_mode === 'hosted' && channel.is_active,
  )
  if (hostedActive) return hostedActive

  const hostedInstalledUnbound = slackChannels.find(
    (channel) => channel.connection_mode === 'hosted' && isSlackInstalledUnbound(channel),
  )
  if (hostedInstalledUnbound) return hostedInstalledUnbound

  const hostedAny = slackChannels.find((channel) => channel.connection_mode === 'hosted')
  if (hostedAny) return hostedAny

  const activeAny = slackChannels.find((channel) => channel.is_active)
  if (activeAny) return activeAny

  return slackChannels[0] ?? null
}

/**
 * "Connected" for user-facing UI means either fully active, or a hosted Slack
 * workspace install that is waiting on the final bind step inside Slack.
 */
export function isChannelConnectedForUi(channel: UiChannelLike): boolean {
  return channel.is_active || isSlackInstalledUnbound(channel)
}

export function getGroupedChannelsForUi<T extends UiChannelLike>(channels: T[]): T[] {
  const visibleChannels = channels.filter((channel) => isUserVisibleChannelType(channel.channel_type))
  if (visibleChannels.length === 0) return []

  const nonSlackChannels = visibleChannels.filter((channel) => channel.channel_type !== 'slack')
  const slackChannels = visibleChannels.filter((channel) => channel.channel_type === 'slack')

  if (slackChannels.length === 0) return visibleChannels

  const preferredSlackChannel = getPreferredSlackChannelForUi(slackChannels)
  return preferredSlackChannel
    ? [...nonSlackChannels, preferredSlackChannel]
    : nonSlackChannels
}

export function getChannelUiStats(channels: UiChannelLike[]): {
  total: number
  connected: number
  groupedChannels: UiChannelLike[]
  connectedChannels: UiChannelLike[]
} {
  const groupedChannels = getGroupedChannelsForUi(channels)
  const connectedChannels = groupedChannels.filter((channel) => isChannelConnectedForUi(channel))
  return {
    total: groupedChannels.length,
    connected: connectedChannels.length,
    groupedChannels,
    connectedChannels,
  }
}

export function getChannelStatusForUi(channel: UiChannelLike): ChannelStatus {
  if (channel.is_active) return 'active'
  if (isSlackInstalledUnbound(channel)) return 'pending'
  return 'inactive'
}

/** All connectable channel types. Alias for CHANNEL_TYPES. */
export const CONNECTABLE_CHANNEL_TYPES: readonly ChannelType[] = CHANNEL_TYPES

/**
 * All channel types that support one-click hosted mode.
 * Derived from CHANNEL_METADATA — single source of truth.
 * Use this instead of hardcoding the list at call sites.
 */
export const HOSTED_CHANNEL_TYPES: readonly ChannelType[] = CHANNEL_TYPES.filter(
  (t) => CHANNEL_METADATA[t].supportsHosted,
)

/**
 * Get required fields for a channel type
 */
export function getRequiredFields(
  type: ChannelType,
  mode: ConnectionMode,
): string[] {
  if (mode === 'hosted') return []

  switch (type) {
    case 'telegram':
      return ['botToken']
    case 'discord':
      return ['botToken', 'channelId']
    case 'whatsapp':
      return ['botToken', 'phoneNumberId', 'appSecret', 'verifyToken']
    case 'slack':
      return ['botToken', 'appToken']
    case 'msteams':
      return ['appId', 'appPassword', 'tenantId']
    case 'imessage':
      return []
    default:
      return []
  }
}

/**
 * Validate channel form data
 */
export function validateChannelForm(data: ChannelFormData): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  const required = getRequiredFields(data.channelType, data.connectionMode)

  for (const field of required) {
    if (!data[field as keyof ChannelFormData]) {
      errors.push(`${field} is required for ${data.channelType} ${data.connectionMode} mode`)
    }
  }

  // Teams-specific validation
  if (data.channelType === 'msteams' && data.connectionMode === 'byob') {
    if (data.appId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.appId)) {
      errors.push('App ID must be a valid UUID')
    }
    if (data.tenantId && data.tenantId !== 'common' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.tenantId)) {
      errors.push('Tenant ID must be a valid UUID or "common"')
    }
  }

  if (data.channelType === 'whatsapp' && data.connectionMode === 'byob') {
    if (!data.phoneNumberId?.trim()) {
      errors.push('phoneNumberId is required for whatsapp byob mode')
    }
    if (!data.appSecret?.trim()) {
      errors.push('appSecret is required for whatsapp byob mode')
    }
    if (!data.verifyToken?.trim()) {
      errors.push('verifyToken is required for whatsapp byob mode')
    }
  }

  // Validate prefix if provided
  if (data.inboundRoutingConfig?.prefix) {
    const result = prefixSchema.safeParse(data.inboundRoutingConfig.prefix)
    if (!result.success) {
      errors.push(...result.error.issues.map((e) => e.message))
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
