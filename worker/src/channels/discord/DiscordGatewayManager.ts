/**
 * Discord Gateway Manager — Multi-Tenant
 *
 * Manages one discord.js Client per unique bot token.
 * Groups assistant_channels by bot_token, then maps
 * (discordChannelId → internalChannelId) for inbound routing.
 *
 * Lifecycle:
 *   1. init() — loads active Discord channels from DB, groups by token
 *   2. start() — spins up one Client per token, registers MESSAGE_CREATE handlers
 *   3. stop() — gracefully disconnects all clients
 *   4. refresh() — re-reads DB and hot-adds/removes clients as needed
 *
 * Inbound filtering uses per-channel `inbound_routing_config`:
 *   - dedicated_channel: respond to ALL messages
 *   - prefix: respond to messages starting with prefix (e.g. "!ask")
 *   - respond_on_mention: respond when bot is @mentioned
 *   - ignore_bots: skip messages from other bots
 *   - thread_support: continue conversations in threads
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import type {
  DiscordGatewayAdapterCreator,
  DiscordGatewayAdapterLibraryMethods,
} from '@discordjs/voice'
import { decryptChannelSecrets } from '../../crypto/decrypt-channel-secrets.js'
import {
  getTracer,
  SpanStatusCode,
} from '../../observability/tracing.js'
import { buildDiscordInboundEnvelope, type DiscordInboundSource } from '../../core/transports/discord-envelope.js'
import {
  probeDiscord,
  type DiscordPrivilegedIntentsSummary,
  type DiscordProbeResult,
} from './probe.js'
import { resolveDiscordPresence, type DiscordPresenceSnapshot } from './presence.js'
import { resolveAgentTarget } from '../shared-agent-routing.js'
import { redact } from '../../utils/pii-redactor.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InboundRoutingConfig {
  dedicated_channel?: boolean
  prefix?: string | null
  respond_on_mention?: boolean
  thread_support?: boolean
  ignore_bots?: boolean
}

interface ChannelMapping {
  internalChannelId: string
  assistantId: string
  orgId: string | null
  externalChannelId: string
  routingConfig: InboundRoutingConfig
  allowedUserIds: string[]
  ackReaction: string | null
  typingReaction: string | null
  threadHistoryScope: 'thread' | 'channel'
  threadInheritParent: boolean
  threadInitialHistoryLimit: number | null
  bindingScope: 'channel' | 'guild'
  dedicatedChannelIds: string[]
}

interface HostedGuildCandidate extends ChannelMapping {
  id: string
  token: string
  assistantName: string
  isPrimary: boolean
}

function getEncryptedSecretsData(
  value: unknown,
): string | null {
  if (!value || typeof value !== 'object') return null
  const encryptedData = (value as { encrypted_data?: unknown }).encrypted_data
  return typeof encryptedData === 'string' && encryptedData.trim().length > 0
    ? encryptedData
    : null
}

/** One Discord client per unique bot token */
interface ManagedClient {
  tokenHash: string // SHA-256 of token for logging (never log raw tokens)
  botToken: string
  botUserId: string | null // populated after login (for @mention detection)
  channels: Map<string, ChannelMapping> // discordChannelId → mapping
  hostedGuildCandidates: Map<string, HostedGuildCandidate[]>
  connected: boolean
  lastStartAt: string | null
  lastError: string | null
  wsSend: (payload: unknown) => boolean
  voiceAdapters: Map<string, Set<DiscordGatewayAdapterLibraryMethods>>
  threadChannelCache: Map<string, { parentChannelId: string | null; isThread: boolean; expiresAt: number }>
  sendPresence: (presence: DiscordPresenceSnapshot) => void
  currentPresence: DiscordPresenceSnapshot | null
  destroy: () => void // cleanup function
}

export interface DiscordGuildChannelSummary {
  id: string
  name: string
  type: 'text' | 'announcement'
  parentId: string | null
  parentName: string | null
  position: number
}

interface DiscordThreadContext {
  threadId: string
  parentChannelId: string | null
}

// ─── Discord REST types (we don't import discord.js to keep worker lightweight) ─
// Uses Discord REST API + Gateway via lightweight websocket, not full discord.js

interface DiscordGatewayPayload {
  op: number
  d: unknown
  s: number | null
  t: string | null
}

interface DiscordMessageCreate {
  id: string
  channel_id: string
  guild_id?: string
  author: {
    id: string
    username: string
    bot?: boolean
  }
  content: string
  timestamp: string
  message_reference?: {
    message_id: string
    channel_id: string
    guild_id: string
  }
  referenced_message?: {
    id: string
    content: string
    author?: {
      id: string
      bot?: boolean
    }
  }
  mentions?: Array<{ id: string }>
  thread?: { id: string }
  attachments?: Array<{
    id: string
    filename?: string
    url?: string
    content_type?: string
  }>
}

const DISCORD_INTENT_GUILDS = 1 << 0
const DISCORD_INTENT_GUILD_MEMBERS = 1 << 1
const DISCORD_INTENT_GUILD_VOICE_STATES = 1 << 7
const DISCORD_INTENT_GUILD_PRESENCES = 1 << 8
const DISCORD_INTENT_GUILD_MESSAGES = 1 << 9
const DISCORD_INTENT_GUILD_MESSAGE_REACTIONS = 1 << 10
const DISCORD_INTENT_DIRECT_MESSAGES = 1 << 12
const DISCORD_INTENT_MESSAGE_CONTENT = 1 << 15

function isDuplicateInboundInsertError(error: unknown): error is { code: string } {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  )
}

