'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import {
  ChannelAgentRoster,
  ChannelAliasManager,
  ChannelDefaultBadge,
  ChannelOwnershipCard,
} from '@/components/assistant/channel-admin-blocks'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

export interface DiscordSharePanelProps {
  assistantId: string
  connectedChannel?: AssistantChannel | null
  onRefreshChannels?: () => Promise<void> | void
  onBack?: () => void
}

interface DiscordOpsStatus {
  configured: boolean
  running: boolean
  lastStartAt: string | null
  lastProbeAt: string | null
  lastError: string | null
  presence?: {
    status: 'online' | 'idle' | 'dnd' | 'invisible'
    activity: { name: string; state?: string | null } | null
    updatedAt: string
  } | null
  probe?: {
    ok: boolean
    status: number | null
    error: string | null
    elapsedMs: number
    bot?: { id?: string | null; username?: string | null }
    application?: {
      intents?: {
        messageContent: string
        guildMembers: string
        presence: string
      }
    } | null
  } | null
  stats?: {
    clients: number
    channels: number
    clientDetails: Array<{
      tokenHash: string
      channels: number
      botUserId: string | null
      connected: boolean
      lastStartAt: string | null
      lastError: string | null
      presence?: {
        status: 'online' | 'idle' | 'dnd' | 'invisible'
        activity: { name: string; state?: string | null } | null
        updatedAt: string
      } | null
    }>
  } | null
  voiceSessions?: Array<{
    guildId: string
    channelId: string
    assistantId: string
    connected: boolean
  }>
}

interface DiscordAliasSummary {
  id: string
  alias: string
}

interface DiscordGuildAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  aliases: DiscordAliasSummary[]
  isDefault: boolean
  isCurrentAssistant: boolean
}

interface DiscordDefaultAssistantSummary {
  assistantId: string
  assistantName: string
  bindingChannelId: string
  aliases: DiscordAliasSummary[]
  isCurrentAssistant: boolean
}

interface DiscordGuildChannelAssignment {
  id: string
  name: string
  type: 'text' | 'announcement'
  parentId: string | null
  parentName: string | null
  position: number
  assignedAssistantId: string | null
  assignedAssistantName: string | null
  assignedBindingChannelId: string | null
  usesGuildDefault: boolean
}

const DISCORD_LINE_LIMIT_OPTIONS = [8, 12, 17, 24, 32] as const
const DISCORD_REACTION_OPTIONS = [
  { value: 'eyes', emoji: '👀', name: 'Eyes' },
  { value: 'hourglass_flowing_sand', emoji: '⏳', name: 'Hourglass' },
  { value: 'wave', emoji: '👋', name: 'Wave' },
  { value: 'thinking_face', emoji: '🤔', name: 'Thinking' },
] as const

type DiscordReactionValue = (typeof DISCORD_REACTION_OPTIONS)[number]['value'] | null
type DiscordStreamingMode = 'off' | 'partial' | 'block' | 'progress'
type DiscordThreadHistoryScope = 'thread' | 'channel'

function normalizeDiscordReactionValue(value: unknown): DiscordReactionValue {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return DISCORD_REACTION_OPTIONS.some((option) => option.value === trimmed)
    ? (trimmed as DiscordReactionValue)
    : null
}

function getReactionOption(value: string | null | undefined) {
  return DISCORD_REACTION_OPTIONS.find((option) =>
    option.value === value,
  ) ?? DISCORD_REACTION_OPTIONS[0]
}

function getDiscordRoutingConfig(
  channel: AssistantChannel | null | undefined,
): {
  prefix: string | null
  respondOnMention: boolean
  threadSupport: boolean
  ignoreBots: boolean
} {
  const config =
    channel?.inbound_routing_config && typeof channel.inbound_routing_config === 'object'
      ? channel.inbound_routing_config
      : {}

  const prefix =
    typeof config.prefix === 'string' && config.prefix.trim().length > 0
      ? config.prefix.trim()
      : null

  return {
    prefix,
    respondOnMention: config.respond_on_mention !== false,
    threadSupport: config.thread_support === true,
    ignoreBots: config.ignore_bots !== false,
  }
}

function getDiscordReplyToMode(
  channel: AssistantChannel | null | undefined,
): 'off' | 'first' | 'all' {
  const configured = channel?.channel_config?.discord_reply_to_mode
  return configured === 'off' || configured === 'all' || configured === 'first'
    ? configured
    : 'first'
}

function getDiscordMaxLinesPerMessage(
  channel: AssistantChannel | null | undefined,
): number {
  const raw = channel?.channel_config?.discord_max_lines_per_message
  const parsed =
    typeof raw === 'number'
      ? raw
      : Number.parseInt(typeof raw === 'string' ? raw : '', 10)
  return Number.isFinite(parsed) && parsed >= 4 && parsed <= 40 ? parsed : 17
}

function getDiscordVoiceMode(
  channel: AssistantChannel | null | undefined,
): 'off' | 'auto' | 'always' {
  const configured = channel?.channel_config?.discord_voice_mode
  return configured === 'off' || configured === 'always' || configured === 'auto'
    ? configured
    : 'auto'
}

function getDiscordChunkMode(
  channel: AssistantChannel | null | undefined,
): 'length' | 'newline' {
  return channel?.channel_config?.discord_chunk_mode === 'newline' ? 'newline' : 'length'
}

function getDiscordStreamingPreview(
  channel: AssistantChannel | null | undefined,
): boolean {
  return channel?.channel_config?.discord_streaming_preview !== false
}

function getDiscordStreamingMode(
  channel: AssistantChannel | null | undefined,
): DiscordStreamingMode {
  const configured = channel?.channel_config?.discord_streaming_mode
  return configured === 'off' || configured === 'block' || configured === 'progress'
    ? configured
    : 'partial'
}

function getDiscordAckReaction(
  channel: AssistantChannel | null | undefined,
): DiscordReactionValue {
  const config =
    channel?.channel_config && typeof channel.channel_config === 'object'
      ? channel.channel_config
      : null
  if (!config) return 'eyes'
  if (Object.prototype.hasOwnProperty.call(config, 'discord_ack_reaction')) {
    return normalizeDiscordReactionValue(config.discord_ack_reaction)
  }
  return 'eyes'
}

