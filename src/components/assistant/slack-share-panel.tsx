'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, ChevronDown, Loader2, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { isSlackInstalledUnbound } from '@/lib/channels/types'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SlackConversationOption {
  id: string
  name: string
  label: string
  type: 'public' | 'private' | 'mpim' | 'im'
  isPrivate: boolean
}

interface SlackActivitySnapshot {
  lastInboundAt: string | null
  lastInboundStatus: string | null
  lastOutboundAt: string | null
  lastOutboundStatus: string | null
  lastOutboundError: string | null
  lastReplyLatencyMs: number | null
}

interface SlackUserOption {
  id: string
  name: string
  displayName: string
  avatarUrl: string | null
}

interface SlackAliasSummary {
  id: string
  alias: string
}

interface SlackWorkspaceAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  installChannelId: string
  aliases: SlackAliasSummary[]
  boundConversationCount: number
  workspaceWideEnabled: boolean
  isCurrentAssistant: boolean
  isWorkspaceDefault: boolean
}

interface SlackSurfaceDefaultSummary {
  assistantId: string
  assistantName: string
  installChannelId: string
  aliases: SlackAliasSummary[]
  isCurrentAssistant: boolean
}

interface SlackBoundConversationBinding {
  channelId: string
  externalChannelId: string | null
  conversationLabel: string | null
  conversationType: 'public' | 'private' | 'mpim' | 'im' | null
  routingConfig: SlackRoutingConfig
  allowedUsers: string[]
  streamingPreview: boolean
  streamingMode: SlackStreamingMode
  nativeStreaming: boolean
  threadHistoryScope: SlackThreadHistoryScope
  threadInheritParent: boolean
  threadInitialHistoryLimit: number | null
  replyToMode: SlackReplyToMode
  ackReaction: string | null
  typingReaction: string | null
  workspaceWideEnabled?: boolean
  activity: SlackActivitySnapshot | null
}

interface SlackOpsStatus {
  configured: boolean
  running: boolean
  lastStartAt: string | null
  lastRefreshAt: string | null
  lastProbeAt: string | null
  lastError: string | null
  probe?: {
    ok: boolean
    status: number | null
    error: string | null
    elapsedMs: number
    bot?: {
      id?: string | null
      name?: string | null
    }
    team?: {
      id?: string | null
      name?: string | null
    }
  } | null
  stats?: {
    clients: number
    channels: number
    clientDetails: Array<{
      tokenHash: string
      channels: number
      botUserId: string | null
      botName: string | null
      teamId: string | null
      connected: boolean
      lastStartAt: string | null
      lastError: string | null
    }>
  } | null
  snapshot?: SlackActivitySnapshot | null
}

interface SlackRoutingConfig {
  dedicated_channel: boolean
  prefix: string | null
  respond_on_mention: boolean
  thread_support: boolean
  ignore_bots: boolean
}

type SlackTypingReaction = string | null
type SlackAckReaction = string | null
type SlackThreadHistoryScope = 'thread' | 'channel'
type SlackReplyToMode = 'off' | 'first' | 'all'
type SlackStreamingMode = 'off' | 'partial' | 'block' | 'progress'

function formatActivityTimestamp(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatLatency(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return `${Math.round(value / 100) / 10}s`
}

function summarizeRoutingConfig(config: SlackRoutingConfig): string {
  const parts: string[] = []
  if (config.dedicated_channel) parts.push('every message')
  if (config.respond_on_mention) parts.push('@mentions')
  if (typeof config.prefix === 'string' && config.prefix.trim().length > 0) {
    parts.push(`prefix ${config.prefix.trim()}`)
  }
  if (config.thread_support) parts.push('threads')
  if (config.ignore_bots) parts.push('ignores bots')
  return parts.length > 0 ? parts.join(', ') : 'no message triggers'
}

const SLACK_REACTION_PREVIEW: Record<string, string> = {
  eyes: '👀',
  hourglass_flowing_sand: '⏳',
  white_check_mark: '✅',
  check: '✅',
  thumbs_up: '👍',
  wave: '👋',
  thinking_face: '🤔',
  speech_balloon: '💬',
  rocket: '🚀',
  warning: '⚠️',
  fire: '🔥',
  sparkles: '✨',
}

const SLACK_REACTION_OPTIONS = [
  { value: '__off__', emoji: '∅', name: 'Off' },
  { value: 'eyes', emoji: '👀', name: 'Eyes' },
  { value: 'hourglass_flowing_sand', emoji: '⏳', name: 'Hourglass' },
  { value: 'white_check_mark', emoji: '✅', name: 'Check' },
  { value: 'thumbs_up', emoji: '👍', name: 'Thumbs up' },
  { value: 'wave', emoji: '👋', name: 'Wave' },
  { value: 'thinking_face', emoji: '🤔', name: 'Thinking' },
  { value: 'speech_balloon', emoji: '💬', name: 'Speech balloon' },
  { value: 'rocket', emoji: '🚀', name: 'Rocket' },
  { value: 'warning', emoji: '⚠️', name: 'Warning' },
  { value: 'fire', emoji: '🔥', name: 'Fire' },
  { value: 'sparkles', emoji: '✨', name: 'Sparkles' },
] as const

function formatReactionDisplay(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) return '∅'
  const normalized = value.trim()
  const emoji = SLACK_REACTION_PREVIEW[normalized]
  return emoji ? emoji : `:${normalized}:`
}

function getReactionOption(value: string | null | undefined) {
  return SLACK_REACTION_OPTIONS.find((option) =>
    value == null ? option.value === '__off__' : option.value === value,
  ) ?? SLACK_REACTION_OPTIONS[0]
}

function getSlackUserInitials(user: SlackUserOption): string {
  const source = user.displayName.trim() || user.name.trim() || user.id
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function normalizeSlackAvatarUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : null
}

function SlackUserAvatar({ user, className = 'h-7 w-7' }: { user: SlackUserOption; className?: string }) {
  const avatarUrl = normalizeSlackAvatarUrl(user.avatarUrl)
  return (
    <Avatar className={className}>
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={user.displayName}
          width={56}
          height={56}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : null}
      <AvatarFallback className="text-[9px]">
        {getSlackUserInitials(user)}
      </AvatarFallback>
    </Avatar>
  )
}

export interface SlackSharePanelProps {
  assistantId: string
  connectedChannel?: AssistantChannel | null
  onRefreshChannels?: () => Promise<void> | void
  initialSettingsBindingChannelId?: string | null
  onInitialSettingsBindingHandled?: () => void
  onBack?: () => void
}