function resolveDiscordGatewayIntents(
  privilegedIntents?: DiscordPrivilegedIntentsSummary,
): number {
  let intents =
    DISCORD_INTENT_GUILDS |
    DISCORD_INTENT_GUILD_VOICE_STATES |
    DISCORD_INTENT_GUILD_MESSAGES |
    DISCORD_INTENT_GUILD_MESSAGE_REACTIONS |
    DISCORD_INTENT_DIRECT_MESSAGES

  if (!privilegedIntents || privilegedIntents.messageContent !== 'disabled') {
    intents |= DISCORD_INTENT_MESSAGE_CONTENT
  }
  if (privilegedIntents?.guildMembers && privilegedIntents.guildMembers !== 'disabled') {
    intents |= DISCORD_INTENT_GUILD_MEMBERS
  }
  if (privilegedIntents?.presence && privilegedIntents.presence !== 'disabled') {
    intents |= DISCORD_INTENT_GUILD_PRESENCES
  }

  return intents
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class DiscordGatewayManager {
  private clients: Map<string, ManagedClient> = new Map() // tokenHash → client
  private supabase: SupabaseClient
  private encryptionKey: string
  private hostedBotToken?: string
  private onInboundQueued?: (event: {
    id: string
    assistant_id: string
    org_id?: string
    external_message_id?: string | null
  }) => Promise<void> | void
  private refreshIntervalId: ReturnType<typeof setInterval> | null = null
  private running = false
  private desiredPresence: DiscordPresenceSnapshot | null = null
  private lastProbeAt: string | null = null
  private lastProbe: DiscordProbeResult | null = null
  private lastError: string | null = null
  private refreshFailureCount = 0
  private nextRefreshAtMs = 0

  constructor(
    supabase: SupabaseClient,
    encryptionKey: string,
    hostedBotToken?: string,
    onInboundQueued?: (event: {
      id: string
      assistant_id: string
      org_id?: string
      external_message_id?: string | null
    }) => Promise<void> | void,
  ) {
    this.supabase = supabase
    this.encryptionKey = encryptionKey
    this.hostedBotToken = hostedBotToken
    this.onInboundQueued = onInboundQueued
  }

  private getDefaultRoutingConfig(params: {
    inboundRoutingConfig: unknown
  }): InboundRoutingConfig {
    const defaults: InboundRoutingConfig = {
      respond_on_mention: true,
      ignore_bots: true,
    }

    if (
      params.inboundRoutingConfig &&
      typeof params.inboundRoutingConfig === 'object'
    ) {
      return {
        ...defaults,
        ...(params.inboundRoutingConfig as InboundRoutingConfig),
      }
    }

    return defaults
  }

  private getDedicatedChannelIds(params: {
    channelConfig: unknown
    externalChannelId: string | null
    hostedGuildId: string | null
    isHostedBinding: boolean
  }): string[] {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null

    const rawIds = config?.discord_dedicated_channel_ids
    const parsedIds = Array.isArray(rawIds)
      ? rawIds
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : typeof rawIds === 'string'
        ? rawIds
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : []

    if (parsedIds.length > 0) {
      return Array.from(new Set(parsedIds))
    }

    const legacyDedicatedChannelId =
      params.isHostedBinding &&
      typeof params.externalChannelId === 'string' &&
      params.externalChannelId.trim().length > 0 &&
      params.externalChannelId !== params.hostedGuildId
        ? params.externalChannelId.trim()
        : null

    return legacyDedicatedChannelId ? [legacyDedicatedChannelId] : []
  }

  private getAllowedUserIds(params: {
    channelConfig: unknown
  }): string[] {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null

    const rawIds = config?.discord_allowed_user_ids
    const parsedIds = Array.isArray(rawIds)
      ? rawIds
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : []

    return Array.from(new Set(parsedIds))
  }

  private getAckReaction(params: {
    channelConfig: unknown
  }): string | null {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null
    if (!config) return 'eyes'
    if (!Object.prototype.hasOwnProperty.call(config, 'discord_ack_reaction')) {
      return 'eyes'
    }
    const rawValue = config.discord_ack_reaction
    return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue.trim() : null
  }

  private getTypingReaction(params: {
    channelConfig: unknown
  }): string | null {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null
    if (!config) return 'hourglass_flowing_sand'
    if (!Object.prototype.hasOwnProperty.call(config, 'discord_typing_reaction')) {
      return 'hourglass_flowing_sand'
    }
    const rawValue = config.discord_typing_reaction
    return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue.trim() : null
  }

  private getThreadHistoryScope(params: {
    channelConfig: unknown
  }): 'thread' | 'channel' {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null
    return config?.discord_thread_history_scope === 'channel' ? 'channel' : 'thread'
  }

  private getThreadInheritParent(params: {
    channelConfig: unknown
  }): boolean {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null
    return config?.discord_thread_inherit_parent === true
  }

  private getThreadInitialHistoryLimit(params: {
    channelConfig: unknown
  }): number | null {
    const config =
      params.channelConfig && typeof params.channelConfig === 'object'
        ? (params.channelConfig as Record<string, unknown>)
        : null
    const rawValue = config?.discord_thread_initial_history_limit
    return typeof rawValue === 'number' && Number.isInteger(rawValue) && rawValue >= 0
      ? rawValue
      : null
  }

  private normalizeReactionEmoji(value: string | null): string | null {
    if (!value) return null
    const normalized = value.trim()
    if (!normalized) return null

    switch (normalized) {
      case 'eyes':
        return '👀'
      case 'hourglass_flowing_sand':
        return '⏳'
      case 'wave':
        return '👋'
      case 'thinking_face':
        return '🤔'
      default:
        return normalized
    }
  }

  private isBotMentioned(msg: DiscordMessageCreate, botUserId: string): boolean {
    const mentionInArray = msg.mentions?.some((m) => m.id === botUserId) ?? false
    if (mentionInArray) return true

    return new RegExp(`<@!?${botUserId}>`).test(msg.content)
  }

  private isReplyToBot(msg: DiscordMessageCreate, botUserId: string): boolean {
    if (!msg.message_reference?.message_id) return false
    return msg.referenced_message?.author?.id === botUserId
  }

  private applyReadyIdentity(
    client: ManagedClient,
    readyData: { session_id?: string; user?: { id?: string | null } },
  ): string | null {
    const readyBotUserId =
      typeof readyData.user?.id === 'string' && readyData.user.id.trim().length > 0
        ? readyData.user.id.trim()
        : null

    if (readyBotUserId && readyBotUserId !== client.botUserId) {
      client.botUserId = readyBotUserId
    }

    return typeof readyData.session_id === 'string' && readyData.session_id.trim().length > 0
      ? readyData.session_id.trim()
      : null
  }

  /**
   * Initialize and start all Discord gateway clients.
   * Call this once at worker startup.
   */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    console.log('[discord-gw] Starting Discord Gateway Manager')

    await this.refresh()

    // Refresh channel mappings every 60s (pick up new/removed channels)
    this.refreshIntervalId = setInterval(() => {
      this.refresh().catch((err) =>
        console.error('[discord-gw] Refresh error:', err),
      )
    }, 60_000)
  }

  /**
   * Gracefully stop all clients.
   */
  stop(): void {
    this.running = false

    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId)
      this.refreshIntervalId = null
    }

    for (const [hash, client] of this.clients) {
      console.log(`[discord-gw] Stopping client ${hash.slice(0, 8)}...`)
      client.destroy()
    }

    this.clients.clear()
    console.log('[discord-gw] All clients stopped')
  }

  resolveGuildBinding(guildId: string): ChannelMapping | null {
    const normalizedGuildId = guildId.trim()
    if (!normalizedGuildId) return null
    for (const client of this.clients.values()) {
      const mapping = client.channels.get(`guild:${normalizedGuildId}`)
      if (mapping) return mapping
    }
    return null
  }

  getBotUserIdForGuild(guildId: string): string | null {
    const normalizedGuildId = guildId.trim()
    if (!normalizedGuildId) return null
    for (const client of this.clients.values()) {
      if (client.channels.has(`guild:${normalizedGuildId}`)) {
        return client.botUserId
      }
    }
    return null
  }

  async getGuildChannels(guildId: string): Promise<DiscordGuildChannelSummary[]> {
    const normalizedGuildId = guildId.trim()
    if (!normalizedGuildId) return []

    const client = Array.from(this.clients.values()).find((entry) =>
      entry.channels.has(`guild:${normalizedGuildId}`) ||
      entry.hostedGuildCandidates.has(normalizedGuildId),
    )
    if (!client) {
      return []
    }

    const response = await fetch(`https://discord.com/api/v10/guilds/${normalizedGuildId}/channels`, {
      headers: { Authorization: `Bot ${client.botToken}` },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Discord guild channels request failed (${response.status}): ${body.slice(0, 200)}`)
    }

    const payload = (await response.json()) as Array<{
      id?: string
      name?: string
      type?: number
      parent_id?: string | null
      position?: number
    }>

    const categories = new Map(
      payload
        .filter((channel) => channel.type === 4 && typeof channel.id === 'string')
        .map((channel) => [
          channel.id as string,
          typeof channel.name === 'string' ? channel.name : null,
        ]),
    )

    return payload
      .filter(
        (channel) =>
          typeof channel.id === 'string' &&
          typeof channel.name === 'string' &&
          (channel.type === 0 || channel.type === 5),
      )
      .map(
        (channel): DiscordGuildChannelSummary => ({
          id: channel.id as string,
          name: channel.name as string,
          type: channel.type === 5 ? 'announcement' : 'text',
          parentId:
            typeof channel.parent_id === 'string' && channel.parent_id.trim().length > 0
              ? channel.parent_id
              : null,
          parentName:
            typeof channel.parent_id === 'string' && categories.has(channel.parent_id)
              ? (categories.get(channel.parent_id) ?? null)
              : null,
          position:
            typeof channel.position === 'number' && Number.isFinite(channel.position)
              ? channel.position
              : 0,
        }),
      )
      .sort((left, right) => {
        const parentRank = (left.parentName ?? '').localeCompare(right.parentName ?? '')
        if (parentRank !== 0) return parentRank
        if (left.position !== right.position) return left.position - right.position
        return left.name.localeCompare(right.name)
      })
  }

  createVoiceAdapter(guildId: string): DiscordGatewayAdapterCreator | null {
    const normalizedGuildId = guildId.trim()
    if (!normalizedGuildId) return null
    for (const client of this.clients.values()) {
      if (!client.channels.has(`guild:${normalizedGuildId}`)) continue

      return (methods) => {
        let listeners = client.voiceAdapters.get(normalizedGuildId)
        if (!listeners) {
          listeners = new Set()
          client.voiceAdapters.set(normalizedGuildId, listeners)
        }
        listeners.add(methods)

        return {
          sendPayload: (payload: unknown) => client.wsSend(payload),
          destroy: () => {
            const current = client.voiceAdapters.get(normalizedGuildId)
            if (!current) return
            current.delete(methods)
            if (current.size === 0) {
              client.voiceAdapters.delete(normalizedGuildId)
            }
          },
        }
      }
    }

    return null
  }

  async probeHostedBot(): Promise<DiscordProbeResult | null> {
    if (!this.hostedBotToken) return null
    const probe = await probeDiscord(this.hostedBotToken, 2500, true)
    this.lastProbeAt = new Date().toISOString()
    this.lastProbe = probe
    this.lastError = probe.ok ? null : probe.error
    return probe
  }

  setPresence(input: {
    status?: string | null
    activity?: string | null
    activityType?: number | null
    activityUrl?: string | null
  }): DiscordPresenceSnapshot {
    const resolved = resolveDiscordPresence(input)
    this.desiredPresence = resolved

    for (const client of this.clients.values()) {
      client.sendPresence(resolved)
      client.currentPresence = resolved
    }

    return resolved
  }

  getAdminStatus(): {
    configured: boolean
    running: boolean
    lastStartAt: string | null
    lastProbeAt: string | null
    lastError: string | null
    probe: DiscordProbeResult | null
    presence: DiscordPresenceSnapshot | null
    stats: ReturnType<DiscordGatewayManager['getStats']>
  } {
    const clientList = Array.from(this.clients.values())
    const lastStartAt = clientList
      .map((client) => client.lastStartAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()
      .at(-1) ?? null

    return {
      configured: Boolean(this.hostedBotToken || clientList.length > 0),
      running: this.running && clientList.some((client) => client.connected),
      lastStartAt,
      lastProbeAt: this.lastProbeAt,
      lastError: this.lastError ?? clientList.map((client) => client.lastError).find(Boolean) ?? null,
      probe: this.lastProbe,
      presence:
        clientList.map((client) => client.currentPresence).find((value): value is DiscordPresenceSnapshot => Boolean(value)) ??
        this.desiredPresence,
      stats: this.getStats(),
    }
  }

  /**
   * Refresh channel mappings from DB.
   * Adds new clients, removes stale ones, updates channel maps.
   */
  async refresh(): Promise<void> {
    const now = Date.now()
    if (this.nextRefreshAtMs > now) return

    const channelsByToken = await this.loadChannelsGroupedByToken()
    if (!channelsByToken) {
      this.refreshFailureCount += 1
      const backoffMs = Math.min(60_000 * 2 ** (this.refreshFailureCount - 1), 10 * 60_000)
      this.nextRefreshAtMs = now + backoffMs
      console.warn(
        `[discord-gw] Channel refresh failed; preserving ${this.clients.size} existing clients; next retry in ${Math.round(backoffMs / 1000)}s`,
      )
      return
    }

    this.refreshFailureCount = 0
    this.nextRefreshAtMs = 0

    // Remove clients whose tokens are no longer in DB
    for (const [tokenHash, client] of this.clients) {
      if (!channelsByToken.has(client.botToken)) {
        console.log(`[discord-gw] Removing stale client ${tokenHash.slice(0, 8)}`)
        client.destroy()
        this.clients.delete(tokenHash)
      }
    }

    // Add/update clients
    for (const [botToken, grouped] of channelsByToken) {
      const tokenHash = this.hashToken(botToken)
      const existing = this.clients.get(tokenHash)

      if (existing) {
        // Update channel mappings only
        existing.channels = grouped.channels
        existing.hostedGuildCandidates = grouped.hostedGuildCandidates
      } else {
        // Spin up new client
        console.log(
          `[discord-gw] Starting new client ${tokenHash.slice(0, 8)} with ${grouped.channels.size} channels`,
        )
        await this.createClient(
          botToken,
          tokenHash,
          grouped.channels,
          grouped.hostedGuildCandidates,
        )
      }
    }

    const totalChannels = Array.from(this.clients.values()).reduce(
      (sum, c) => sum + c.channels.size,
      0,
    )
    console.log(
      `[discord-gw] Active: ${this.clients.size} clients, ${totalChannels} channels`,
    )
  }

  /**
   * Load all active Discord channels, decrypt secrets, group by bot_token.
   */
  private async loadChannelsGroupedByToken(): Promise<
    Map<string, { channels: Map<string, ChannelMapping>; hostedGuildCandidates: Map<string, HostedGuildCandidate[]> }> | null
  > {
    const { data: channels, error } = await this.supabase
      .from('assistant_channels')
      .select(
        `
        id,
        assistant_id,
        is_primary,
        assistant:ai_assistants!assistant_id (
          org_id,
          name
        ),
        channel_type,
        external_channel_id,
        connection_mode,
        channel_config,
        inbound_routing_config,
        encrypted_secrets:encrypted_secrets_id (
          id,
          encrypted_data
        )
      `,
      )
      .eq('channel_type', 'discord')
      .eq('is_active', true)

    if (error || !channels) {
      console.error('[discord-gw] Failed to load channels:', error)
      return null
    }

    const byToken = new Map<
      string,
      { channels: Map<string, ChannelMapping>; hostedGuildCandidates: Map<string, HostedGuildCandidate[]> }
    >()
    const hostedGuildCandidates = new Map<string, HostedGuildCandidate[]>()

    for (const ch of channels) {
      const encData = getEncryptedSecretsData(ch.encrypted_secrets)
      const secrets = encData ? this.decryptSecrets(encData) : {}
      const channelConfig =
        ch.channel_config && typeof ch.channel_config === 'object'
          ? (ch.channel_config as Record<string, unknown>)
          : null
      const isHostedBinding =
        ch.connection_mode === 'hosted' ||
        channelConfig?.hosted === true ||
        (!encData && !!this.hostedBotToken)
      const token = isHostedBinding
        ? (this.hostedBotToken || secrets.bot_token)
        : secrets.bot_token
      if (!token) continue

      const hostedGuildId =
        typeof channelConfig?.discord_guild_id === 'string' &&
        channelConfig.discord_guild_id.trim().length > 0
          ? channelConfig.discord_guild_id.trim()
          : ch.external_channel_id!

      const mappingKey = isHostedBinding
        ? `guild:${hostedGuildId}`
        : ch.external_channel_id!

      const mapping: ChannelMapping = {
        internalChannelId: ch.id,
        assistantId: ch.assistant_id,
        orgId:
          ch.assistant &&
          typeof ch.assistant === 'object' &&
          !Array.isArray(ch.assistant) &&
          typeof (ch.assistant as { org_id?: unknown }).org_id === 'string'
            ? ((ch.assistant as { org_id: string }).org_id ?? null)
            : null,
        externalChannelId: isHostedBinding ? hostedGuildId : ch.external_channel_id!,
        routingConfig: this.getDefaultRoutingConfig({
          inboundRoutingConfig: ch.inbound_routing_config,
        }),
        allowedUserIds: this.getAllowedUserIds({
          channelConfig: ch.channel_config,
        }),
        ackReaction: this.getAckReaction({
          channelConfig: ch.channel_config,
        }),
        typingReaction: this.getTypingReaction({
          channelConfig: ch.channel_config,
        }),
        threadHistoryScope: this.getThreadHistoryScope({
          channelConfig: ch.channel_config,
        }),
        threadInheritParent: this.getThreadInheritParent({
          channelConfig: ch.channel_config,
        }),
        threadInitialHistoryLimit: this.getThreadInitialHistoryLimit({
          channelConfig: ch.channel_config,
        }),
        bindingScope: isHostedBinding ? 'guild' : 'channel',
        dedicatedChannelIds: this.getDedicatedChannelIds({
          channelConfig: ch.channel_config,
          externalChannelId: ch.external_channel_id,
          hostedGuildId,
          isHostedBinding,
        }),
      }

      if (!byToken.has(token)) {
        byToken.set(token, {
          channels: new Map(),
          hostedGuildCandidates: new Map(),
        })
      }

      if (isHostedBinding) {
        const candidateKey = `${token}::${mappingKey}`
        const assistantValue =
          ch.assistant && typeof ch.assistant === 'object' && !Array.isArray(ch.assistant)
            ? (ch.assistant as { name?: unknown })
            : null
        const assistantName =
          typeof assistantValue?.name === 'string' && assistantValue.name.trim().length > 0
            ? assistantValue.name.trim()
            : ch.assistant_id
        const candidates = hostedGuildCandidates.get(candidateKey) ?? []
        candidates.push({
          id: ch.id,
          ...mapping,
          token,
          assistantName,
          isPrimary: ch.is_primary === true,
        })
        hostedGuildCandidates.set(candidateKey, candidates)
        continue
      }

      byToken.get(token)!.channels.set(mappingKey, mapping)
    }

    for (const [candidateKey, candidates] of hostedGuildCandidates.entries()) {
      const [token, mappingKey] = candidateKey.split('::')
      if (!token || !mappingKey) continue
      const resolution = resolveAgentTarget({
        bindings: candidates,
        conversationDefault:
          candidates.find((candidate) => candidate.isPrimary) ?? (candidates.length === 1 ? candidates[0] : null),
      })

      if (resolution.kind !== 'resolved') {
        console.warn('[discord-gw] Skipping hosted guild routing without a resolved default', {
          mappingKey,
          reason: resolution.kind === 'unresolved' ? resolution.reason : resolution.kind,
          candidateCount: candidates.length,
        })
        continue
      }

      byToken.get(token)?.channels.set(mappingKey, {
        internalChannelId: resolution.binding.internalChannelId,
        assistantId: resolution.binding.assistantId,
        orgId: resolution.binding.orgId,
        externalChannelId: resolution.binding.externalChannelId,
        routingConfig: resolution.binding.routingConfig,
        allowedUserIds: resolution.binding.allowedUserIds,
        ackReaction: resolution.binding.ackReaction,
        typingReaction: resolution.binding.typingReaction,
        threadHistoryScope: resolution.binding.threadHistoryScope,
        threadInheritParent: resolution.binding.threadInheritParent,
        threadInitialHistoryLimit: resolution.binding.threadInitialHistoryLimit,
        bindingScope: resolution.binding.bindingScope,
        dedicatedChannelIds: resolution.binding.dedicatedChannelIds,
      })
      byToken.get(token)?.hostedGuildCandidates.set(
        resolution.binding.externalChannelId,
        candidates,
      )
    }

    const surfaceDefaultsTable = this.supabase.from('channel_surface_defaults') as
      | {
          select: (query: string) => unknown
        }
      | null
    if (!surfaceDefaultsTable) {
      return byToken
    }

    const selectSurfaceDefaults = surfaceDefaultsTable.select.bind(surfaceDefaultsTable)

    const loadSurfaceDefaults = async (
      surfaceOwnerKind: 'guild' | 'discord-channel',
    ): Promise<Array<Record<string, unknown>>> => {
      try {
        const surfaceDefaultsBaseQuery = selectSurfaceDefaults(`
            surface_owner_id,
            assistant_channel_id,
            assistant_channels:assistant_channel_id (
              id,
              assistant_id,
              assistant:ai_assistants!assistant_id (
                org_id
              ),
              channel_type,
              external_channel_id,
              connection_mode,
              channel_config,
              inbound_routing_config,
              encrypted_secrets:encrypted_secrets_id (
                id,
                encrypted_data
              )
            )
          `)
        if (
          !surfaceDefaultsBaseQuery ||
          typeof (surfaceDefaultsBaseQuery as { eq?: unknown }).eq !== 'function'
        ) {
          return []
        }

        const surfaceDefaultsEq = surfaceDefaultsBaseQuery as unknown as {
          eq: (column: string, value: unknown) => {
            eq: (column: string, value: unknown) => {
              eq: (column: string, value: unknown) => Promise<{ data?: unknown; error?: unknown }>
            }
          }
        }
        const result = await surfaceDefaultsEq
          .eq('channel_type', 'discord')
          .eq('surface_owner_kind', surfaceOwnerKind)
          .eq('is_active', true)
        if (result?.error) {
          console.error('[discord-gw] Failed to load surface defaults:', {
            surfaceOwnerKind,
            error: result.error,
          })
          return []
        }
        return (result?.data ?? []) as Array<Record<string, unknown>>
      } catch (_error) {
        return []
      }
    }

    const guildSurfaceDefaults = await loadSurfaceDefaults('guild')
    for (const row of guildSurfaceDefaults) {
      const guildId =
        typeof row.surface_owner_id === 'string' && row.surface_owner_id.trim().length > 0
          ? row.surface_owner_id.trim()
          : null
      if (!guildId) continue

      const joined = Array.isArray(row.assistant_channels)
        ? row.assistant_channels[0]
        : row.assistant_channels
      if (!joined || typeof joined !== 'object') continue

      const mappingKey = `guild:${guildId}`
      if (Array.from(byToken.values()).some((entry) => entry.channels.has(mappingKey))) {
        continue
      }

      const encData = getEncryptedSecretsData(
        (joined as { encrypted_secrets?: unknown }).encrypted_secrets,
      )
      const secrets = encData ? this.decryptSecrets(encData) : {}
      const channelConfig =
        joined.channel_config && typeof joined.channel_config === 'object'
          ? (joined.channel_config as Record<string, unknown>)
          : null
      const isHostedBinding =
        joined.connection_mode === 'hosted' ||
        channelConfig?.hosted === true ||
        (!encData && !!this.hostedBotToken)
      const token = isHostedBinding
        ? (this.hostedBotToken || secrets.bot_token)
        : secrets.bot_token
      if (!token) continue

      if (!byToken.has(token)) {
        byToken.set(token, {
          channels: new Map(),
          hostedGuildCandidates: new Map(),
        })
      }

      byToken.get(token)!.channels.set(mappingKey, {
        internalChannelId: String(joined.id),
        assistantId: String(joined.assistant_id),
        orgId:
          joined.assistant &&
          typeof joined.assistant === 'object' &&
          !Array.isArray(joined.assistant) &&
          typeof (joined.assistant as { org_id?: unknown }).org_id === 'string'
            ? ((joined.assistant as { org_id: string }).org_id ?? null)
            : null,
        externalChannelId: guildId,
        routingConfig: this.getDefaultRoutingConfig({
          inboundRoutingConfig: joined.inbound_routing_config,
        }),
        allowedUserIds: this.getAllowedUserIds({
          channelConfig: joined.channel_config,
        }),
        ackReaction: this.getAckReaction({
          channelConfig: joined.channel_config,
        }),
        typingReaction: this.getTypingReaction({
          channelConfig: joined.channel_config,
        }),
        threadHistoryScope: this.getThreadHistoryScope({
          channelConfig: joined.channel_config,
        }),
        threadInheritParent: this.getThreadInheritParent({
          channelConfig: joined.channel_config,
        }),
        threadInitialHistoryLimit: this.getThreadInitialHistoryLimit({
          channelConfig: joined.channel_config,
        }),
        bindingScope: 'guild',
        dedicatedChannelIds: this.getDedicatedChannelIds({
          channelConfig: joined.channel_config,
          externalChannelId:
            typeof joined.external_channel_id === 'string' ? joined.external_channel_id : null,
          hostedGuildId: guildId,
          isHostedBinding: true,
        }),
      })
    }

    const channelSurfaceDefaults = await loadSurfaceDefaults('discord-channel')
    for (const row of channelSurfaceDefaults) {
      const discordChannelId =
        typeof row.surface_owner_id === 'string' && row.surface_owner_id.trim().length > 0
          ? row.surface_owner_id.trim()
          : null
      if (!discordChannelId) continue

      const joined = Array.isArray(row.assistant_channels)
        ? row.assistant_channels[0]
        : row.assistant_channels
      if (!joined || typeof joined !== 'object') continue

      const encData = getEncryptedSecretsData(
        (joined as { encrypted_secrets?: unknown }).encrypted_secrets,
      )
      const secrets = encData ? this.decryptSecrets(encData) : {}
      const channelConfig =
        joined.channel_config && typeof joined.channel_config === 'object'
          ? (joined.channel_config as Record<string, unknown>)
          : null
      const isHostedBinding =
        joined.connection_mode === 'hosted' ||
        channelConfig?.hosted === true ||
        (!encData && !!this.hostedBotToken)
      const token = isHostedBinding
        ? (this.hostedBotToken || secrets.bot_token)
        : secrets.bot_token
      if (!token) continue

      if (!byToken.has(token)) {
        byToken.set(token, {
          channels: new Map(),
          hostedGuildCandidates: new Map(),
        })
      }

      byToken.get(token)!.channels.set(discordChannelId, {
        internalChannelId: String(joined.id),
        assistantId: String(joined.assistant_id),
        orgId:
          joined.assistant &&
          typeof joined.assistant === 'object' &&
          !Array.isArray(joined.assistant) &&
          typeof (joined.assistant as { org_id?: unknown }).org_id === 'string'
            ? ((joined.assistant as { org_id: string }).org_id ?? null)
            : null,
        externalChannelId: discordChannelId,
        routingConfig: {
          ...this.getDefaultRoutingConfig({
            inboundRoutingConfig: joined.inbound_routing_config,
          }),
          dedicated_channel: true,
        },
        allowedUserIds: this.getAllowedUserIds({
          channelConfig: joined.channel_config,
        }),
        ackReaction: this.getAckReaction({
          channelConfig: joined.channel_config,
        }),
        typingReaction: this.getTypingReaction({
          channelConfig: joined.channel_config,
        }),
        threadHistoryScope: this.getThreadHistoryScope({
          channelConfig: joined.channel_config,
        }),
        threadInheritParent: this.getThreadInheritParent({
          channelConfig: joined.channel_config,
        }),
        threadInitialHistoryLimit: this.getThreadInitialHistoryLimit({
          channelConfig: joined.channel_config,
        }),
        bindingScope: 'channel',
        dedicatedChannelIds: [],
      })
    }

    return byToken
  }

  /**
   * Create a Discord gateway connection for a specific bot token.
   * Uses REST API for Gateway URL, then connects via WebSocket.
   */
  private async createClient(
    botToken: string,
    tokenHash: string,
    channels: Map<string, ChannelMapping>,
    hostedGuildCandidates: Map<string, HostedGuildCandidate[]>,
  ): Promise<void> {
    // For MVP: use Discord REST API to get gateway URL, then connect
    // In production, consider discord.js for resilience (heartbeat, reconnect, sharding)
    try {
      const probe = await probeDiscord(botToken, 2500, true).catch(() => null)
      const privilegedIntents = probe?.application?.intents
      const identifyIntents = resolveDiscordGatewayIntents(privilegedIntents)

      const gatewayResp = await fetch('https://discord.com/api/v10/gateway/bot', {
        headers: { Authorization: `Bot ${botToken}` },
      })

      if (!gatewayResp.ok) {
        const errData = (await gatewayResp.json()) as { message?: string }
        console.error(
          `[discord-gw] Failed to get gateway for ${tokenHash.slice(0, 8)}: ${errData.message}`,
        )
        return
      }

      const { url: gatewayUrl } = (await gatewayResp.json()) as { url: string }

      // Get bot user ID for @mention detection
      const botUser =
        typeof probe?.bot?.id === 'string' && probe.bot.id.trim().length > 0
          ? { id: probe.bot.id.trim() }
          : await (async () => {
              const meResp = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bot ${botToken}` },
              })
              return meResp.ok
                ? ((await meResp.json()) as { id: string })
                : null
            })()

      // Connect to gateway
      const ws = new (await this.getWebSocket())(
        `${gatewayUrl}?v=10&encoding=json`,
      )

      let heartbeatInterval: ReturnType<typeof setInterval> | null = null
      let lastSequence: number | null = null
      let sessionId: string | null = null

      const client: ManagedClient = {
        tokenHash,
        botToken,
        botUserId: botUser?.id || null,
        channels,
        hostedGuildCandidates,
        connected: false,
        lastStartAt: null,
        lastError: null,
        wsSend: (payload) => {
          try {
            ws.send(JSON.stringify(payload))
            return true
          } catch (error) {
            client.lastError = error instanceof Error ? error.message : String(error)
            this.lastError = client.lastError
            return false
          }
        },
        voiceAdapters: new Map(),
        threadChannelCache: new Map(),
        sendPresence: (presence) => {
          const activities = presence.activity ? [presence.activity] : []
          client.wsSend({
            op: 3,
            d: {
              since: null,
              activities,
              status: presence.status,
              afk: false,
            },
          })
        },
        currentPresence: null,
        destroy: () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval)
          for (const listeners of client.voiceAdapters.values()) {
            for (const methods of listeners) methods.destroy()
          }
          client.voiceAdapters.clear()
          try {
            ws.close(1000, 'shutdown')
          } catch {
            // ignore close errors
          }
        },
      }

      ws.onmessage = (event: { data: string | Buffer | ArrayBuffer }) => {
        const rawData =
          typeof event.data === 'string'
            ? event.data
            : Buffer.isBuffer(event.data)
              ? event.data.toString('utf8')
              : Buffer.from(event.data).toString('utf8')
        const payload: DiscordGatewayPayload = JSON.parse(
          rawData,
        )

        if (payload.s !== null) lastSequence = payload.s

        switch (payload.op) {
          case 10: {
            // Hello — start heartbeating
            const { heartbeat_interval } = payload.d as {
              heartbeat_interval: number
            }
            heartbeatInterval = setInterval(() => {
              client.wsSend({ op: 1, d: lastSequence })
            }, heartbeat_interval)

            // Send identify
            client.wsSend({
              op: 2,
              d: {
                token: botToken,
                intents: identifyIntents,
                properties: {
                  os: 'linux',
                  browser: 'lucid-worker',
                  device: 'lucid-worker',
                },
              },
            })
            break
          }

          case 0: {
            // Dispatch
            if (payload.t === 'READY') {
              const readyData = payload.d as { session_id?: string; user?: { id?: string | null } }
              sessionId = this.applyReadyIdentity(client, readyData)
              client.connected = true
              client.lastStartAt = new Date().toISOString()
              client.lastError = null
              console.log(
                `[discord-gw] Client ${tokenHash.slice(0, 8)} connected (session: ${sessionId?.slice(0, 8)})`,
              )
              if (this.desiredPresence) {
                client.sendPresence(this.desiredPresence)
                client.currentPresence = this.desiredPresence
              }
            }

            if (payload.t === 'MESSAGE_CREATE') {
              const incoming = payload.d as DiscordMessageCreate
              console.log(
                `[discord-gw] MESSAGE_CREATE guild=${incoming.guild_id ?? 'dm'} channel=${incoming.channel_id} author=${incoming.author?.id ?? 'unknown'} mentions=${incoming.mentions?.length ?? 0} content_len=${incoming.content?.length ?? 0}`,
              )
              this.handleMessage(
                incoming,
                client,
              ).catch((err) =>
                console.error('[discord-gw] Message handler error:', err),
              )
            }

            if (payload.t === 'VOICE_SERVER_UPDATE') {
              const update = payload.d as {
                guild_id?: string
                token?: string | null
                endpoint?: string | null
              }
              if (typeof update.guild_id === 'string') {
                const listeners = client.voiceAdapters.get(update.guild_id)
                for (const methods of listeners ?? []) {
                  methods.onVoiceServerUpdate(update as Parameters<DiscordGatewayAdapterLibraryMethods['onVoiceServerUpdate']>[0])
                }
              }
            }

            if (payload.t === 'VOICE_STATE_UPDATE') {
              const update = payload.d as {
                guild_id?: string
              }
              if (typeof update.guild_id === 'string') {
                const listeners = client.voiceAdapters.get(update.guild_id)
                for (const methods of listeners ?? []) {
                  methods.onVoiceStateUpdate(update as Parameters<DiscordGatewayAdapterLibraryMethods['onVoiceStateUpdate']>[0])
                }
              }
            }
            break
          }

          case 11: {
            // Heartbeat ACK — all good
            break
          }

          case 7: {
            // Reconnect requested
            console.log(
              `[discord-gw] Reconnect requested for ${tokenHash.slice(0, 8)}`,
            )
            ws.close(4000, 'reconnect')
            break
          }

          case 9: {
            // Invalid session
            console.warn(
              `[discord-gw] Invalid session for ${tokenHash.slice(0, 8)}`,
            )
            ws.close(4000, 'invalid session')
            break
          }
        }
      }

      ws.onerror = (error: Event) => {
        client.lastError = String(error)
        this.lastError = client.lastError
        console.error(
          `[discord-gw] WebSocket error for ${tokenHash.slice(0, 8)}:`,
          error,
        )
      }

      ws.onclose = (event: { code: number; reason: string }) => {
        client.connected = false
        client.lastError = event.reason || `closed (${event.code})`
        this.lastError = client.lastError
        console.log(
          `[discord-gw] Client ${tokenHash.slice(0, 8)} disconnected (${event.code}: ${event.reason})`,
        )
        if (heartbeatInterval) clearInterval(heartbeatInterval)
        for (const listeners of client.voiceAdapters.values()) {
          for (const methods of listeners) methods.destroy()
        }
        client.voiceAdapters.clear()
        this.clients.delete(tokenHash)

        // Auto-reconnect after 5s if still running
        if (this.running) {
          setTimeout(() => {
            console.log(
              `[discord-gw] Reconnecting ${tokenHash.slice(0, 8)}...`,
            )
            this.createClient(botToken, tokenHash, channels, hostedGuildCandidates).catch((err) =>
              console.error('[discord-gw] Reconnect failed:', err),
            )
          }, 5000)
        }
      }

      this.clients.set(tokenHash, client)
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      console.error(
        `[discord-gw] Failed to create client ${tokenHash.slice(0, 8)}:`,
        err,
      )
    }
  }

  /**
   * Handle an incoming Discord MESSAGE_CREATE event.
   * Routes to the correct assistant channel based on channel mapping + routing config.
   */
  private async handleMessage(
    msg: DiscordMessageCreate,
    client: ManagedClient,
  ): Promise<void> {
    const directChannelMapping = client.channels.get(msg.channel_id)
    const guildMapping = msg.guild_id ? client.channels.get(`guild:${msg.guild_id}`) : undefined
    const shouldInspectThreadContext =
      !directChannelMapping &&
      !!msg.guild_id &&
      (client.channels.size > (guildMapping ? 1 : 0) ||
        guildMapping?.routingConfig.thread_support === true ||
        (guildMapping?.dedicatedChannelIds.length ?? 0) > 0)
    const threadContext = shouldInspectThreadContext
      ? await this.getThreadContext(msg, client)
      : null

    // Look up channel mapping
    const mapping =
      directChannelMapping ??
      (threadContext?.parentChannelId ? client.channels.get(threadContext.parentChannelId) : undefined) ??
      guildMapping
    if (!mapping) {
      console.log(
        `[discord-gw] Ignored message ${redact(msg.id)}: no mapping for channel=${redact(msg.channel_id)} guild=${redact(msg.guild_id ?? 'dm')}`,
      )
      return // Not a monitored channel
    }

    let selectedMapping = mapping
    let config = selectedMapping.routingConfig

    // Ignore bots (default true)
    if ((config.ignore_bots !== false) && msg.author.bot) {
      console.log(`[discord-gw] Ignored message ${redact(msg.id)}: author is a bot`)
      return
    }

    // Check if message should be processed based on routing config
    const shouldProcess = this.shouldProcessMessage(msg, client, mapping, config, threadContext)
    if (!shouldProcess) {
      console.log(
        `[discord-gw] Ignored message ${redact(msg.id)}: routing miss binding=${mapping.bindingScope} guild=${redact(msg.guild_id ?? 'dm')} channel=${redact(msg.channel_id)} mention=${client.botUserId ? this.isBotMentioned(msg, client.botUserId) : false}`,
      )
      return
    }

    // Strip prefix if applicable
    let text = msg.content
    let replyMode: 'direct' | 'mention' | 'prefix' | 'dedicated' = 'direct'
    if (config.prefix && text.startsWith(config.prefix)) {
      text = text.slice(config.prefix.length).trim()
      replyMode = 'prefix'
    }

    // Strip @mention if that's how we matched
    if (config.respond_on_mention && client.botUserId) {
      const mentionMatched = this.isBotMentioned(msg, client.botUserId)
      text = text.replace(new RegExp(`<@!?${client.botUserId}>`, 'g'), '').trim()
      if (mentionMatched) {
        replyMode = 'mention'
      }
    }

    if (selectedMapping.bindingScope === 'guild' && msg.guild_id && replyMode === 'mention') {
      const candidates = client.hostedGuildCandidates?.get(msg.guild_id) ?? []
      if (candidates.length > 0) {
        const tokens = text.trim().split(/\s+/).filter(Boolean)
        const explicitTarget = tokens[0] ?? null
        if (explicitTarget) {
          const conversationDefault =
            candidates.find((candidate) => candidate.internalChannelId === selectedMapping.internalChannelId) ??
            (candidates.length === 1 ? candidates[0] : null)
          const resolution = resolveAgentTarget({
            bindings: candidates,
            explicitTarget,
            conversationDefault,
          })
          if (resolution.kind === 'resolved' && resolution.source === 'explicit_target') {
            selectedMapping = resolution.binding
            config = selectedMapping.routingConfig
            text = tokens.slice(1).join(' ').trim()
          }
        }
      }
    }

    const allowedUserIds = selectedMapping.allowedUserIds ?? []
    if (allowedUserIds.length > 0 && !allowedUserIds.includes(msg.author.id)) {
      console.log(`[discord-gw] Ignored message ${msg.id}: author ${msg.author.id} not in allowed users`)
      return
    }

    const discordAttachments = Array.isArray(msg.attachments)
      ? msg.attachments
          .map((attachment) => ({
            kind: attachment.content_type?.startsWith('image/')
              ? 'image'
              : attachment.content_type?.startsWith('audio/')
                ? 'audio'
                : 'document',
            id: attachment.id,
            fileName: attachment.filename,
            url: attachment.url,
            mimeType: attachment.content_type,
          }))
      : []
    const hasDiscordAttachments = discordAttachments.length > 0
    const messageText = text.trim()

    if (!messageText && !hasDiscordAttachments) return // Empty after stripping with no attachment context

    if (
      (selectedMapping.bindingScope === 'channel' && config.dedicated_channel) ||
      (selectedMapping.bindingScope === 'guild' &&
        selectedMapping.dedicatedChannelIds.includes(threadContext?.parentChannelId ?? msg.channel_id))
    ) {
      replyMode = 'dedicated'
    }

    // Start span only after all filters pass (avoids leaked spans on early returns)
    const span = getTracer().startSpan('discord.gateway.message', {
      attributes: {
        'lucid.channel_type': 'discord',
      },
    })

    const inboundEventId = crypto.randomUUID()
    const source: DiscordInboundSource = {
      messageId: msg.id,
      authorId: msg.author.id,
      channelId: msg.channel_id,
      parentChannelId: threadContext?.parentChannelId ?? msg.channel_id,
      guildId: msg.guild_id,
      authorUsername: msg.author.username,
      rawContent: msg.content,
      normalizedText: messageText,
      threadId: threadContext?.threadId ?? msg.thread?.id,
      threadHistoryScope: selectedMapping.threadHistoryScope,
      threadInheritParent: selectedMapping.threadInheritParent,
      initialHistoryLimit: selectedMapping.threadInitialHistoryLimit,
      messageReference: msg.message_reference,
      rawPayload: msg as unknown as Record<string, unknown>,
      attachments: discordAttachments,
    }
    const envelope = buildDiscordInboundEnvelope({
      inboundEventId,
      channelId: selectedMapping.internalChannelId,
      assistantId: selectedMapping.assistantId,
      bindingScope: selectedMapping.bindingScope,
      boundGuildId: selectedMapping.bindingScope === 'guild' ? selectedMapping.externalChannelId : null,
      replyMode,
      source,
    })

    // Insert into inbound_events queue
    const { data: insertedEvent, error } = await this.supabase
      .from('assistant_inbound_events')
      .insert({
        id: envelope.inboundEventId,
        channel_id: envelope.channelId,
        assistant_id: envelope.assistantId,
        external_message_id: envelope.externalMessageId,
        external_user_id: envelope.externalUserId,
        external_chat_id: envelope.externalChatId,
        message_text: envelope.normalizedText,
        message_data: envelope.messageData,
        status: 'pending',
      })
      .select('id, assistant_id, external_message_id')
      .single()

    if (error) {
      if (isDuplicateInboundInsertError(error)) {
        console.log(`[discord-gw] Duplicate inbound ignored: ${msg.id} → ${selectedMapping.internalChannelId}`)
        span.setStatus({ code: SpanStatusCode.OK })
      } else {
        console.error('[discord-gw] Failed to insert event:', error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'insert_failed' })
      }
    } else {
      console.log(
        `[discord-gw] ✅ Event queued: ${msg.id} → ${selectedMapping.internalChannelId}`,
      )
      span.setStatus({ code: SpanStatusCode.OK })
      const followUps: Promise<unknown>[] = [
        this.addAckReaction(msg, client, selectedMapping.ackReaction),
        this.addTypingIndicator(msg, client, selectedMapping.typingReaction),
      ]
      if (insertedEvent && this.onInboundQueued) {
        followUps.push(
          Promise.resolve(
            this.onInboundQueued({
              ...insertedEvent,
              org_id: selectedMapping.orgId ?? undefined,
            }),
          ),
        )
      }
      await Promise.allSettled(followUps)
    }
    span.end()
  }

  private async addAckReaction(
    msg: DiscordMessageCreate,
    client: ManagedClient,
    reactionName: string | null,
  ): Promise<void> {
    const emoji = this.normalizeReactionEmoji(reactionName)
    if (!emoji) return

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${encodeURIComponent(msg.channel_id)}/messages/${encodeURIComponent(msg.id)}/reactions/${encodeURIComponent(emoji)}/@me`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bot ${client.botToken}`,
          },
        },
      )
      if (!response.ok && response.status !== 204) {
        console.warn('[discord-gw] Failed to add ack reaction', {
          channelId: msg.channel_id,
          messageId: msg.id,
          reactionName,
          status: response.status,
        })
      }
    } catch (error) {
      console.warn('[discord-gw] Failed to add ack reaction', {
        channelId: msg.channel_id,
        messageId: msg.id,
        reactionName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async addTypingIndicator(
    msg: DiscordMessageCreate,
    client: ManagedClient,
    reactionName: string | null,
  ): Promise<void> {
    if (!reactionName) return

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${encodeURIComponent(msg.channel_id)}/typing`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${client.botToken}`,
          },
        },
      )
      if (!response.ok && response.status !== 204) {
        console.warn('[discord-gw] Failed to start typing indicator', {
          channelId: msg.channel_id,
          messageId: msg.id,
          status: response.status,
        })
      }
    } catch (error) {
      console.warn('[discord-gw] Failed to start typing indicator', {
        channelId: msg.channel_id,
        messageId: msg.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Check if a message should be processed based on routing config.
   */
  private shouldProcessMessage(
    msg: DiscordMessageCreate,
    client: ManagedClient,
    mapping: ChannelMapping,
    config: InboundRoutingConfig,
    threadContext: DiscordThreadContext | null,
  ): boolean {
    // Dedicated channel: respond to everything
    if (mapping.bindingScope === 'channel' && config.dedicated_channel) return true

    if (
      mapping.bindingScope === 'channel' &&
      threadContext?.parentChannelId === mapping.externalChannelId &&
      config.thread_support === true
    ) {
      return true
    }

    if (
      mapping.bindingScope === 'guild' &&
      mapping.dedicatedChannelIds.includes(threadContext?.parentChannelId ?? msg.channel_id)
    ) {
      return true
    }

    if (mapping.bindingScope === 'guild' && threadContext && config.thread_support === true) {
      return true
    }

    // Prefix match
    if (config.prefix && msg.content.startsWith(config.prefix)) return true

    // Reply-to-bot match
    if (client.botUserId && this.isReplyToBot(msg, client.botUserId)) {
      return true
    }

    // @mention match
    if (config.respond_on_mention && client.botUserId) {
      const mentioned = this.isBotMentioned(msg, client.botUserId)
      if (mentioned) return true
    }

    // No match
    return false
  }

  private async getThreadContext(
    msg: DiscordMessageCreate,
    client: ManagedClient,
  ): Promise<DiscordThreadContext | null> {
    if (!msg.guild_id) return null

    const cache = client.threadChannelCache ?? new Map<string, { parentChannelId: string | null; isThread: boolean; expiresAt: number }>()
    if (!client.threadChannelCache) {
      client.threadChannelCache = cache
    }

    const cached = cache.get(msg.channel_id)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.isThread
        ? { threadId: msg.channel_id, parentChannelId: cached.parentChannelId }
        : null
    }

    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${msg.channel_id}`, {
        headers: { Authorization: `Bot ${client.botToken}` },
      })

      if (!response.ok) {
        cache.set(msg.channel_id, {
          parentChannelId: null,
          isThread: false,
          expiresAt: Date.now() + 30_000,
        })
        return null
      }

      const payload = (await response.json()) as { type?: number; parent_id?: string | null }
      const isThread = payload.type === 10 || payload.type === 11 || payload.type === 12
      const parentChannelId =
        typeof payload.parent_id === 'string' && payload.parent_id.trim().length > 0
          ? payload.parent_id.trim()
          : null

      cache.set(msg.channel_id, {
        parentChannelId,
        isThread,
        expiresAt: Date.now() + 5 * 60_000,
      })

      return isThread ? { threadId: msg.channel_id, parentChannelId } : null
    } catch {
      cache.set(msg.channel_id, {
        parentChannelId: null,
        isThread: false,
        expiresAt: Date.now() + 30_000,
      })
      return null
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  private decryptSecrets(encrypted: string): Record<string, string> {
    return decryptChannelSecrets(encrypted, this.encryptionKey)
  }

  /**
   * Always use the `ws` package for Discord gateway traffic.
   * The raw debug listener that successfully received MESSAGE_CREATE also used
   * `ws`, while the global Node WebSocket path has been inconsistent here.
   */
  private async getWebSocket(): Promise<typeof WebSocket> {
    const { default: WS } = await import('ws')
    return WS as unknown as typeof WebSocket
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  getStats(): {
    clients: number
    channels: number
    clientDetails: Array<{
      tokenHash: string
      channels: number
      botUserId: string | null
      connected: boolean
      lastStartAt: string | null
      lastError: string | null
      presence: DiscordPresenceSnapshot | null
    }>
  } {
    const clientDetails = Array.from(this.clients.values()).map((c) => ({
      tokenHash: c.tokenHash.slice(0, 8) + '...',
      channels: c.channels.size,
      botUserId: c.botUserId,
      connected: c.connected,
      lastStartAt: c.lastStartAt,
      lastError: c.lastError,
      presence: c.currentPresence,
    }))

    return {
      clients: this.clients.size,
      channels: Array.from(this.clients.values()).reduce(
        (sum, c) => sum + c.channels.size,
        0,
      ),
      clientDetails,
    }
  }
}