function getDiscordTypingReaction(
  channel: AssistantChannel | null | undefined,
): DiscordReactionValue {
  const config =
    channel?.channel_config && typeof channel.channel_config === 'object'
      ? channel.channel_config
      : null
  if (!config) return 'hourglass_flowing_sand'
  if (Object.prototype.hasOwnProperty.call(config, 'discord_typing_reaction')) {
    return normalizeDiscordReactionValue(config.discord_typing_reaction)
  }
  return 'hourglass_flowing_sand'
}

function getDiscordThreadHistoryScope(
  channel: AssistantChannel | null | undefined,
): DiscordThreadHistoryScope {
  return channel?.channel_config?.discord_thread_history_scope === 'channel'
    ? 'channel'
    : 'thread'
}

function getDiscordThreadInheritParent(
  channel: AssistantChannel | null | undefined,
): boolean {
  return channel?.channel_config?.discord_thread_inherit_parent === true
}

function getDiscordThreadInitialHistoryLimit(
  channel: AssistantChannel | null | undefined,
): string {
  const raw = channel?.channel_config?.discord_thread_initial_history_limit
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? String(raw) : ''
}

function getDiscordAllowedUsers(
  channel: AssistantChannel | null | undefined,
): string[] {
  const raw = channel?.channel_config?.discord_allowed_user_ids
  return Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : []
}

function formatClock(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString()
}

function summarizeDiscordDelivery(params: {
  replyToMode: 'off' | 'first' | 'all'
  chunkMode: 'length' | 'newline'
  maxLinesPerMessage: number
  streamingPreview: boolean
  streamingMode: DiscordStreamingMode
  ackReaction: DiscordReactionValue
  typingReaction: DiscordReactionValue
  threadHistoryScope: DiscordThreadHistoryScope
  threadInheritParent: boolean
  threadInitialHistoryLimit: string
}) {
  const replyLabel =
    params.replyToMode === 'all'
      ? 'Reply on every chunk'
      : params.replyToMode === 'off'
        ? 'Post without reply reference'
        : 'Reply on first chunk'
  const chunkLabel = params.chunkMode === 'newline' ? 'Newline-aware chunking' : 'Balanced chunking'
  const contextLabel =
    params.threadHistoryScope === 'channel' ? 'channel context in threads' : 'thread-only context'
  const inheritLabel = params.threadInheritParent ? 'inherit parent' : 'no parent inherit'
  const limitLabel =
    params.threadInitialHistoryLimit.trim().length > 0
      ? `last ${params.threadInitialHistoryLimit.trim()} messages`
      : 'default history'
  return `${replyLabel} • ${chunkLabel} • ${params.maxLinesPerMessage} lines • live preview ${params.streamingPreview ? 'on' : 'off'} • mode ${params.streamingMode} • ack ${params.ackReaction ? getReactionOption(params.ackReaction).emoji : 'off'} • typing ${params.typingReaction ? getReactionOption(params.typingReaction).emoji : 'off'} • ${contextLabel} • ${inheritLabel} • ${limitLabel}`
}