export function SlackSharePanel({
  assistantId,
  connectedChannel = null,
  onRefreshChannels,
  initialSettingsBindingChannelId = null,
  onInitialSettingsBindingHandled,
  onBack,
}: SlackSharePanelProps) {
  const router = useRouter()
  const [isInstalling, setIsInstalling] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [isBindingConversation, setIsBindingConversation] = useState(false)
  const [isUnbindingConversation, setIsUnbindingConversation] = useState(false)
  const [pendingConversationIds, setPendingConversationIds] = useState<string[]>([])
  const [conversations, setConversations] = useState<SlackConversationOption[]>([])
  const [users, setUsers] = useState<SlackUserOption[]>([])
  const [bindings, setBindings] = useState<SlackBoundConversationBinding[]>([])
  const [workspaceAgents, setWorkspaceAgents] = useState<SlackWorkspaceAgentSummary[]>([])
  const [surfaceDefault, setSurfaceDefault] = useState<SlackSurfaceDefaultSummary | null>(null)
  const [installChannelId, setInstallChannelId] = useState<string | null>(null)
  const [settingsBindingChannelId, setSettingsBindingChannelId] = useState<string | null>(null)
  const [isWorkspaceSettingsOpen, setIsWorkspaceSettingsOpen] = useState(false)
  const [deletingBindingChannelId, setDeletingBindingChannelId] = useState<string | null>(null)
  const [isAddChannelDialogOpen, setIsAddChannelDialogOpen] = useState(false)
  const [isUserDirectoryAvailable, setIsUserDirectoryAvailable] = useState(true)
  const [userDirectoryError, setUserDirectoryError] = useState<string | null>(null)
  const [activity, setActivity] = useState<SlackActivitySnapshot | null>(null)
  const [opsStatus, setOpsStatus] = useState<SlackOpsStatus | null>(null)
  const [isLoadingOps, setIsLoadingOps] = useState(false)
  const [isProbingOps, setIsProbingOps] = useState(false)
  const [routingConfig, setRoutingConfig] = useState<SlackRoutingConfig>({
    dedicated_channel: true,
    prefix: null,
    respond_on_mention: true,
    thread_support: false,
    ignore_bots: true,
  })
  const [isSavingRoutingConfig, setIsSavingRoutingConfig] = useState(false)
  const [typingReaction, setTypingReaction] = useState<SlackTypingReaction>('hourglass_flowing_sand')
  const [ackReaction, setAckReaction] = useState<SlackAckReaction>('eyes')
  const [streamingPreview, setStreamingPreview] = useState(true)
  const [streamingMode, setStreamingMode] = useState<SlackStreamingMode>('partial')
  const [nativeStreaming, setNativeStreaming] = useState(false)
  const [threadHistoryScope, setThreadHistoryScope] = useState<SlackThreadHistoryScope>('thread')
  const [threadInheritParent, setThreadInheritParent] = useState(false)
  const [threadInitialHistoryLimit, setThreadInitialHistoryLimit] = useState('')
  const [replyToMode, setReplyToMode] = useState<SlackReplyToMode>('off')
  const [selectedAllowedUserIds, setSelectedAllowedUserIds] = useState<string[]>([])
  const [workspaceWideEnabled, setWorkspaceWideEnabled] = useState(false)
  const [conversationSearch, setConversationSearch] = useState('')
  const [isAllowedUsersPopoverOpen, setIsAllowedUsersPopoverOpen] = useState(false)
  const [isAckReactionPopoverOpen, setIsAckReactionPopoverOpen] = useState(false)
  const [isTypingReactionPopoverOpen, setIsTypingReactionPopoverOpen] = useState(false)
  const [aliasDraft, setAliasDraft] = useState('')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null)
  const slackConfig = useMemo(() => {
    return connectedChannel?.channel_config && typeof connectedChannel.channel_config === 'object'
      ? connectedChannel.channel_config
      : {}
  }, [connectedChannel?.channel_config])
  const workspaceName =
    typeof slackConfig.slack_team_name === 'string' && slackConfig.slack_team_name.trim().length > 0
      ? slackConfig.slack_team_name.trim()
      : null
  const workspaceId =
    typeof slackConfig.slack_team_id === 'string' && slackConfig.slack_team_id.trim().length > 0
      ? slackConfig.slack_team_id.trim()
      : null
  const installStatus =
    typeof slackConfig.install_status === 'string' && slackConfig.install_status.trim().length > 0
      ? slackConfig.install_status.trim()
      : null
  const isInstalledUnbound = connectedChannel ? isSlackInstalledUnbound(connectedChannel) : false
  const isBound =
    connectedChannel?.is_active === true &&
    typeof connectedChannel.external_channel_id === 'string' &&
    connectedChannel.external_channel_id.trim().length > 0
  const isHostedSlack = useMemo(() => {
    if (!connectedChannel) return false
    if (connectedChannel.connection_mode === 'hosted') return true
    if (slackConfig.hosted === true) return true
    return installStatus === 'installed_unbound' || installStatus === 'bound'
  }, [connectedChannel, installStatus, slackConfig.hosted])
  const selectedBinding = useMemo(
    () =>
      settingsBindingChannelId
        ? bindings.find((binding) => binding.channelId === settingsBindingChannelId) ?? null
        : null,
    [bindings, settingsBindingChannelId],
  )
  const currentWorkspaceAgent = useMemo(
    () => workspaceAgents.find((agent) => agent.isCurrentAssistant) ?? null,
    [workspaceAgents],
  )
  const hasForeignWorkspaceDefault = Boolean(surfaceDefault && !surfaceDefault.isCurrentAssistant)
  const bindingCount = bindings.length
  const bindingsByConversationId = useMemo(
    () =>
      new Map(
        bindings
          .filter(
            (binding): binding is SlackBoundConversationBinding & { externalChannelId: string } =>
              typeof binding.externalChannelId === 'string' &&
              binding.externalChannelId.trim().length > 0,
          )
          .map((binding) => [binding.externalChannelId, binding]),
      ),
    [bindings],
  )
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase()
    const availableConversations = conversations.filter(
      (conversation) => !bindingsByConversationId.has(conversation.id),
    )
    if (!query) return availableConversations
    return availableConversations.filter((conversation) =>
      [conversation.label, conversation.name, conversation.id].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [bindingsByConversationId, conversationSearch, conversations])
  const selectedAllowedUsers = useMemo(
    () =>
      selectedAllowedUserIds
        .map((userId) => users.find((user) => user.id === userId))
        .filter((user): user is SlackUserOption => Boolean(user)),
    [selectedAllowedUserIds, users],
  )
  const filteredAllowedUsers = useMemo(
    () => users.filter((user) => !selectedAllowedUserIds.includes(user.id)),
    [selectedAllowedUserIds, users],
  )
  const selectableAllowedUsers = useMemo(
    () => filteredAllowedUsers.slice(0, 50),
    [filteredAllowedUsers],
  )
  const normalizedAliasDraft = useMemo(
    () => aliasDraft.trim().toLowerCase().replace(/\s+/g, ' '),
    [aliasDraft],
  )
  const aliasConflictAgent = useMemo(() => {
    if (!normalizedAliasDraft) return null
    return (
      workspaceAgents.find((agent) =>
        agent.aliases.some(
          (alias) => alias.alias.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedAliasDraft,
        ),
      ) ?? null
    )
  }, [normalizedAliasDraft, workspaceAgents])
  const handleAddAllowedUser = useCallback((userId: string) => {
    setSelectedAllowedUserIds((current) =>
      current.includes(userId) ? current : [...current, userId],
    )
    setIsAllowedUsersPopoverOpen(false)
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as
        | { type?: string; level?: 'success' | 'error'; message?: string }
        | undefined

      if (data?.type !== 'slack-install-result') return

      if (data.level === 'success') {
        toast.success(data.message || 'Slack installed')
      } else {
        toast.error(data.message || 'Slack install failed')
      }

      void Promise.resolve(onRefreshChannels?.()).finally(() => {
        router.refresh()
      })
      setIsInstalling(false)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onRefreshChannels, router])

  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true)
    try {
      const res = await fetch(`/api/assistants/${assistantId}/slack-conversations`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load Slack conversations')
      }
      const options = Array.isArray(data?.conversations)
        ? (data.conversations as SlackConversationOption[])
        : []
      const nextUsers = Array.isArray(data?.users)
        ? (data.users as SlackUserOption[])
        : []
      const nextBindings = Array.isArray(data?.bindings)
        ? (data.bindings as SlackBoundConversationBinding[])
        : []
      const nextUserDirectoryAvailable = data?.userDirectoryAvailable !== false
      const nextUserDirectoryError =
        typeof data?.userDirectoryError === 'string' && data.userDirectoryError.trim().length > 0
          ? data.userDirectoryError.trim()
          : null
      const nextWorkspaceAgents = Array.isArray(data?.workspaceAgents)
        ? (data.workspaceAgents as SlackWorkspaceAgentSummary[])
        : []
      const nextSurfaceDefault =
        data?.surfaceDefault && typeof data.surfaceDefault === 'object'
          ? (data.surfaceDefault as SlackSurfaceDefaultSummary)
          : null
      const nextActivity =
        data?.activity && typeof data.activity === 'object'
          ? (data.activity as SlackActivitySnapshot)
          : null
      const nextRoutingConfig =
        data?.routingConfig && typeof data.routingConfig === 'object'
          ? (data.routingConfig as SlackRoutingConfig)
          : null
      const nextTypingReaction =
        data?.typingReaction === null
          ? null
          : typeof data?.typingReaction === 'string' && data.typingReaction.trim().length > 0
            ? data.typingReaction.trim()
            : 'hourglass_flowing_sand'
      const nextAckReaction =
        data?.ackReaction === null
          ? null
          : typeof data?.ackReaction === 'string' && data.ackReaction.trim().length > 0
            ? data.ackReaction.trim()
            : 'eyes'
      const nextStreamingPreview = data?.streamingPreview !== false
      const nextStreamingMode =
        data?.streamingMode === 'off' ||
        data?.streamingMode === 'block' ||
        data?.streamingMode === 'progress'
          ? data.streamingMode
          : 'partial'
      const nextNativeStreaming = data?.nativeStreaming === true
      const nextThreadHistoryScope =
        data?.threadHistoryScope === 'channel' ? 'channel' : 'thread'
      const nextThreadInheritParent = data?.threadInheritParent === true
      const nextThreadInitialHistoryLimit =
        typeof data?.threadInitialHistoryLimit === 'number' && data.threadInitialHistoryLimit >= 0
          ? String(data.threadInitialHistoryLimit)
          : ''
      const nextReplyToMode =
        data?.replyToMode === 'first' || data?.replyToMode === 'all' ? data.replyToMode : 'off'
      const nextAllowedUsers = Array.isArray(data?.allowedUsers)
        ? (data.allowedUsers as string[])
        : []
      const nextWorkspaceWideEnabled = data?.workspaceWideEnabled === true
      setConversations(options)
      setUsers(nextUsers)
      setWorkspaceAgents(nextWorkspaceAgents)
      setSurfaceDefault(nextSurfaceDefault)
      setIsUserDirectoryAvailable(nextUserDirectoryAvailable)
      setUserDirectoryError(nextUserDirectoryError)
      setBindings(nextBindings)
      setInstallChannelId(
        typeof data?.installChannelId === 'string' && data.installChannelId.trim().length > 0
          ? data.installChannelId.trim()
          : null,
      )
      setActivity(nextActivity)
      if (nextRoutingConfig) {
        setRoutingConfig(nextRoutingConfig)
      }
      setTypingReaction(nextTypingReaction)
      setAckReaction(nextAckReaction)
      setStreamingPreview(nextStreamingPreview)
      setStreamingMode(nextStreamingMode)
      setNativeStreaming(nextNativeStreaming)
      setThreadHistoryScope(nextThreadHistoryScope)
      setThreadInheritParent(nextThreadInheritParent)
      setThreadInitialHistoryLimit(nextThreadInitialHistoryLimit)
      setReplyToMode(nextReplyToMode)
      setSelectedAllowedUserIds(nextAllowedUsers)
      setWorkspaceWideEnabled(nextWorkspaceWideEnabled)
      setSettingsBindingChannelId((current) => {
        if (current && nextBindings.some((binding) => binding.channelId === current)) {
          return current
        }
        return null
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Slack conversations')
    } finally {
      setIsLoadingConversations(false)
    }
  }, [assistantId])

  useEffect(() => {
    if (!connectedChannel || !isHostedSlack) return
    void loadConversations()
  }, [connectedChannel, isHostedSlack, loadConversations])

  useEffect(() => {
    if (!selectedBinding) return
    setRoutingConfig(selectedBinding.routingConfig)
    setTypingReaction(selectedBinding.typingReaction ?? 'hourglass_flowing_sand')
    setAckReaction(selectedBinding.ackReaction ?? 'eyes')
    setStreamingPreview(selectedBinding.streamingPreview)
    setStreamingMode(selectedBinding.streamingMode)
    setNativeStreaming(selectedBinding.nativeStreaming)
    setThreadHistoryScope(selectedBinding.threadHistoryScope)
    setThreadInheritParent(selectedBinding.threadInheritParent)
    setThreadInitialHistoryLimit(
      typeof selectedBinding.threadInitialHistoryLimit === 'number'
        ? String(selectedBinding.threadInitialHistoryLimit)
        : '',
    )
    setReplyToMode(selectedBinding.replyToMode)
    setSelectedAllowedUserIds(selectedBinding.allowedUsers)
    setActivity(selectedBinding.activity)
  }, [selectedBinding])

  useEffect(() => {
    if (!initialSettingsBindingChannelId) return
    if (!bindings.some((binding) => binding.channelId === initialSettingsBindingChannelId)) return
    setSettingsBindingChannelId(initialSettingsBindingChannelId)
    onInitialSettingsBindingHandled?.()
  }, [bindings, initialSettingsBindingChannelId, onInitialSettingsBindingHandled])

  const loadSlackOpsStatus = useCallback(
    async (mode: 'status' | 'probe' = 'status') => {
      if (!connectedChannel) return
      if (mode === 'probe') setIsProbingOps(true)
      else setIsLoadingOps(true)

      try {
        const response = await fetch(
          `/api/assistants/${assistantId}/channels/${connectedChannel.id}/slack-status`,
          { method: mode === 'probe' ? 'POST' : 'GET' },
        )
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error || 'Failed to load Slack status')
        }

        const payload = (await response.json()) as SlackOpsStatus
        setOpsStatus(payload)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load Slack status')
      } finally {
        setIsLoadingOps(false)
        setIsProbingOps(false)
      }
    },
    [assistantId, connectedChannel],
  )

  useEffect(() => {
    if (!connectedChannel || !isHostedSlack) {
      setOpsStatus(null)
      return
    }
    void loadSlackOpsStatus('status')
  }, [connectedChannel, isHostedSlack, loadSlackOpsStatus])

  const handleInstall = useCallback(async () => {
    setIsInstalling(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-connect`, {
        method: 'POST',
        headers: {
          ...(csrf && { 'x-csrf-token': csrf }),
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data?.details || data?.error || 'Slack hosted connect is not available yet',
        )
      }
      const url = data?.oauthUrl || data?.connectUrl
      if (!url) {
        throw new Error('Slack connect URL was not returned by the server')
      }
      const width = 720
      const height = 760
      const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0)
      const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0)

      const popup = window.open(
        url,
        'slack-hosted-install',
        `width=${width},height=${height},left=${left},top=${top},popup=yes`,
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site and try again.')
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Slack hosted connect is not available yet',
      )
      setIsInstalling(false)
    }
  }, [assistantId])

  const handleToggleConversation = useCallback(async (conversation: SlackConversationOption) => {
    const existingBinding = bindingsByConversationId.get(conversation.id)
    setPendingConversationIds((current) =>
      current.includes(conversation.id) ? current : [...current, conversation.id],
    )
    if (existingBinding) {
      setIsUnbindingConversation(true)
    } else {
      setIsBindingConversation(true)
    }
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-conversations`, {
        method: existingBinding ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify(
          existingBinding
            ? { assistantChannelId: existingBinding.channelId }
            : {
                conversationId: conversation.id,
                conversationLabel: conversation.label,
                conversationType: conversation.type,
              },
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data?.error ||
            (existingBinding ? 'Failed to unbind Slack conversation' : 'Failed to bind Slack conversation'),
        )
      }

      toast.success(existingBinding ? 'Slack conversation unbound' : 'Slack conversation bound')
      await Promise.resolve(onRefreshChannels?.())
      await loadConversations()
      router.refresh()
      return true
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : existingBinding
            ? 'Failed to unbind Slack conversation'
            : 'Failed to bind Slack conversation',
      )
      return false
    } finally {
      setPendingConversationIds((current) => current.filter((value) => value !== conversation.id))
      setIsBindingConversation(false)
      setIsUnbindingConversation(false)
    }
  }, [assistantId, bindingsByConversationId, loadConversations, onRefreshChannels, router])

  const handleUnbindConversation = useCallback(async (assistantChannelId: string) => {
    setDeletingBindingChannelId(assistantChannelId)
    setIsUnbindingConversation(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-conversations`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ assistantChannelId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to unbind Slack conversation')
      }

      toast.success('Slack conversation unbound')
      await Promise.resolve(onRefreshChannels?.())
      await loadConversations()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unbind Slack conversation')
    } finally {
      setDeletingBindingChannelId((current) => (current === assistantChannelId ? null : current))
      setIsUnbindingConversation(false)
    }
  }, [assistantId, loadConversations, onRefreshChannels, router])

  const handleSaveRoutingConfig = useCallback(async () => {
    setIsSavingRoutingConfig(true)
    try {
      const parsedThreadInitialHistoryLimit =
        threadInitialHistoryLimit.trim().length > 0
          ? Number.parseInt(threadInitialHistoryLimit.trim(), 10)
          : null
      if (
        parsedThreadInitialHistoryLimit !== null &&
        (!Number.isInteger(parsedThreadInitialHistoryLimit) || parsedThreadInitialHistoryLimit < 0)
      ) {
        throw new Error('Thread history limit must be a whole number greater than or equal to 0.')
      }
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-conversations`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({
          assistantChannelId: selectedBinding?.channelId || installChannelId,
          ...routingConfig,
          prefix: routingConfig.prefix?.trim() || null,
          streamingPreview,
          streamingMode,
          nativeStreaming,
          threadHistoryScope,
          threadInheritParent,
          threadInitialHistoryLimit: parsedThreadInitialHistoryLimit,
          replyToMode,
          ackReaction: ackReaction?.trim() || null,
          allowedUsers: selectedAllowedUserIds,
          typingReaction: typingReaction?.trim() || null,
          ...(!selectedBinding ? { workspaceWideEnabled } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save Slack routing settings')
      }

      const nextRoutingConfig =
        data?.routingConfig && typeof data.routingConfig === 'object'
          ? (data.routingConfig as SlackRoutingConfig)
          : routingConfig
      const nextTypingReaction =
        data?.typingReaction === null
          ? null
          : typeof data?.typingReaction === 'string' && data.typingReaction.trim().length > 0
            ? data.typingReaction.trim()
            : typingReaction
      const nextAckReaction =
        data?.ackReaction === null
          ? null
          : typeof data?.ackReaction === 'string' && data.ackReaction.trim().length > 0
            ? data.ackReaction.trim()
            : ackReaction
      const nextStreamingPreview = data?.streamingPreview !== false
      const nextStreamingMode =
        data?.streamingMode === 'off' ||
        data?.streamingMode === 'block' ||
        data?.streamingMode === 'progress'
          ? data.streamingMode
          : 'partial'
      const nextNativeStreaming = data?.nativeStreaming === true
      const nextThreadHistoryScope =
        data?.threadHistoryScope === 'channel' ? 'channel' : threadHistoryScope
      const nextThreadInheritParent =
        data?.threadInheritParent === true
      const nextThreadInitialHistoryLimit =
        typeof data?.threadInitialHistoryLimit === 'number' && data.threadInitialHistoryLimit >= 0
          ? String(data.threadInitialHistoryLimit)
          : threadInitialHistoryLimit
      const nextReplyToMode =
        data?.replyToMode === 'first' || data?.replyToMode === 'all'
          ? data.replyToMode
          : 'off'
      const nextAllowedUsers = Array.isArray(data?.allowedUsers)
        ? (data.allowedUsers as string[])
        : []
      const nextWorkspaceWideEnabled = data?.workspaceWideEnabled === true
      setRoutingConfig(nextRoutingConfig)
      setTypingReaction(nextTypingReaction)
      setAckReaction(nextAckReaction)
      setStreamingPreview(nextStreamingPreview)
      setStreamingMode(nextStreamingMode)
      setNativeStreaming(nextNativeStreaming)
      setThreadHistoryScope(nextThreadHistoryScope)
      setThreadInheritParent(nextThreadInheritParent)
      setThreadInitialHistoryLimit(nextThreadInitialHistoryLimit)
      setReplyToMode(nextReplyToMode)
      setSelectedAllowedUserIds(nextAllowedUsers)
      if (!selectedBinding) {
        setWorkspaceWideEnabled(nextWorkspaceWideEnabled)
      }
      toast.success('Slack routing updated')
      await Promise.resolve(onRefreshChannels?.())
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Slack routing settings')
    } finally {
      setIsSavingRoutingConfig(false)
    }
  }, [ackReaction, assistantId, installChannelId, nativeStreaming, onRefreshChannels, replyToMode, router, routingConfig, selectedAllowedUserIds, selectedBinding, streamingMode, streamingPreview, threadHistoryScope, threadInheritParent, threadInitialHistoryLimit, typingReaction, workspaceWideEnabled])

  const opsSnapshot = opsStatus?.snapshot ?? null
  const effectiveLastInboundAt = formatActivityTimestamp(opsSnapshot?.lastInboundAt ?? activity?.lastInboundAt ?? null)
  const effectiveLastOutboundAt = formatActivityTimestamp(opsSnapshot?.lastOutboundAt ?? activity?.lastOutboundAt ?? null)
  const effectiveLastReplyLatency = formatLatency(opsSnapshot?.lastReplyLatencyMs ?? activity?.lastReplyLatencyMs ?? null)
  const botLabel =
    opsStatus?.probe?.bot?.name ||
    opsStatus?.stats?.clientDetails?.[0]?.botName ||
    opsStatus?.probe?.bot?.id ||
    opsStatus?.stats?.clientDetails?.[0]?.botUserId ||
    'unknown'

  const openBindingSettings = useCallback((binding: SlackBoundConversationBinding) => {
    setSettingsBindingChannelId(binding.channelId)
  }, [])

  const closeBindingSettings = useCallback((open: boolean) => {
    if (!open) {
      setSettingsBindingChannelId(null)
      setIsWorkspaceSettingsOpen(false)
    }
  }, [])

  const openWorkspaceSettings = useCallback(async () => {
    setSettingsBindingChannelId(null)
    await loadConversations()
    setIsWorkspaceSettingsOpen(true)
  }, [loadConversations])

  const handleToggleWorkspaceWide = useCallback(async (enabled: boolean) => {
    if (!installChannelId) return
    setIsSavingRoutingConfig(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-conversations`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({
          assistantChannelId: installChannelId,
          workspaceWideEnabled: enabled,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update Slack everywhere mode')
      }
      setWorkspaceWideEnabled(data?.workspaceWideEnabled === true)
      toast.success(enabled ? 'Slack everywhere enabled' : 'Slack everywhere disabled')
      await Promise.resolve(onRefreshChannels?.())
      await loadConversations()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update Slack everywhere mode')
    } finally {
      setIsSavingRoutingConfig(false)
    }
  }, [assistantId, installChannelId, loadConversations, onRefreshChannels, router])

  const handleBindConversationFromModal = useCallback(async (conversation: SlackConversationOption) => {
    const success = await handleToggleConversation(conversation)
    if (success) {
      setIsAddChannelDialogOpen(false)
      setConversationSearch('')
    }
  }, [handleToggleConversation])

  const conversationTypeLabel = useCallback((type: SlackConversationOption['type'] | SlackBoundConversationBinding['conversationType']) => {
    switch (type) {
      case 'im':
        return 'Direct message'
      case 'private':
        return 'Private channel'
      case 'mpim':
        return 'Group DM'
      case 'public':
        return 'Public channel'
      default:
        return 'Slack conversation'
    }
  }, [])

  const handleCreateAlias = useCallback(async () => {
    const nextAlias = aliasDraft.trim()
    if (!nextAlias) {
      toast.error('Enter an alias first.')
      return
    }
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
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-aliases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ alias: nextAlias }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create Slack alias')
      }
      setAliasDraft('')
      toast.success('Slack alias created')
      await loadConversations()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Slack alias')
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasConflictAgent, aliasDraft, assistantId, loadConversations, router])

  const handleDeleteAlias = useCallback(async (aliasId: string) => {
    setDeletingAliasId(aliasId)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/slack-aliases`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ aliasId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete Slack alias')
      }
      toast.success('Slack alias deleted')
      await loadConversations()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete Slack alias')
    } finally {
      setDeletingAliasId((current) => (current === aliasId ? null : current))
    }
  }, [assistantId, loadConversations, router])

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
        <div
          className={
            bindingCount > 0
              ? 'rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-1.5'
              : 'rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-1.5'
          }
        >
          <div
            className={
              bindingCount > 0
                ? 'flex items-center gap-2 text-emerald-400'
                : 'flex items-center gap-2 text-amber-300'
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px] font-medium">
              {bindingCount > 0 ? 'Slack connected' : 'Slack installed'}
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {workspaceWideEnabled
              ? 'This agent is installed in Slack and active everywhere in this workspace, with optional per-channel overrides.'
              : bindingCount > 0
                ? `This agent is installed in Slack and currently active in ${bindingCount} conversation${bindingCount === 1 ? '' : 's'}.`
              : 'The Lucid Slack app is installed in this workspace. Finish inside Slack by opening the Lucid App Home or running /lucid bind in the target conversation.'}
          </p>

          {workspaceId ? (
            <p className="text-[10px] text-muted-foreground">
              Connected workspace:{' '}
              <span className={workspaceName ? 'text-foreground' : 'font-mono'}>
                {workspaceName ?? workspaceId}
              </span>
            </p>
          ) : null}

          {bindingCount > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              Active conversations:{' '}
              <span className="text-foreground">
                {bindings
                  .map((binding) => binding.conversationLabel || binding.externalChannelId || binding.channelId)
                  .join(', ')}
              </span>
            </p>
          ) : null}

          {workspaceWideEnabled ? (
            <p className="text-[10px] text-muted-foreground">
              Coverage: <span className="text-foreground">every Slack conversation this app can receive in this workspace</span>
            </p>
          ) : null}

          {surfaceDefault ? (
            <p className="text-[10px] text-muted-foreground">
              Workspace default:{' '}
              <span className="text-foreground">
                {surfaceDefault.assistantName}
              </span>
              {surfaceDefault.isCurrentAssistant ? ' (this assistant)' : ''}
            </p>
          ) : null}

          {connectedChannel && isHostedSlack ? (
            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium text-foreground">Bot health</p>
                  <p className="text-[10px] text-muted-foreground">
                    Live worker-backed status for the hosted Slack app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSlackOpsStatus('probe')}
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
                    {opsStatus?.lastStartAt
                      ? new Date(opsStatus.lastStartAt).toLocaleTimeString()
                      : 'n/a'}
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Last probe</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {opsStatus?.lastProbeAt
                      ? new Date(opsStatus.lastProbeAt).toLocaleTimeString()
                      : 'n/a'}
                  </p>
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Worker</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {opsStatus?.stats
                      ? `${opsStatus.stats.clients} client${opsStatus.stats.clients === 1 ? '' : 's'} • ${opsStatus.stats.channels} channel${opsStatus.stats.channels === 1 ? '' : 's'}`
                      : 'No worker stats yet'}
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Bot</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {botLabel}
                  </p>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-foreground">Probe</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {opsStatus?.probe
                      ? `${opsStatus.probe.ok ? 'ok' : 'failed'} • HTTP ${opsStatus.probe.status ?? 'n/a'} • ${opsStatus.probe.elapsedMs}ms`
                      : 'No probe yet'}
                  </p>
                </div>
              </div>
              {opsStatus?.lastRefreshAt ? (
                <p className="text-[10px] text-muted-foreground">
                  Last worker refresh:{' '}
                  <span className="text-foreground">
                    {new Date(opsStatus.lastRefreshAt).toLocaleTimeString()}
                  </span>
                </p>
              ) : null}
              {opsStatus?.lastError ? (
                <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-200">
                  {opsStatus.lastError}
                </p>
              ) : null}
            </div>
          ) : null}

          {effectiveLastInboundAt ? (
            <p className="text-[10px] text-muted-foreground">
              Last inbound:{' '}
              <span className="text-foreground">{effectiveLastInboundAt}</span>
              {(opsSnapshot?.lastInboundStatus ?? activity?.lastInboundStatus)
                ? ` (${opsSnapshot?.lastInboundStatus ?? activity?.lastInboundStatus})`
                : ''}
            </p>
          ) : null}

          {effectiveLastOutboundAt ? (
            <p className="text-[10px] text-muted-foreground">
              Last outbound:{' '}
              <span className="text-foreground">{effectiveLastOutboundAt}</span>
              {(opsSnapshot?.lastOutboundStatus ?? activity?.lastOutboundStatus)
                ? ` (${opsSnapshot?.lastOutboundStatus ?? activity?.lastOutboundStatus})`
                : ''}
            </p>
          ) : null}

          {effectiveLastReplyLatency ? (
            <p className="text-[10px] text-muted-foreground">
              Last reply latency:{' '}
              <span className="text-foreground">{effectiveLastReplyLatency}</span>
            </p>
          ) : null}

          {(opsSnapshot?.lastOutboundError ?? activity?.lastOutboundError) ? (
            <p className="text-[10px] text-amber-300/90">
              Last outbound note: {opsSnapshot?.lastOutboundError ?? activity?.lastOutboundError}
            </p>
          ) : null}

          {!isBound && installStatus === 'installed_unbound' ? (
            <p className="text-[10px] text-muted-foreground/90">
              Next step: bind a Slack conversation below, or finish inside Slack from App Home or with <span className="font-mono text-foreground">/lucid bind</span>.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Install the shared Lucid Slack app into a workspace. After install, Slack handles the final bind inside the Lucid App Home or with <code>/lucid bind</code> in the conversation where this agent should be active.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Unlike Discord, Slack installs workspace-wide first, then you pick the DM or channel inside Slack.
          </p>
        </div>
      )}

      {connectedChannel && isHostedSlack ? (
        <>
          <div className="space-y-3 rounded-md border border-border/40 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-foreground">Slack channels</p>
                <p className="text-[10px] text-muted-foreground">
                  Manage which Slack conversations this assistant is active in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadConversations()}
                disabled={isLoadingConversations || isBindingConversation || isUnbindingConversation}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                {isLoadingConversations ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="space-y-2">
              {workspaceWideEnabled ? (
                <div className="rounded-md border border-border/50 bg-background/60 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-[11px] font-medium text-foreground">Everywhere in {workspaceName ?? 'workspace'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Workspace-wide default settings for any Slack conversation without a channel override
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void openWorkspaceSettings()}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 px-2.5 text-[10px] text-foreground transition-colors hover:bg-background"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Settings
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleWorkspaceWide(false)}
                        disabled={isSavingRoutingConfig || isBindingConversation || isUnbindingConversation || isLoadingConversations}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-border/50 px-2.5 text-[10px] text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                      >
                        Disable
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {bindings.length > 0 ? (
                bindings.map((binding) => {
                  const label = binding.conversationLabel || binding.externalChannelId || binding.channelId
                  const isDeletingThisBinding = deletingBindingChannelId === binding.channelId
                  return (
                    <div
                      key={binding.channelId}
                      className="rounded-md border border-border/50 bg-background/60 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-[11px] font-medium text-foreground">{label}</p>
                            {surfaceDefault ? (
                              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                Override
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {conversationTypeLabel(binding.conversationType)} • {summarizeRoutingConfig(binding.routingConfig)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Live preview {binding.streamingPreview ? 'on' : 'off'} • Ack {formatReactionDisplay(binding.ackReaction)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openBindingSettings(binding)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 px-2.5 text-[10px] text-foreground transition-colors hover:bg-background"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Settings
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUnbindConversation(binding.channelId)}
                            disabled={isBindingConversation || isUnbindingConversation || isLoadingConversations}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                            aria-label={`Unbind ${label}`}
                          >
                            {isDeletingThisBinding ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
              <div className="rounded-md border border-dashed border-border/50 bg-background/40 px-3 py-4">
                <p className="text-[11px] text-foreground">No Slack channels bound yet</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Add a DM or channel and Lucid will start responding there right away.
                </p>
              </div>
              )}
            </div>

            <div className="flex justify-start">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddChannelDialogOpen(true)}
                  disabled={isLoadingConversations || isBindingConversation || isUnbindingConversation}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border/60 bg-background/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-40"
                >
                  Add channel
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleWorkspaceWide(!workspaceWideEnabled)}
                  disabled={isSavingRoutingConfig || isLoadingConversations || isBindingConversation || isUnbindingConversation || !installChannelId || hasForeignWorkspaceDefault}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border/60 bg-background/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-40"
                >
                  {workspaceWideEnabled
                    ? 'Disable everywhere'
                    : hasForeignWorkspaceDefault
                      ? `Default owned by ${surfaceDefault?.assistantName ?? 'another agent'}`
                      : 'Enable everywhere'}
                </button>
              </div>
            </div>
            {hasForeignWorkspaceDefault ? (
              <p className="text-[10px] text-muted-foreground">
                This workspace already has a default Slack agent. Channel binds on this assistant can still act as overrides.
              </p>
            ) : null}
          </div>

          <Dialog open={isAddChannelDialogOpen} onOpenChange={setIsAddChannelDialogOpen}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Add Slack channel</DialogTitle>
                <DialogDescription>
                  Pick a Slack DM or channel to bind. Clicking a row binds it immediately.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="slack-conversation-search" className="text-[11px]">
                    Search conversations
                  </Label>
                  <Input
                    id="slack-conversation-search"
                    value={conversationSearch}
                    onChange={(event) => setConversationSearch(event.target.value)}
                    placeholder="Filter DMs and channels"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {filteredConversations.map((conversation) => {
                    const isPending = pendingConversationIds.includes(conversation.id)
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => void handleBindConversationFromModal(conversation)}
                        disabled={isPending || isLoadingConversations || isBindingConversation}
                        className="flex w-full items-start justify-between gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-3 text-left transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-foreground">
                            {conversation.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {conversationTypeLabel(conversation.type)}
                          </p>
                        </div>
                        {isPending ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                      </button>
                    )
                  })}

                  {filteredConversations.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/50 bg-background/40 px-3 py-6 text-center">
                      <p className="text-[11px] text-foreground">No channels available</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Try a different search, open the DM in Slack first, or invite Lucid to the private channel.
                      </p>
                    </div>
                  ) : null}
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Private channels only appear after the Lucid app has been invited.
                </p>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean((settingsBindingChannelId && selectedBinding) || isWorkspaceSettingsOpen)} onOpenChange={closeBindingSettings}>
            <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedBinding
                    ? `Settings for ${selectedBinding.conversationLabel || selectedBinding.externalChannelId || 'Slack channel'}`
                    : 'Slack everywhere settings'}
                </DialogTitle>
                <DialogDescription>
                  {selectedBinding
                    ? 'These settings only affect this bound Slack conversation.'
                    : 'These settings apply to every Slack conversation in this workspace unless a channel override exists.'}
                </DialogDescription>
              </DialogHeader>

              {selectedBinding || isWorkspaceSettingsOpen ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-foreground">
                      {selectedBinding
                        ? selectedBinding.conversationLabel || selectedBinding.externalChannelId || selectedBinding.channelId
                        : `Everywhere in ${workspaceName ?? 'workspace'}`}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {selectedBinding
                        ? `${conversationTypeLabel(selectedBinding.conversationType)} • ${summarizeRoutingConfig(routingConfig)}`
                        : `Workspace-wide default • ${summarizeRoutingConfig(routingConfig)}`}
                    </p>
                  </div>

                  {isWorkspaceSettingsOpen ? (
                    <>
                      <div className="rounded-md border border-border/40 bg-background/40 px-3 py-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-medium text-foreground">Workspace default agent</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            One Slack workspace default can cover every conversation this app can receive. Explicit channel binds stay above it as overrides.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {surfaceDefault ? (
                            <span className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-foreground">
                              Current default: {surfaceDefault.assistantName}
                              {surfaceDefault.isCurrentAssistant ? ' (this assistant)' : ''}
                            </span>
                          ) : (
                            <span className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground">
                              No workspace default set
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleToggleWorkspaceWide(!workspaceWideEnabled)}
                            disabled={isSavingRoutingConfig || (!workspaceWideEnabled && hasForeignWorkspaceDefault)}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-border/60 bg-background/70 px-3 text-[10px] font-medium text-foreground transition-colors hover:bg-background disabled:opacity-40"
                          >
                            {workspaceWideEnabled
                              ? 'Disable for this assistant'
                              : hasForeignWorkspaceDefault
                                ? `Owned by ${surfaceDefault?.assistantName ?? 'another agent'}`
                                : 'Make this assistant the default'}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-md border border-border/40 bg-background/40 px-3 py-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-medium text-foreground">Aliases for this assistant</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            People can invoke this assistant directly with <span className="font-mono text-foreground">@Lucid {currentWorkspaceAgent?.aliases[0]?.alias ?? 'sales'}</span> or <span className="font-mono text-foreground">/lucid {currentWorkspaceAgent?.aliases[0]?.alias ?? 'sales'}</span>.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {currentWorkspaceAgent?.aliases.length ? (
                            currentWorkspaceAgent.aliases.map((alias) => (
                              <span
                                key={alias.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[10px] text-foreground"
                              >
                                {alias.alias}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteAlias(alias.id)}
                                  disabled={deletingAliasId === alias.id}
                                  className="text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-40"
                                  aria-label={`Delete alias ${alias.alias}`}
                                >
                                  {deletingAliasId === alias.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '×'}
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No aliases yet</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <Input
                            value={aliasDraft}
                            onChange={(event) => setAliasDraft(event.target.value)}
                            placeholder="Add alias like sales or marketing"
                            className="h-9 text-xs"
                            maxLength={40}
                          />
                          <button
                            type="button"
                            onClick={() => void handleCreateAlias()}
                            disabled={isSavingAlias || aliasDraft.trim().length === 0 || Boolean(aliasConflictAgent)}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-border/60 bg-background/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-40"
                          >
                            {isSavingAlias ? 'Adding…' : 'Add alias'}
                          </button>
                        </div>
                        {aliasConflictAgent ? (
                          <p className="text-[10px] text-amber-300">
                            {aliasConflictAgent.isCurrentAssistant
                              ? 'That alias already belongs to this assistant.'
                              : `That alias is already used by ${aliasConflictAgent.assistantName}.`}
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-border/40 bg-background/40 px-3 py-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-medium text-foreground">Agents in this Slack workspace</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            See which aliases belong to which agent, and which one currently owns the workspace default.
                          </p>
                        </div>
                        <div className="space-y-2">
                          {workspaceAgents.map((agent) => (
                            <div
                              key={agent.assistantId}
                              className="rounded-md border border-border/50 bg-background/60 px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] font-medium text-foreground">{agent.assistantName}</p>
                                {agent.isCurrentAssistant ? (
                                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Current
                                  </span>
                                ) : null}
                                {agent.isWorkspaceDefault ? (
                                  <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-300">
                                    Default
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {agent.boundConversationCount} bound conversation{agent.boundConversationCount === 1 ? '' : 's'}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {agent.aliases.length > 0 ? (
                                  agent.aliases.map((alias) => (
                                    <span
                                      key={alias.id}
                                      className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-foreground"
                                    >
                                      {alias.alias}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">No aliases</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="slack-dedicated-channel"
                        checked={routingConfig.dedicated_channel}
                        onCheckedChange={(checked) =>
                          setRoutingConfig((current) => ({
                            ...current,
                            dedicated_channel: checked === true,
                          }))
                        }
                      />
                      <label htmlFor="slack-dedicated-channel" className="text-[11px] cursor-pointer">
                        Reply to every message in the bound Slack conversation
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="slack-respond-on-mention"
                        checked={routingConfig.respond_on_mention}
                        onCheckedChange={(checked) =>
                          setRoutingConfig((current) => ({
                            ...current,
                            respond_on_mention: checked === true,
                          }))
                        }
                      />
                      <label htmlFor="slack-respond-on-mention" className="text-[11px] cursor-pointer">
                        Also respond when Lucid is @mentioned
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="slack-thread-support"
                        checked={routingConfig.thread_support}
                        onCheckedChange={(checked) =>
                          setRoutingConfig((current) => ({
                            ...current,
                            thread_support: checked === true,
                          }))
                        }
                      />
                      <label htmlFor="slack-thread-support" className="text-[11px] cursor-pointer">
                        Continue thread follow-ups without requiring another @mention or prefix
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="slack-ignore-bots"
                        checked={routingConfig.ignore_bots}
                        onCheckedChange={(checked) =>
                          setRoutingConfig((current) => ({
                            ...current,
                            ignore_bots: checked === true,
                          }))
                        }
                      />
                      <label htmlFor="slack-ignore-bots" className="text-[11px] cursor-pointer">
                        Ignore messages sent by other Slack bots and apps
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="slack-streaming-preview"
                        checked={streamingPreview}
                        onCheckedChange={(checked) => setStreamingPreview(checked === true)}
                      />
                      <label htmlFor="slack-streaming-preview" className="text-[11px] cursor-pointer">
                        Show live preview edits while Lucid is generating a Slack reply
                      </label>
                    </div>

                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="slack-prefix" className="text-[11px]">
                        Prefix trigger
                      </Label>
                      <Input
                        id="slack-prefix"
                        value={routingConfig.prefix ?? ''}
                        onChange={(event) =>
                          setRoutingConfig((current) => ({
                            ...current,
                            prefix: event.target.value,
                          }))
                        }
                        placeholder="!lucid"
                        maxLength={32}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="slack-reply-to-mode" className="text-[11px]">
                        Reply threading
                      </Label>
                      <Select
                        value={replyToMode}
                        onValueChange={(value) => setReplyToMode(value as SlackReplyToMode)}
                      >
                        <SelectTrigger id="slack-reply-to-mode" className="h-9 text-xs">
                          <SelectValue placeholder="Choose reply threading behavior" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Post directly in chat</SelectItem>
                          <SelectItem value="first">Thread the first reply only</SelectItem>
                          <SelectItem value="all">Keep every reply chunk in the thread</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="slack-ack-reaction" className="text-[11px]">
                        Ack reaction
                      </Label>
                      <Popover open={isAckReactionPopoverOpen} onOpenChange={setIsAckReactionPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button
                            id="slack-ack-reaction"
                            type="button"
                            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-xs text-foreground shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent/30"
                          >
                            <span className="text-lg leading-none">{getReactionOption(ackReaction).emoji}</span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[120] w-72 p-3" align="start">
                          <div className="grid grid-cols-4 gap-2">
                            {SLACK_REACTION_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                title={option.name}
                                onClick={() => {
                                  setAckReaction(option.value === '__off__' ? null : option.value)
                                  setIsAckReactionPopoverOpen(false)
                                }}
                                className="flex h-12 items-center justify-center rounded-md border border-border/50 bg-background text-xl transition-colors hover:bg-accent/40"
                              >
                                {option.emoji}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="slack-typing-reaction" className="text-[11px]">
                        Thinking indicator
                      </Label>
                      <Popover open={isTypingReactionPopoverOpen} onOpenChange={setIsTypingReactionPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button
                            id="slack-typing-reaction"
                            type="button"
                            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-xs text-foreground shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent/30"
                          >
                            <span className="text-lg leading-none">{getReactionOption(typingReaction).emoji}</span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[120] w-72 p-3" align="start">
                          <div className="grid grid-cols-4 gap-2">
                            {SLACK_REACTION_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                title={option.name}
                                onClick={() => {
                                  setTypingReaction(option.value === '__off__' ? null : option.value)
                                  setIsTypingReactionPopoverOpen(false)
                                }}
                                className="flex h-12 items-center justify-center rounded-md border border-border/50 bg-background text-xl transition-colors hover:bg-accent/40"
                              >
                                {option.emoji}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="slack-allowed-users-search" className="text-[11px]">
                          Allowed Slack users
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          Leave empty to allow anyone in this conversation. Add people by name to restrict access.
                        </p>
                      </div>

                      {selectedAllowedUsers.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedAllowedUsers.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() =>
                                setSelectedAllowedUserIds((current) =>
                                  current.filter((candidate) => candidate !== user.id),
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[10px] text-foreground transition-colors hover:bg-muted"
                            >
                              <SlackUserAvatar user={user} className="h-5 w-5" />
                              <span>{user.displayName}</span>
                              <span className="text-muted-foreground">×</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed border-border/50 bg-background/40 px-3 py-2 text-[10px] text-muted-foreground">
                          No user restriction
                        </div>
                      )}

                      <div className="space-y-2">
                        {isUserDirectoryAvailable ? (
                          <Popover open={isAllowedUsersPopoverOpen} onOpenChange={setIsAllowedUsersPopoverOpen}>
                            <PopoverTrigger asChild>
                              <button
                                id="slack-allowed-users-picker"
                                type="button"
                                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-xs text-foreground shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent/30"
                              >
                                <span>{selectableAllowedUsers.length > 0 ? 'Add a Slack user' : 'No more people to add'}</span>
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="z-[120] w-[360px] p-2"
                              align="start"
                              onOpenAutoFocus={(event) => event.preventDefault()}
                            >
                              <div
                                className="max-h-72 overflow-y-auto overscroll-contain pr-1"
                                onWheelCapture={(event) => event.stopPropagation()}
                              >
                                <div className="space-y-1">
                                  {selectableAllowedUsers.length > 0 ? (
                                    selectableAllowedUsers.map((user) => (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => handleAddAllowedUser(user.id)}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40"
                                      >
                                        <SlackUserAvatar user={user} className="h-7 w-7" />
                                        <div className="min-w-0">
                                          <p className="truncate text-[11px] text-foreground">{user.displayName}</p>
                                          <p className="truncate text-[10px] text-muted-foreground">@{user.name}</p>
                                        </div>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-2 py-3 text-[10px] text-muted-foreground">
                                      No more people to add
                                    </div>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-3 text-[10px] text-amber-200">
                            Slack user directory unavailable. Add the `users:read` bot scope and reinstall the Slack app to enable name-based user picking.
                            {userDirectoryError ? ` (${userDirectoryError})` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleSaveRoutingConfig}
                      disabled={
                        isSavingRoutingConfig ||
                        isBindingConversation ||
                        isUnbindingConversation ||
                        isLoadingConversations
                      }
                      className="h-9 rounded-md px-3 text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {isSavingRoutingConfig && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save settings
                    </button>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {!connectedChannel ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={isInstalling}
          className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isInstalling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Install on Slack
        </button>
      ) : isBound ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={isInstalling}
          className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isInstalling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Install on another Slack workspace
        </button>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        {isInstalledUnbound
          ? 'Slack is installed. Finish the bind from Slack App Home or with /lucid bind in the target conversation.'
          : 'After install, open the Lucid app in Slack to choose the active DM or channel.'}
      </p>

      {connectedChannel && !isBound ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={isInstalling}
          className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isInstalling ? 'Opening Slack…' : 'Install in another Slack workspace'}
        </button>
      ) : null}
    </div>
  )
}