function summarizeDiscordRouting(params: {
  dedicatedChannelCount: number
  prefix: string | null
  respondOnMention: boolean
  threadSupport: boolean
  ignoreBots: boolean
  allowedUsersCount: number
}) {
  const parts: string[] = []
  if (params.dedicatedChannelCount > 0) {
    parts.push(
      `${params.dedicatedChannelCount} dedicated channel${params.dedicatedChannelCount === 1 ? '' : 's'}`,
    )
  }
  if (params.respondOnMention) {
    parts.push('@mentions')
  }
  if (params.prefix) {
    parts.push(`prefix ${params.prefix}`)
  }
  if (params.threadSupport) {
    parts.push('thread continuation')
  }
  if (params.ignoreBots) {
    parts.push('ignore bots')
  }
  if (params.allowedUsersCount > 0) {
    parts.push(`${params.allowedUsersCount} allowed user${params.allowedUsersCount === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? parts.join(' • ') : 'No routing triggers configured'
}

function summarizeDiscordVoice(params: {
  voiceMode: 'off' | 'auto' | 'always'
  voiceId: string | null
}) {
  if (params.voiceId) return `${params.voiceMode} • ${params.voiceId}`
  return params.voiceMode
}

export function DiscordSharePanel({
  assistantId,
  connectedChannel = null,
  onRefreshChannels,
  onBack,
}: DiscordSharePanelProps) {
  const router = useRouter()
  const toast = useToast()

  const guildName =
    typeof connectedChannel?.channel_config?.discord_guild_name === 'string' &&
    connectedChannel.channel_config.discord_guild_name.trim().length > 0
      ? connectedChannel.channel_config.discord_guild_name.trim()
      : null
  const initialDedicatedChannelIds = Array.isArray(
    connectedChannel?.channel_config?.discord_dedicated_channel_ids,
  )
    ? connectedChannel.channel_config.discord_dedicated_channel_ids
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : []
  const dedicatedChannelsSyncValue = initialDedicatedChannelIds.join('\n')

  const [isInstalling, setIsInstalling] = useState(false)
  const [dedicatedChannelsInput, setDedicatedChannelsInput] = useState(dedicatedChannelsSyncValue)
  const [prefix, setPrefix] = useState<string>(getDiscordRoutingConfig(connectedChannel).prefix ?? '')
  const [respondOnMention, setRespondOnMention] = useState<boolean>(
    getDiscordRoutingConfig(connectedChannel).respondOnMention,
  )
  const [threadSupport, setThreadSupport] = useState<boolean>(
    getDiscordRoutingConfig(connectedChannel).threadSupport,
  )
  const [ignoreBots, setIgnoreBots] = useState<boolean>(
    getDiscordRoutingConfig(connectedChannel).ignoreBots,
  )
  const [allowedUsersInput, setAllowedUsersInput] = useState<string>(
    getDiscordAllowedUsers(connectedChannel).join('\n'),
  )
  const [streamingPreview, setStreamingPreview] = useState<boolean>(
    getDiscordStreamingPreview(connectedChannel),
  )
  const [streamingMode, setStreamingMode] = useState<DiscordStreamingMode>(
    getDiscordStreamingMode(connectedChannel),
  )
  const [ackReaction, setAckReaction] = useState<DiscordReactionValue>(
    getDiscordAckReaction(connectedChannel),
  )
  const [typingReaction, setTypingReaction] = useState<DiscordReactionValue>(
    getDiscordTypingReaction(connectedChannel),
  )
  const [threadHistoryScope, setThreadHistoryScope] = useState<DiscordThreadHistoryScope>(
    getDiscordThreadHistoryScope(connectedChannel),
  )
  const [threadInheritParent, setThreadInheritParent] = useState<boolean>(
    getDiscordThreadInheritParent(connectedChannel),
  )
  const [threadInitialHistoryLimit, setThreadInitialHistoryLimit] = useState<string>(
    getDiscordThreadInitialHistoryLimit(connectedChannel),
  )
  const [replyToMode, setReplyToMode] = useState<'off' | 'first' | 'all'>(
    getDiscordReplyToMode(connectedChannel),
  )
  const [maxLinesPerMessage, setMaxLinesPerMessage] = useState<number>(
    getDiscordMaxLinesPerMessage(connectedChannel),
  )
  const [chunkMode, setChunkMode] = useState<'length' | 'newline'>(
    getDiscordChunkMode(connectedChannel),
  )
  const [isSavingRouting, setIsSavingRouting] = useState(false)
  const [opsStatus, setOpsStatus] = useState<DiscordOpsStatus | null>(null)
  const [isLoadingOps, setIsLoadingOps] = useState(false)
  const [isProbingOps, setIsProbingOps] = useState(false)
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [guildAgents, setGuildAgents] = useState<DiscordGuildAgentSummary[]>([])
  const [defaultAssistant, setDefaultAssistant] =
    useState<DiscordDefaultAssistantSummary | null>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null)
  const [isSavingDefault, setIsSavingDefault] = useState(false)
  const [guildChannels, setGuildChannels] = useState<DiscordGuildChannelAssignment[]>([])
  const [isLoadingGuildChannels, setIsLoadingGuildChannels] = useState(false)
  const [savingChannelId, setSavingChannelId] = useState<string | null>(null)
  const [channelSelections, setChannelSelections] = useState<Record<string, string>>({})
  const [isGuildSettingsOpen, setIsGuildSettingsOpen] = useState(false)
  const [activeChannelSettingsId, setActiveChannelSettingsId] = useState<string | null>(null)
  const [channelDialogSelection, setChannelDialogSelection] = useState('__default__')

  useEffect(() => {
    setDedicatedChannelsInput(dedicatedChannelsSyncValue)
    const routingConfig = getDiscordRoutingConfig(connectedChannel)
    setPrefix(routingConfig.prefix ?? '')
    setRespondOnMention(routingConfig.respondOnMention)
    setThreadSupport(routingConfig.threadSupport)
    setIgnoreBots(routingConfig.ignoreBots)
    setAllowedUsersInput(getDiscordAllowedUsers(connectedChannel).join('\n'))
    setStreamingPreview(getDiscordStreamingPreview(connectedChannel))
    setStreamingMode(getDiscordStreamingMode(connectedChannel))
    setAckReaction(getDiscordAckReaction(connectedChannel))
    setTypingReaction(getDiscordTypingReaction(connectedChannel))
    setThreadHistoryScope(getDiscordThreadHistoryScope(connectedChannel))
    setThreadInheritParent(getDiscordThreadInheritParent(connectedChannel))
    setThreadInitialHistoryLimit(getDiscordThreadInitialHistoryLimit(connectedChannel))
    setReplyToMode(getDiscordReplyToMode(connectedChannel))
    setMaxLinesPerMessage(getDiscordMaxLinesPerMessage(connectedChannel))
    setChunkMode(getDiscordChunkMode(connectedChannel))
  }, [connectedChannel, dedicatedChannelsSyncValue])

  const guildId =
    typeof connectedChannel?.external_channel_id === 'string' &&
    connectedChannel.external_channel_id.trim().length > 0
      ? connectedChannel.external_channel_id.trim()
      : null

  const currentGuildAgent = useMemo(
    () => guildAgents.find((agent) => agent.isCurrentAssistant) ?? null,
    [guildAgents],
  )

  const aliasConflictAgent = useMemo(() => {
    const normalizedDraft = aliasDraft.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalizedDraft) return null
    return (
      guildAgents.find((agent) =>
        agent.aliases.some(
          (alias) => alias.alias.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedDraft,
        ),
      ) ?? null
    )
  }, [aliasDraft, guildAgents])

  const hasForeignDefault = Boolean(defaultAssistant && !defaultAssistant.isCurrentAssistant)

  const parseDedicatedChannelIds = useCallback((raw: string): string[] => {
    const found = new Set<string>()

    const mentionMatches = raw.matchAll(/<#(\d{16,24})>/g)
    for (const match of mentionMatches) {
      found.add(match[1])
    }

    const urlMatches = raw.matchAll(/discord\.com\/channels\/\d{16,24}\/(\d{16,24})/g)
    for (const match of urlMatches) {
      found.add(match[1])
    }

    for (const token of raw.split(/[\s,]+/)) {
      const trimmed = token.trim()
      if (/^\d{16,24}$/.test(trimmed)) {
        found.add(trimmed)
      }
    }

    return Array.from(found)
  }, [])

  const parsedDedicatedChannelIds = useMemo(
    () => parseDedicatedChannelIds(dedicatedChannelsInput),
    [dedicatedChannelsInput, parseDedicatedChannelIds],
  )
  const parsedAllowedUsers = useMemo(
    () =>
      Array.from(
        new Set(
          allowedUsersInput
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter((value) => /^\d{16,24}$/.test(value)),
        ),
      ),
    [allowedUsersInput],
  )
  const hasDedicatedChannels = parsedDedicatedChannelIds.length > 0

  const configuredVoiceMode = getDiscordVoiceMode(connectedChannel)
  const configuredVoiceId =
    typeof connectedChannel?.channel_config?.discord_voice_id === 'string' &&
    connectedChannel.channel_config.discord_voice_id.trim().length > 0
      ? connectedChannel.channel_config.discord_voice_id.trim()
      : null

  const summaryDelivery = summarizeDiscordDelivery({
    replyToMode,
    chunkMode,
    maxLinesPerMessage,
    streamingPreview,
    streamingMode,
    ackReaction,
    typingReaction,
    threadHistoryScope,
    threadInheritParent,
    threadInitialHistoryLimit,
  })
  const summaryRouting = summarizeDiscordRouting({
    dedicatedChannelCount: parsedDedicatedChannelIds.length,
    prefix: prefix.trim().length > 0 ? prefix.trim() : null,
    respondOnMention,
    threadSupport,
    ignoreBots,
    allowedUsersCount: parsedAllowedUsers.length,
  })
  const summaryVoice = summarizeDiscordVoice({
    voiceMode: configuredVoiceMode,
    voiceId: configuredVoiceId,
  })

  const guildAgentOptions = useMemo(
    () =>
      guildAgents.map((agent) => ({
        assistantId: agent.assistantId,
        assistantName: agent.assistantName,
      })),
    [guildAgents],
  )

  const activeChannelSettings = useMemo(
    () => guildChannels.find((channel) => channel.id === activeChannelSettingsId) ?? null,
    [activeChannelSettingsId, guildChannels],
  )

  useEffect(() => {
    if (!activeChannelSettings) return
    setChannelDialogSelection(activeChannelSettings.assignedAssistantId ?? '__default__')
  }, [activeChannelSettings])

  const loadDiscordAdmin = useCallback(async () => {
    if (!guildId) {
      setGuildAgents([])
      setDefaultAssistant(null)
      return
    }

    setIsLoadingAdmin(true)
    try {
      const response = await fetch(
        `/api/assistants/${assistantId}/discord-admin?guildId=${encodeURIComponent(guildId)}`,
      )
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            bindings?: DiscordGuildAgentSummary[]
            defaultAssistant?: DiscordDefaultAssistantSummary | null
          }
        | null

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Discord agent ownership')
      }

      setGuildAgents(Array.isArray(payload?.bindings) ? payload.bindings : [])
      setDefaultAssistant(
        payload?.defaultAssistant && typeof payload.defaultAssistant === 'object'
          ? payload.defaultAssistant
          : null,
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load Discord agent ownership',
      )
    } finally {
      setIsLoadingAdmin(false)
    }
  }, [assistantId, guildId, toast])

  const loadDiscordGuildChannels = useCallback(async () => {
    if (!guildId) {
      setGuildChannels([])
      setChannelSelections({})
      return
    }

    setIsLoadingGuildChannels(true)
    try {
      const response = await fetch(
        `/api/assistants/${assistantId}/discord-channels?guildId=${encodeURIComponent(guildId)}`,
      )
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; channels?: DiscordGuildChannelAssignment[] }
        | null

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Discord channels')
      }

      const channels = Array.isArray(payload?.channels) ? payload.channels : []
      setGuildChannels(channels)
      setChannelSelections(
        Object.fromEntries(
          channels.map((channel) => [channel.id, channel.assignedAssistantId ?? '__default__']),
        ),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Discord channels')
    } finally {
      setIsLoadingGuildChannels(false)
    }
  }, [assistantId, guildId, toast])

  const loadDiscordOpsStatus = useCallback(
    async (mode: 'status' | 'probe' = 'status') => {
      if (!connectedChannel) return
      if (mode === 'probe') setIsProbingOps(true)
      else setIsLoadingOps(true)

      try {
        const response = await fetch(
          `/api/assistants/${assistantId}/channels/${connectedChannel.id}/discord-status`,
          { method: mode === 'probe' ? 'POST' : 'GET' },
        )
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error || 'Failed to load Discord status')
        }

        const payload = (await response.json()) as DiscordOpsStatus
        setOpsStatus(payload)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load Discord status')
      } finally {
        setIsLoadingOps(false)
        setIsProbingOps(false)
      }
    },
    [assistantId, connectedChannel, toast],
  )

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as
        | { type?: string; level?: 'success' | 'error'; message?: string }
        | undefined

      if (data?.type !== 'discord-install-result') return

      if (data.level === 'success') {
        toast.success(data.message || 'Discord bot installed')
      } else {
        toast.error(data.message || 'Discord install failed')
      }

      void Promise.resolve(onRefreshChannels?.()).finally(() => {
        router.refresh()
      })
      setIsInstalling(false)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onRefreshChannels, router, toast])

  useEffect(() => {
    if (!connectedChannel) {
      setOpsStatus(null)
      return
    }
    void loadDiscordOpsStatus('status')
  }, [connectedChannel, loadDiscordOpsStatus])

  useEffect(() => {
    if (!connectedChannel || !guildId) return
    void loadDiscordAdmin()
  }, [connectedChannel, guildId, loadDiscordAdmin])

  useEffect(() => {
    if (!connectedChannel || !guildId) return
    void loadDiscordGuildChannels()
  }, [connectedChannel, guildId, loadDiscordGuildChannels])

  const handleInstall = useCallback(() => {
    setIsInstalling(true)
    const width = 720
    const height = 760
    const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0)
    const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0)

    const popup = window.open(
      `/api/webhooks/discord/oauth/install?assistant_id=${encodeURIComponent(assistantId)}`,
      'discord-hosted-install',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    )

    if (!popup) {
      toast.error('Popup blocked', 'Please allow popups for this site and try again.')
      setIsInstalling(false)
      return
    }
  }, [assistantId, toast])

  const handleSaveDedicatedChannels = useCallback(async () => {
    if (!connectedChannel) return

    const dedicatedChannelIds = parseDedicatedChannelIds(dedicatedChannelsInput)
    const parsedThreadInitialHistoryLimit =
      threadInitialHistoryLimit.trim().length > 0
        ? Number.parseInt(threadInitialHistoryLimit.trim(), 10)
        : null
    if (
      parsedThreadInitialHistoryLimit !== null &&
      (!Number.isInteger(parsedThreadInitialHistoryLimit) || parsedThreadInitialHistoryLimit < 0)
    ) {
      toast.error('Thread history limit must be a whole number greater than or equal to 0.')
      return
    }
    setIsSavingRouting(true)

    try {
      const res = await fetch(`/api/assistants/${assistantId}/channels`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: connectedChannel.id,
          dedicatedChannelIds,
          prefix: prefix.trim().length > 0 ? prefix.trim() : null,
          respondOnMention,
          threadSupport,
          ignoreBots,
          allowedUsers: parsedAllowedUsers,
          ackReaction,
          typingReaction,
          streamingPreview,
          streamingMode,
          replyToMode,
          threadHistoryScope,
          threadInheritParent,
          threadInitialHistoryLimit: parsedThreadInitialHistoryLimit,
          maxLinesPerMessage,
          chunkMode,
        }),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to update Discord routing')
      }

      toast.success(
        'Discord settings updated',
        dedicatedChannelIds.length > 0
          ? `${dedicatedChannelIds.length} dedicated channel${dedicatedChannelIds.length === 1 ? '' : 's'} saved`
          : 'Mention-only routing saved',
      )

      await Promise.resolve(onRefreshChannels?.())
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update Discord routing')
    } finally {
      setIsSavingRouting(false)
    }
  }, [
    assistantId,
    chunkMode,
    connectedChannel,
    dedicatedChannelsInput,
    ignoreBots,
    maxLinesPerMessage,
    onRefreshChannels,
    parseDedicatedChannelIds,
    parsedAllowedUsers,
    prefix,
    replyToMode,
    router,
    respondOnMention,
    ackReaction,
    streamingPreview,
    streamingMode,
    threadSupport,
    threadHistoryScope,
    threadInheritParent,
    threadInitialHistoryLimit,
    typingReaction,
    toast,
  ])

  const handleCreateAlias = useCallback(async () => {
    const nextAlias = aliasDraft.trim()
    if (!guildId || nextAlias.length === 0) return

    if (aliasConflictAgent) {
      toast.error(
        aliasConflictAgent.isCurrentAssistant
          ? `"${nextAlias}" is already an alias for this agent.`
          : `"${nextAlias}" is already used by ${aliasConflictAgent.assistantName}.`,
      )
      return
    }

    setIsSavingAlias(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/discord-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          alias: nextAlias,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create Discord alias')
      }

      setAliasDraft('')
      toast.success('Discord alias added')
      await loadDiscordAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Discord alias')
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasConflictAgent, aliasDraft, assistantId, guildId, loadDiscordAdmin, router, toast])

  const handleDeleteAlias = useCallback(
    async (aliasId: string) => {
      if (!guildId) return

      setDeletingAliasId(aliasId)
      try {
        const response = await fetch(`/api/assistants/${assistantId}/discord-aliases`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guildId,
            aliasId,
          }),
        })
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to delete Discord alias')
        }

        toast.success('Discord alias removed')
        await loadDiscordAdmin()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete Discord alias')
      } finally {
        setDeletingAliasId(null)
      }
    },
    [assistantId, guildId, loadDiscordAdmin, router, toast],
  )

  const handleMakeDefault = useCallback(async () => {
    if (!guildId || !currentGuildAgent) return

    setIsSavingDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/discord-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          assistantId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update Discord default agent')
      }

      toast.success('Discord default agent updated')
      await loadDiscordAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update Discord default agent')
    } finally {
      setIsSavingDefault(false)
    }
  }, [assistantId, currentGuildAgent, guildId, loadDiscordAdmin, router, toast])

  const handleSaveChannelAssignment = useCallback(
    async (discordChannelId: string, assistantSelection?: string) => {
      if (!guildId) return

      const selectedAssistantId =
        assistantSelection ?? channelSelections[discordChannelId] ?? '__default__'
      setSavingChannelId(discordChannelId)
      try {
        const response = await fetch(`/api/assistants/${assistantId}/discord-channels`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guildId,
            discordChannelId,
            assistantId: selectedAssistantId === '__default__' ? null : selectedAssistantId,
          }),
        })
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to update Discord channel assignment')
        }

        toast.success(
          selectedAssistantId === '__default__'
            ? 'Discord channel now uses the guild default'
            : 'Discord channel assignment updated',
        )
        await loadDiscordGuildChannels()
        router.refresh()
        if (activeChannelSettingsId === discordChannelId) {
          setActiveChannelSettingsId(null)
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to update Discord channel assignment',
        )
      } finally {
        setSavingChannelId(null)
      }
    },
    [
      activeChannelSettingsId,
      assistantId,
      channelSelections,
      guildId,
      loadDiscordGuildChannels,
      router,
      toast,
    ],
  )

  const botLabel =
    opsStatus?.probe?.bot?.username ||
    opsStatus?.probe?.bot?.id ||
    opsStatus?.stats?.clientDetails?.[0]?.botUserId ||
    'unknown'
  const workerSummary = opsStatus?.stats
    ? `${opsStatus.stats.clients} client${opsStatus.stats.clients === 1 ? '' : 's'} • ${opsStatus.stats.channels} mapped channel${opsStatus.stats.channels === 1 ? '' : 's'}`
    : 'No worker stats yet'
  const probeSummary = opsStatus?.probe
    ? `${opsStatus.probe.ok ? 'ok' : 'failed'} • HTTP ${opsStatus.probe.status ?? 'n/a'} • ${opsStatus.probe.elapsedMs}ms`
    : 'No probe yet'
  const presenceSummary = opsStatus?.presence
    ? opsStatus.presence.activity?.state ||
      opsStatus.presence.activity?.name ||
      opsStatus.presence.status
    : 'No presence snapshot yet'
  const activeVoiceSession = opsStatus?.voiceSessions?.[0] ?? null
  const connectedTextChannels = guildChannels.length
  const overriddenChannels = guildChannels.filter((channel) => !channel.usesGuildDefault).length
  const defaultedChannels = guildChannels.filter((channel) => channel.usesGuildDefault).length

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 space-y-3">
      {onBack ? (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          >
            <span className="text-sm leading-none">←</span>
            Back
          </button>
        </div>
      ) : null}

      {connectedChannel ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px] font-medium">Discord connected</p>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {hasDedicatedChannels
              ? 'This agent is installed server-wide. It responds to mentions anywhere, and always answers inside the dedicated channels you configured.'
              : 'This agent is installed server-wide. It responds to mentions anywhere, and you can pin dedicated channels or per-channel ownership below.'}
          </p>

          {connectedChannel.external_channel_id ? (
            <p className="text-[10px] text-muted-foreground">
              Connected server:{' '}
              <span className={guildName ? 'text-foreground' : 'font-mono'}>
                {guildName ?? connectedChannel.external_channel_id}
              </span>
            </p>
          ) : null}

          {defaultAssistant ? (
            <p className="text-[10px] text-muted-foreground">
              Guild default:{' '}
              <span className="text-foreground">{defaultAssistant.assistantName}</span>
              {defaultAssistant.isCurrentAssistant ? ' (this assistant)' : ''}
            </p>
          ) : null}

          <div className="grid gap-1.5 sm:grid-cols-4">
            <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">Coverage</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {hasDedicatedChannels
                  ? `${parsedDedicatedChannelIds.length} dedicated channel${parsedDedicatedChannelIds.length === 1 ? '' : 's'}`
                  : 'Mention-only'}
              </p>
            </div>
            <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">Delivery</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{summaryDelivery}</p>
            </div>
            <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">Voice</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{summaryVoice}</p>
            </div>
            <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">Guild channels</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {connectedTextChannels > 0
                  ? `${overriddenChannels} override${overriddenChannels === 1 ? '' : 's'} • ${defaultedChannels} default`
                  : 'No inventory loaded yet'}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-medium text-foreground">Bot health</p>
                <p className="text-[10px] text-muted-foreground">
                  Live worker-backed status for the hosted Discord bot.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadDiscordOpsStatus('status')}
                  disabled={isLoadingOps || isProbingOps}
                  className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 text-[10px] text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingOps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void loadDiscordOpsStatus('probe')}
                  disabled={isLoadingOps || isProbingOps}
                  className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 text-[10px] text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProbingOps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Probe
                </button>
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-4">
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Configured</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {isLoadingOps ? 'Loading…' : opsStatus?.configured ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Running</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {isLoadingOps ? 'Loading…' : opsStatus?.running ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Last start</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatClock(opsStatus?.lastStartAt) ?? 'n/a'}
                </p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Last probe</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatClock(opsStatus?.lastProbeAt) ?? 'n/a'}
                </p>
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-4">
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Worker</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{workerSummary}</p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Bot</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{botLabel}</p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Presence</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {opsStatus?.presence?.status ?? 'unknown'}
                  <br />
                  {presenceSummary}
                </p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                <p className="text-[10px] font-medium text-foreground">Probe</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{probeSummary}</p>
              </div>
            </div>

            {opsStatus?.lastError ? (
              <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-200">
                {opsStatus.lastError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Install the shared Lucid bot into a Discord server. After install, it responds to mentions anywhere, and you can configure dedicated channels plus per-channel agent routing from here.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Available commands: <span className="font-mono">/agents</span>, <span className="font-mono">/switch</span>, <span className="font-mono">/whoami</span>, <span className="font-mono">/status</span>, <span className="font-mono">/probe</span>, <span className="font-mono">/models</span>, <span className="font-mono">/voice</span>, <span className="font-mono">/vc</span>, <span className="font-mono">/leave</span>.
          </p>
        </div>
      )}

      {connectedChannel ? (
        <>
          <ChannelOwnershipCard
            title="Guild ownership"
            description="Choose which Lucid agent is the default for this Discord server. Other connected agents stay available as explicit overrides."
            currentLabel={
              defaultAssistant
                ? `${defaultAssistant.assistantName}${defaultAssistant.isCurrentAssistant ? ' (this assistant)' : ''}`
                : 'No default agent configured yet'
            }
            actionLabel={
              currentGuildAgent?.isDefault ? 'This assistant is default' : 'Make this assistant default'
            }
            actionDisabled={isSavingDefault || !currentGuildAgent || currentGuildAgent.isDefault}
            actionBusy={isSavingDefault}
            onAction={() => void handleMakeDefault()}
            secondaryActionLabel="Open guild settings"
            secondaryActionDisabled={false}
            onSecondaryAction={() => setIsGuildSettingsOpen(true)}
            helper={
              hasForeignDefault
                ? 'Another agent currently owns the guild default, but you can switch it here.'
                : null
            }
            isLoading={isLoadingAdmin}
            onRefresh={() => void loadDiscordAdmin()}
          >
            <ChannelAliasManager
              description={
                <>
                  People can target this agent with names like <span className="font-mono">sales</span> in Discord commands and messages.
                </>
              }
              aliases={currentGuildAgent?.aliases ?? []}
              inputPlaceholder="Add a Discord alias"
              draft={aliasDraft}
              onDraftChange={setAliasDraft}
              onCreate={() => void handleCreateAlias()}
              onDelete={(aliasId) => void handleDeleteAlias(aliasId)}
              isSaving={isSavingAlias}
              deletingAliasId={deletingAliasId}
              conflictMessage={
                aliasConflictAgent
                  ? aliasConflictAgent.isCurrentAssistant
                    ? 'This alias already belongs to this assistant.'
                    : `This alias is already used by ${aliasConflictAgent.assistantName}.`
                  : null
              }
            />
            <ChannelAgentRoster
              title="Agents in this server"
              agents={guildAgents.map((agent) => ({
                key: agent.bindingChannelId,
                name: agent.assistantName,
                aliases: agent.aliases.map((alias) => alias.alias),
                isDefault: agent.isDefault,
                isCurrent: agent.isCurrentAssistant,
                meta: agent.assistantDescription ?? undefined,
              }))}
            />
          </ChannelOwnershipCard>

          <div className="space-y-3 rounded-md border border-border/40 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-foreground">Discord channels</p>
                <p className="text-[10px] text-muted-foreground">
                  Manage which agent owns each Discord text channel. Unassigned channels use the guild default.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadDiscordGuildChannels()}
                disabled={isLoadingGuildChannels}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                {isLoadingGuildChannels ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="space-y-2">
              {guildChannels.length > 0 ? (
                guildChannels.map((channel) => {
                  const selectedAssistantId = channelSelections[channel.id] ?? '__default__'
                  const persistedAssistantId = channel.assignedAssistantId ?? '__default__'
                  const isDirty = selectedAssistantId !== persistedAssistantId
                  const isSavingThisChannel = savingChannelId === channel.id

                  return (
                    <div
                      key={channel.id}
                      className="rounded-md border border-border/50 bg-background/60 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-[11px] font-medium text-foreground">
                              #{channel.name}
                            </p>
                            <ChannelDefaultBadge
                              kind={channel.usesGuildDefault ? 'default' : 'override'}
                            />
                            {channel.type === 'announcement' ? (
                              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                Announcement
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {channel.parentName ? `${channel.parentName} • ` : ''}
                            {channel.usesGuildDefault
                              ? `Using guild default${defaultAssistant ? ` (${defaultAssistant.assistantName})` : ''}`
                              : `Assigned to ${channel.assignedAssistantName ?? 'another agent'}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveChannelSettingsId(channel.id)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 px-2.5 text-[10px] text-foreground transition-colors hover:bg-background"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Settings
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveChannelAssignment(channel.id)}
                            disabled={!isDirty || isSavingThisChannel}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 px-2.5 text-[10px] text-foreground transition-colors hover:bg-background disabled:opacity-40"
                          >
                            {isSavingThisChannel ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-md border border-dashed border-border/50 bg-background/40 px-3 py-4">
                  <p className="text-[11px] text-foreground">No Discord channels loaded yet</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Refresh to fetch the current server channel inventory from the gateway worker.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      <button
        type="button"
        onClick={handleInstall}
        disabled={isInstalling}
        className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        {isInstalling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {connectedChannel ? 'Install on another Discord server' : 'Install on Discord'}
      </button>

      <p className="text-[10px] text-muted-foreground">
        After install, Discord slash commands appear in the selected server immediately.
      </p>

      <Dialog open={isGuildSettingsOpen} onOpenChange={setIsGuildSettingsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Discord guild settings</DialogTitle>
            <DialogDescription>
              Configure hosted Discord routing and delivery for this server-wide install.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
                <p className="text-[10px] font-medium text-foreground">Routing summary</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {summaryRouting}
                </p>
              </div>
              <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
                <p className="text-[10px] font-medium text-foreground">Voice summary</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {summaryVoice}. Use <span className="font-mono">/voice</span> and <span className="font-mono">/vc</span> in Discord for live voice behavior.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium text-foreground">Hosted bot health</p>
                  <p className="text-[10px] text-muted-foreground">
                    Runtime status for the shared Discord worker backing this server.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadDiscordOpsStatus('probe')}
                  disabled={isLoadingOps || isProbingOps}
                  className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 text-[10px] text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProbingOps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Probe
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Worker</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{workerSummary}</p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Presence</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{presenceSummary}</p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Voice sessions</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {activeVoiceSession
                      ? `${activeVoiceSession.connected ? 'Connected' : 'Connecting'} in ${activeVoiceSession.channelId}`
                      : 'No active hosted voice session'}
                  </p>
                </div>
              </div>
              {opsStatus?.stats?.clientDetails?.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium text-foreground">Gateway clients</p>
                  <div className="space-y-2">
                    {opsStatus.stats.clientDetails.map((client) => (
                      <div
                        key={client.tokenHash}
                        className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2"
                      >
                        <p className="text-[10px] font-medium text-foreground">{client.tokenHash}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {client.connected ? 'Connected' : 'Disconnected'} • {client.channels} mapped channel{client.channels === 1 ? '' : 's'} • bot {client.botUserId ?? 'unknown'}
                        </p>
                        {(client.lastError || client.lastStartAt) ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {client.lastStartAt ? `Started ${formatClock(client.lastStartAt)}` : 'Never started'}
                            {client.lastError ? ` • ${client.lastError}` : ''}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-foreground">Dedicated channels</p>
                <p className="text-[10px] text-muted-foreground">
                  Paste Discord channel links, <span className="font-mono">#mentions</span>, or raw channel IDs. Lucid will always answer there. Everywhere else stays mention-only unless you assign a specific channel owner.
                </p>
              </div>
              <textarea
                value={dedicatedChannelsInput}
                onChange={(event) => setDedicatedChannelsInput(event.target.value)}
                placeholder="https://discord.com/channels/.../1419760739840692348"
                className="min-h-[120px] w-full rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
              <div className="rounded-md border border-border/40 bg-background/50 px-3 py-2.5 space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="discord-dedicated-summary"
                    checked={hasDedicatedChannels}
                    disabled
                  />
                  <label htmlFor="discord-dedicated-summary" className="text-[11px] cursor-default">
                    Dedicated-channel mode is {hasDedicatedChannels ? 'active' : 'off'}
                  </label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {hasDedicatedChannels
                    ? `${parsedDedicatedChannelIds.length} dedicated channel${parsedDedicatedChannelIds.length === 1 ? '' : 's'} currently configured`
                    : 'No dedicated channels yet'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Command prefix</label>
                  <Input
                    value={prefix}
                    onChange={(event) => setPrefix(event.target.value)}
                    placeholder="!lucid"
                    className="h-9 text-xs"
                    maxLength={32}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Optional. Messages starting with this prefix trigger the agent without a mention.
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-3 py-2.5 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="discord-respond-on-mention"
                      checked={respondOnMention}
                      onCheckedChange={(checked) => setRespondOnMention(checked === true)}
                    />
                    <label htmlFor="discord-respond-on-mention" className="text-[11px] font-medium text-foreground">
                      Respond to @mentions
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="discord-thread-support"
                      checked={threadSupport}
                      onCheckedChange={(checked) => setThreadSupport(checked === true)}
                    />
                    <label htmlFor="discord-thread-support" className="text-[11px] font-medium text-foreground">
                      Continue inside Discord threads
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="discord-ignore-bots"
                      checked={ignoreBots}
                      onCheckedChange={(checked) => setIgnoreBots(checked === true)}
                    />
                    <label htmlFor="discord-ignore-bots" className="text-[11px] font-medium text-foreground">
                      Ignore messages from bots
                    </label>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Allowed Discord user IDs</label>
                  <textarea
                    value={allowedUsersInput}
                    onChange={(event) => setAllowedUsersInput(event.target.value)}
                    placeholder="123456789012345678"
                    className="min-h-[88px] w-full rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Optional. If set, only these Discord user IDs can trigger this agent in the hosted server.
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-3 py-2.5 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="discord-streaming-preview"
                      checked={streamingPreview}
                      onCheckedChange={(checked) => setStreamingPreview(checked === true)}
                    />
                    <label htmlFor="discord-streaming-preview" className="text-[11px] font-medium text-foreground">
                      Live preview while generating
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    When enabled, Discord sends a preview message and edits it as the answer streams.
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {parsedAllowedUsers.length > 0
                      ? `${parsedAllowedUsers.length} allowed user${parsedAllowedUsers.length === 1 ? '' : 's'} configured`
                      : 'No user allowlist configured'}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Streaming mode</label>
                  <Select
                    value={streamingMode}
                    onValueChange={(value) => setStreamingMode(value as DiscordStreamingMode)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose streaming mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="partial">Live edit preview</SelectItem>
                      <SelectItem value="block">Append chunk blocks</SelectItem>
                      <SelectItem value="progress">Progress status preview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Reply behavior</label>
                  <Select
                    value={replyToMode}
                    onValueChange={(value) => setReplyToMode(value as 'off' | 'first' | 'all')}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose reply threading behavior" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">Reply only on the first chunk</SelectItem>
                      <SelectItem value="all">Reply on every chunk</SelectItem>
                      <SelectItem value="off">Do not reply-reference the user message</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Chunk mode</label>
                  <Select
                    value={chunkMode}
                    onValueChange={(value) => setChunkMode(value as 'length' | 'newline')}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose chunking style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="length">Balanced length</SelectItem>
                      <SelectItem value="newline">Newline-aware</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Soft line cap</label>
                  <Select
                    value={String(maxLinesPerMessage)}
                    onValueChange={(value) => setMaxLinesPerMessage(Number.parseInt(value, 10))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose max lines" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCORD_LINE_LIMIT_OPTIONS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value} lines
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Ack reaction</label>
                  <Select
                    value={ackReaction ?? '__off__'}
                    onValueChange={(value) =>
                      setAckReaction(value === '__off__' ? null : (value as DiscordReactionValue))
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose ack reaction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__off__">Off</SelectItem>
                      {DISCORD_REACTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.emoji} {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Adds a visible reaction to the triggering Discord message as soon as Lucid accepts it.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Typing feedback</label>
                  <Select
                    value={typingReaction ?? '__off__'}
                    onValueChange={(value) =>
                      setTypingReaction(value === '__off__' ? null : (value as DiscordReactionValue))
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose typing feedback" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__off__">Off</SelectItem>
                      {DISCORD_REACTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.emoji} {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Discord uses the typing indicator while the agent is working. This keeps the same control-plane slot as Slack typing feedback.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Thread context</label>
                  <Select
                    value={threadHistoryScope}
                    onValueChange={(value) => setThreadHistoryScope(value as DiscordThreadHistoryScope)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose thread context" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thread">Thread only</SelectItem>
                      <SelectItem value="channel">Include parent channel context</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Initial history limit</label>
                  <Input
                    value={threadInitialHistoryLimit}
                    onChange={(event) => setThreadInitialHistoryLimit(event.target.value)}
                    placeholder="12"
                    className="h-9 text-xs"
                    inputMode="numeric"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Optional. Controls how many parent-thread or parent-channel messages seed new thread context.
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-3 py-2.5 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="discord-thread-inherit-parent"
                      checked={threadInheritParent}
                      onCheckedChange={(checked) => setThreadInheritParent(checked === true)}
                    />
                    <label htmlFor="discord-thread-inherit-parent" className="text-[11px] font-medium text-foreground">
                      Inherit parent context in new threads
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    When enabled, new thread conversations inherit the parent channel’s recent context before the first reply.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => void handleSaveDedicatedChannels()}
                disabled={isSavingRouting}
                className="h-9 rounded-md px-3 text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isSavingRouting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save settings
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeChannelSettings)}
        onOpenChange={(open) => {
          if (!open) setActiveChannelSettingsId(null)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {activeChannelSettings ? `#${activeChannelSettings.name}` : 'Discord channel settings'}
            </DialogTitle>
            <DialogDescription>
              Pick which Lucid agent owns this Discord channel. If you leave it on the guild default, mention routing still works normally.
            </DialogDescription>
          </DialogHeader>

          {activeChannelSettings ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
                  <p className="text-[10px] font-medium text-foreground">Current owner</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {activeChannelSettings.usesGuildDefault
                      ? `Guild default${defaultAssistant ? ` (${defaultAssistant.assistantName})` : ''}`
                      : activeChannelSettings.assignedAssistantName ?? 'Another agent'}
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
                  <p className="text-[10px] font-medium text-foreground">Location</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {activeChannelSettings.parentName
                      ? `${activeChannelSettings.parentName} • `
                      : ''}
                    {activeChannelSettings.type === 'announcement'
                      ? 'Announcement channel'
                      : 'Text channel'}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Assigned agent</label>
                <Select
                  value={channelDialogSelection}
                  onValueChange={setChannelDialogSelection}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use guild default</SelectItem>
                    {guildAgentOptions.map((agent) => (
                      <SelectItem key={agent.assistantId} value={agent.assistantId}>
                        {agent.assistantName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveChannelSettingsId(null)}
                  className="h-9 rounded-md px-3 text-xs font-medium border border-border/50 bg-background/70 text-foreground hover:bg-background transition-all duration-150"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleSaveChannelAssignment(
                      activeChannelSettings.id,
                      channelDialogSelection,
                    )
                  }
                  disabled={savingChannelId === activeChannelSettings.id}
                  className="h-9 rounded-md px-3 text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {savingChannelId === activeChannelSettings.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save channel owner
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
