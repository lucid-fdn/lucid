'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { DiscordSharePanel } from '@/components/assistant/discord-share-panel'
import { SlackSharePanel } from '@/components/assistant/slack-share-panel'
import { TeamsSharePanel } from '@/components/assistant/msteams-share-panel'
import { AssistantOptionPickerPanel } from '@/components/assistant/assistant-option-picker-panel'
import { Button } from '@/components/ui/button'
import { LogoIcon } from '@/components/ui/logo-icon'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { HOSTED_CHANNEL_TYPES } from '@/lib/channels/types'
import { CHANNEL_METADATA, CONNECTABLE_CHANNEL_TYPES, isUserVisibleChannelType, type ChannelType } from '@/lib/channels/types'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AgentChannel as AssistantChannel } from '@/types/agent'

export type BuilderChannelHint = {
  channel_type: string
  required: boolean
  setup_note: string
}

interface ChannelPanelItem {
  id: string
  channel_type: string
  is_active: boolean
}

type AssistantChannelsPanelProps =
  | {
      mode?: 'assistant'
      assistantId: string
      channels: AssistantChannel[]
      onChannelsChange: (channels: AssistantChannel[]) => void
      slackShareEnabled?: boolean
      onSlackShareEnabledChange?: (enabled: boolean) => void
    }
  | {
      mode: 'builder'
      channelHints: BuilderChannelHint[]
      onChannelHintsChange: (channels: BuilderChannelHint[]) => void
    }

const channelDescriptions: Record<string, string> = {
  telegram: 'Chat with your agent via bot',
  whatsapp: 'Reach users on WhatsApp',
  discord: 'Automate your community',
  slack: 'Run your own Slack app in Socket Mode',
  msteams: 'Connect your own Teams bot app',
}

const supportsHostedMode = HOSTED_CHANNEL_TYPES as unknown as string[]

export function AssistantChannelsPanel(props: AssistantChannelsPanelProps) {
  const isAssistantMode = (props.mode ?? 'assistant') === 'assistant'
  const assistantProps = isAssistantMode ? props as Extract<AssistantChannelsPanelProps, { mode?: 'assistant' }> : null
  const builderProps = isAssistantMode ? null : props as Extract<AssistantChannelsPanelProps, { mode: 'builder' }>
  const assistantId = assistantProps?.assistantId ?? null
  const assistantChannels = assistantProps?.channels ?? null
  const setAssistantChannels = assistantProps?.onChannelsChange ?? null
  const slackShareEnabled = assistantProps?.slackShareEnabled ?? false
  const setSlackShareEnabled = assistantProps?.onSlackShareEnabledChange
  const builderHints = builderProps?.channelHints ?? null
  const setBuilderHints = builderProps?.onChannelHintsChange ?? null

  const [isLoadingChannels, setIsLoadingChannels] = React.useState(false)
  const [showAddChannel, setShowAddChannel] = React.useState(false)
  const [addChannelStep, setAddChannelStep] = React.useState<'pick' | 'form'>('pick')
  const [newChannelType, setNewChannelType] = React.useState<string>('telegram')
  const [newBotToken, setNewBotToken] = React.useState('')
  const [newAppToken, setNewAppToken] = React.useState('')
  const [newPhoneNumber, setNewPhoneNumber] = React.useState('')
  const [newPhoneNumberId, setNewPhoneNumberId] = React.useState('')
  const [newWhatsAppAppSecret, setNewWhatsAppAppSecret] = React.useState('')
  const [newWhatsAppVerifyToken, setNewWhatsAppVerifyToken] = React.useState('')
  const [newWhatsAppBusinessAccountId, setNewWhatsAppBusinessAccountId] = React.useState('')
  const [newChannelId, setNewChannelId] = React.useState('')
  const [newTeamsAppId, setNewTeamsAppId] = React.useState('')
  const [newTeamsAppPassword, setNewTeamsAppPassword] = React.useState('')
  const [newTeamsTenantId, setNewTeamsTenantId] = React.useState('common')
  const [isCreatingChannel, setIsCreatingChannel] = React.useState(false)
  const [copiedWebhook, setCopiedWebhook] = React.useState<string | null>(null)
  const [channelJustConnected, setChannelJustConnected] = React.useState<string | null>(null)
  const [confirmingDeleteChannelId, setConfirmingDeleteChannelId] = React.useState<string | null>(null)
  const [connectionMode, setConnectionMode] = React.useState<'byob' | 'hosted'>('byob')

  const channels = React.useMemo<ChannelPanelItem[]>(() => {
    if (isAssistantMode) {
      return (assistantChannels ?? [])
        .filter((channel) => isUserVisibleChannelType(channel.channel_type))
        .map((channel) => ({
          id: channel.id,
          channel_type: channel.channel_type,
          is_active: channel.is_active,
        }))
    }
    return (builderHints ?? [])
      .filter((channel: BuilderChannelHint) => isUserVisibleChannelType(channel.channel_type))
      .map((channel: BuilderChannelHint, index: number) => ({
        id: `builder-channel:${channel.channel_type}:${index}`,
        channel_type: channel.channel_type,
        is_active: channel.required ?? true,
      }))
  }, [assistantChannels, builderHints, isAssistantMode])

  const isByobChannelInvalid =
    (newChannelType === 'telegram' && !newBotToken.trim()) ||
    (newChannelType === 'discord' && (!newBotToken.trim() || !newChannelId.trim())) ||
    (newChannelType === 'whatsapp' &&
      (!newBotToken.trim() || !newPhoneNumberId.trim() || !newWhatsAppAppSecret.trim() || !newWhatsAppVerifyToken.trim())) ||
    (newChannelType === 'slack' && (!newBotToken.trim() || !newAppToken.trim())) ||
    (newChannelType === 'msteams' &&
      (!newTeamsAppId.trim() || !newTeamsAppPassword.trim() || !newTeamsTenantId.trim()))

  const resetNewChannelForm = React.useCallback(() => {
    setNewBotToken('')
    setNewAppToken('')
    setNewPhoneNumber('')
    setNewPhoneNumberId('')
    setNewWhatsAppAppSecret('')
    setNewWhatsAppVerifyToken('')
    setNewWhatsAppBusinessAccountId('')
    setNewChannelId('')
    setNewTeamsAppId('')
    setNewTeamsAppPassword('')
    setNewTeamsTenantId('common')
  }, [])

  const fetchChannels = React.useCallback(async () => {
    if (!isAssistantMode || !assistantId || !setAssistantChannels) return
    setIsLoadingChannels(true)
    try {
      const res = await fetch(`/api/assistants/${assistantId}/channels`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setAssistantChannels((data.channels || []).filter((channel: AssistantChannel) => isUserVisibleChannelType(channel.channel_type)))
    } catch {
      // no-op
    } finally {
      setIsLoadingChannels(false)
    }
  }, [assistantId, isAssistantMode, setAssistantChannels])

  const copyToClipboard = React.useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedWebhook(id)
    window.setTimeout(() => setCopiedWebhook(null), 2000)
  }, [])

  const buildBuilderSetupNote = React.useCallback(() => {
    const segments: string[] = []
    if (connectionMode === 'hosted') {
      segments.push('Hosted connect')
    } else {
      segments.push('BYOB')
    }
    if (newBotToken.trim()) segments.push('bot token provided')
    if (newAppToken.trim()) segments.push('app token provided')
    if (newPhoneNumber.trim()) segments.push(`phone ${newPhoneNumber.trim()}`)
    if (newPhoneNumberId.trim()) segments.push(`phone ID ${newPhoneNumberId.trim()}`)
    if (newWhatsAppBusinessAccountId.trim()) segments.push(`business account ${newWhatsAppBusinessAccountId.trim()}`)
    if (newChannelId.trim()) segments.push(`channel ${newChannelId.trim()}`)
    if (newTeamsAppId.trim()) segments.push(`app ${newTeamsAppId.trim()}`)
    if (newTeamsTenantId.trim()) segments.push(`tenant ${newTeamsTenantId.trim()}`)
    return segments.join(' - ')
  }, [
    connectionMode,
    newAppToken,
    newBotToken,
    newChannelId,
    newPhoneNumber,
    newPhoneNumberId,
    newTeamsAppId,
    newTeamsTenantId,
    newWhatsAppBusinessAccountId,
  ])

  const finishConnectedState = React.useCallback((connectedName: string) => {
    setChannelJustConnected(connectedName)
    window.setTimeout(() => {
      setChannelJustConnected(null)
      setShowAddChannel(false)
      setAddChannelStep('pick')
    }, 1500)
  }, [])

  const handleCreateChannel = React.useCallback(async () => {
    if (!isAssistantMode) {
      const nextHint: BuilderChannelHint = {
        channel_type: newChannelType,
        required: true,
        setup_note: buildBuilderSetupNote(),
      }
      setBuilderHints?.([...(builderHints ?? []), nextHint])
      resetNewChannelForm()
      finishConnectedState(CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? newChannelType)
      return
    }

    if (!assistantId || !setAssistantChannels) return

    setIsCreatingChannel(true)
    try {
      const payload = {
        channelType: newChannelType,
        connectionMode,
        botToken:
          newChannelType === 'telegram' || newChannelType === 'discord' || newChannelType === 'slack'
            ? newBotToken
            : newChannelType === 'whatsapp'
              ? newBotToken
              : undefined,
        appToken: newChannelType === 'slack' ? newAppToken : undefined,
        phoneNumber: newChannelType === 'whatsapp' ? newPhoneNumber : undefined,
        phoneNumberId: newChannelType === 'whatsapp' ? newPhoneNumberId : undefined,
        appSecret: newChannelType === 'whatsapp' ? newWhatsAppAppSecret : undefined,
        verifyToken: newChannelType === 'whatsapp' ? newWhatsAppVerifyToken : undefined,
        businessAccountId: newChannelType === 'whatsapp' ? newWhatsAppBusinessAccountId : undefined,
        channelId: newChannelType === 'discord' ? newChannelId : undefined,
        appId: newChannelType === 'msteams' ? newTeamsAppId : undefined,
        appPassword: newChannelType === 'msteams' ? newTeamsAppPassword : undefined,
        tenantId: newChannelType === 'msteams' ? newTeamsTenantId : undefined,
      }
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf && { 'x-csrf-token': csrf }) },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error?.error || 'Failed to create channel')
      }

      const data = await res.json()
      setAssistantChannels([...(assistantChannels ?? []), data.channel].filter((channel) => isUserVisibleChannelType(channel.channel_type)))
      resetNewChannelForm()
      const description =
        newChannelType === 'whatsapp' && data?.webhookVerifyToken
          ? `Webhook URL: ${data.webhookUrl} - Verify token: ${data.webhookVerifyToken}`
          : `Webhook URL: ${data.webhookUrl}`

      toast.success(`${newChannelType} channel created`, {
        description,
        duration: 10000,
      })
      finishConnectedState(CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? newChannelType)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create channel')
    } finally {
      setIsCreatingChannel(false)
    }
  }, [
    assistantChannels,
    assistantId,
    buildBuilderSetupNote,
    builderHints,
    connectionMode,
    finishConnectedState,
    isAssistantMode,
    newAppToken,
    newBotToken,
    newChannelId,
    newChannelType,
    newPhoneNumber,
    newPhoneNumberId,
    newTeamsAppId,
    newTeamsAppPassword,
    newTeamsTenantId,
    newWhatsAppAppSecret,
    newWhatsAppBusinessAccountId,
    newWhatsAppVerifyToken,
    resetNewChannelForm,
    setAssistantChannels,
    setBuilderHints,
  ])

  const handleDeleteChannel = React.useCallback(async (channelId: string) => {
    if (!isAssistantMode) {
      const parts = channelId.split(':')
      const index = Number(parts.at(-1))
      if (Number.isFinite(index)) {
        setBuilderHints?.((builderHints ?? []).filter((_: BuilderChannelHint, currentIndex: number) => currentIndex !== index))
      }
      return
    }

    if (!assistantId || !setAssistantChannels) return

    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/channels`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(csrf && { 'x-csrf-token': csrf }) },
        body: JSON.stringify({ channelId }),
      })
      if (!res.ok) throw new Error('Failed')
      setAssistantChannels((assistantChannels ?? []).filter((channel) => channel.id !== channelId))
      toast.success('Channel deleted')
    } catch {
      toast.error('Failed to delete channel')
    }
  }, [assistantChannels, assistantId, builderHints, isAssistantMode, setAssistantChannels, setBuilderHints])

  const handleOneClickConnect = React.useCallback(async (channelType: string) => {
    if (!isAssistantMode) {
      setNewChannelType(channelType)
      setConnectionMode('hosted')
      await handleCreateChannel()
      return
    }

    if (!assistantId || !setAssistantChannels) return

    setIsCreatingChannel(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/${channelType}-connect`, {
        method: 'POST',
        headers: { ...(csrf && { 'x-csrf-token': csrf }) },
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error?.error || `Failed to connect ${channelType}`)
      }

      const data = await res.json()
      const connectedName = CHANNEL_METADATA[channelType as ChannelType]?.name ?? channelType
      if (data?.oauthUrl) {
        window.open(data.oauthUrl, '_blank', 'noopener,noreferrer')
        toast.success(`${channelType} OAuth opened`, {
          description: 'Complete authorization in the new tab, then click Refresh.',
        })
        setShowAddChannel(false)
      } else if (data?.connectUrl) {
        window.open(data.connectUrl, '_blank', 'noopener,noreferrer')
        toast.success(`${channelType} connect opened`, {
          description: 'Complete setup in the new tab, then click Refresh.',
        })
        setShowAddChannel(false)
      } else if (data?.channel) {
      setAssistantChannels([...(assistantChannels ?? []), data.channel].filter((channel: AssistantChannel) => isUserVisibleChannelType(channel.channel_type)))
        toast.success(`${channelType} channel connected!`)
        finishConnectedState(connectedName)
      } else {
        toast.success(`${channelType} connect initiated`, {
          description: 'Click Refresh to see your channel.',
        })
        setShowAddChannel(false)
      }

      fetchChannels()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to connect ${channelType}`)
    } finally {
      setIsCreatingChannel(false)
    }
  }, [assistantChannels, assistantId, fetchChannels, finishConnectedState, handleCreateChannel, isAssistantMode, setAssistantChannels])

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showAddChannel ? (
        <motion.div
          key="add-channel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="space-y-5 overflow-hidden"
        >
          {channelJustConnected ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
              <LogoIcon slug={newChannelType} size={22} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-400">{channelJustConnected} connected</p>
                <p className="text-[10px] text-emerald-500/70 mt-0.5">Now listening</p>
              </div>
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            </div>
          ) : addChannelStep === 'pick' ? (
            <>
              <AssistantOptionPickerPanel
                title="Connect a channel"
                description="Where should your agent listen and respond?"
                items={CONNECTABLE_CHANNEL_TYPES.map((type) => ({
                  id: type,
                  label: CHANNEL_METADATA[type].name,
                  description: channelDescriptions[type],
                  icon: <LogoIcon slug={type} size={22} />,
                }))}
                selectedId={newChannelType}
                onSelect={(type) => {
                  setNewChannelType(type)
                  setConnectionMode(supportsHostedMode.includes(type) ? 'hosted' : 'byob')
                  resetNewChannelForm()
                  setAddChannelStep('form')
                }}
              />
              <button
                type="button"
                onClick={() => setShowAddChannel(false)}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAddChannelStep('pick')}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="text-sm leading-none">Back</span>
                <span>Change channel</span>
              </button>

              <div className="flex items-center gap-3">
                <LogoIcon slug={newChannelType} size={28} className="shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? newChannelType}</p>
                  <p className="text-[11px] text-muted-foreground">{channelDescriptions[newChannelType] ?? newChannelType}</p>
                </div>
              </div>

              {supportsHostedMode.includes(newChannelType) ? (
                <>
                  {connectionMode === 'hosted' ? (
                    <>
                      {isAssistantMode && newChannelType === 'discord' ? (
                        <DiscordSharePanel assistantId={assistantId!} />
                      ) : isAssistantMode && newChannelType === 'slack' ? (
                        <SlackSharePanel
                          assistantId={assistantId!}
                          onRefreshChannels={fetchChannels}
                        />
                      ) : isAssistantMode && newChannelType === 'msteams' ? (
                        <TeamsSharePanel assistantId={assistantId!} />
                      ) : (
                        <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
                          <p className="text-[11px] text-muted-foreground">
                            {isAssistantMode
                              ? 'We’ll create and configure the bot automatically. Ready to receive messages in seconds.'
                              : 'This channel will be added to the draft and configured after creation.'}
                          </p>
                        </div>
                      )}

                      {(isAssistantMode ? !['discord', 'slack', 'msteams'].includes(newChannelType) : true) && (
                        <button
                          type="button"
                          onClick={() => (isAssistantMode ? handleOneClickConnect(newChannelType) : handleCreateChannel())}
                          disabled={isCreatingChannel}
                          className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {isCreatingChannel && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {isCreatingChannel
                            ? 'Connecting...'
                            : isAssistantMode
                              ? `Connect ${CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? 'channel'}`
                              : `Add ${CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? 'channel'}`}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setConnectionMode('byob')}
                        className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        Use my own bot token instead →
                      </button>
                    </>
                  ) : (
                    <>
                      <CredentialFields
                        newChannelType={newChannelType}
                        newBotToken={newBotToken}
                        setNewBotToken={setNewBotToken}
                        newAppToken={newAppToken}
                        setNewAppToken={setNewAppToken}
                        newPhoneNumber={newPhoneNumber}
                        setNewPhoneNumber={setNewPhoneNumber}
                        newPhoneNumberId={newPhoneNumberId}
                        setNewPhoneNumberId={setNewPhoneNumberId}
                        newWhatsAppAppSecret={newWhatsAppAppSecret}
                        setNewWhatsAppAppSecret={setNewWhatsAppAppSecret}
                        newWhatsAppVerifyToken={newWhatsAppVerifyToken}
                        setNewWhatsAppVerifyToken={setNewWhatsAppVerifyToken}
                        newWhatsAppBusinessAccountId={newWhatsAppBusinessAccountId}
                        setNewWhatsAppBusinessAccountId={setNewWhatsAppBusinessAccountId}
                        newChannelId={newChannelId}
                        setNewChannelId={setNewChannelId}
                        newTeamsAppId={newTeamsAppId}
                        setNewTeamsAppId={setNewTeamsAppId}
                        newTeamsAppPassword={newTeamsAppPassword}
                        setNewTeamsAppPassword={setNewTeamsAppPassword}
                        newTeamsTenantId={newTeamsTenantId}
                        setNewTeamsTenantId={setNewTeamsTenantId}
                        includeWhatsAppFields
                      />

                      <button
                        type="button"
                        onClick={handleCreateChannel}
                        disabled={isCreatingChannel || isByobChannelInvalid}
                        className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {isCreatingChannel && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isCreatingChannel
                          ? 'Connecting...'
                          : isAssistantMode
                            ? `Connect ${CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? 'channel'}`
                            : `Add ${CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? 'channel'}`}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConnectionMode('hosted')}
                        className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        Back to one-click connect
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <CredentialFields
                    newChannelType={newChannelType}
                    newBotToken={newBotToken}
                    setNewBotToken={setNewBotToken}
                    newAppToken={newAppToken}
                    setNewAppToken={setNewAppToken}
                    newPhoneNumber={newPhoneNumber}
                    setNewPhoneNumber={setNewPhoneNumber}
                    newPhoneNumberId={newPhoneNumberId}
                    setNewPhoneNumberId={setNewPhoneNumberId}
                    newWhatsAppAppSecret={newWhatsAppAppSecret}
                    setNewWhatsAppAppSecret={setNewWhatsAppAppSecret}
                    newWhatsAppVerifyToken={newWhatsAppVerifyToken}
                    setNewWhatsAppVerifyToken={setNewWhatsAppVerifyToken}
                    newWhatsAppBusinessAccountId={newWhatsAppBusinessAccountId}
                    setNewWhatsAppBusinessAccountId={setNewWhatsAppBusinessAccountId}
                    newChannelId={newChannelId}
                    setNewChannelId={setNewChannelId}
                    newTeamsAppId={newTeamsAppId}
                    setNewTeamsAppId={setNewTeamsAppId}
                    newTeamsAppPassword={newTeamsAppPassword}
                    setNewTeamsAppPassword={setNewTeamsAppPassword}
                    newTeamsTenantId={newTeamsTenantId}
                    setNewTeamsTenantId={setNewTeamsTenantId}
                  />

                  <button
                    type="button"
                    onClick={handleCreateChannel}
                    disabled={isCreatingChannel || isByobChannelInvalid}
                    className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isCreatingChannel && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isCreatingChannel
                      ? 'Connecting...'
                      : isAssistantMode
                        ? `Connect ${CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? 'channel'}`
                        : `Add ${CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? 'channel'}`}
                  </button>
                </>
              )}
            </>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="channel-list"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="space-y-4 overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {channels.length > 0
                ? `${channels.filter((channel) => channel.is_active).length} active`
                : 'Connect your agent to the world'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => { setAddChannelStep('pick'); setShowAddChannel(true) }}>
                <Plus className="h-3 w-3" /> Add channel
              </Button>
              {isAssistantMode ? (
                <button
                  type="button"
                  onClick={fetchChannels}
                  disabled={isLoadingChannels}
                  className="flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:border-border hover:text-muted-foreground transition-colors duration-120 disabled:opacity-50"
                >
                  {isLoadingChannels ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </button>
              ) : null}
            </div>
          </div>

          {channels.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {CONNECTABLE_CHANNEL_TYPES.map((type) => {
                  const meta = CHANNEL_METADATA[type]
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setNewChannelType(type)
                        setConnectionMode(supportsHostedMode.includes(type) ? 'hosted' : 'byob')
                        resetNewChannelForm()
                        setAddChannelStep('form')
                        setShowAddChannel(true)
                      }}
                      className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border/40 hover:border-border hover:bg-card/40 transition-all duration-120 group"
                    >
                      <div className="opacity-50 group-hover:opacity-100 transition-opacity">
                        <LogoIcon slug={type} size={22} />
                      </div>
                      <span className="text-[10px] text-muted-foreground/70 group-hover:text-foreground transition-colors">{meta.name}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground/60 text-center">
                Connect your agent to start receiving messages
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {channels.map((channel) => {
                const meta = CHANNEL_METADATA[channel.channel_type as ChannelType]
                const channelName = meta?.name ?? channel.channel_type
                return (
                  <div key={channel.id} className="rounded-lg border border-border/60 p-3 hover:bg-card/30 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        <LogoIcon slug={channel.channel_type} size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-foreground">{channelName}</span>
                          <span className="text-muted-foreground/50 text-[10px]">-</span>
                          <span className={cn('inline-flex items-center gap-1 text-[10px]', channel.is_active ? 'text-emerald-500' : 'text-muted-foreground')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', channel.is_active ? 'bg-emerald-400' : 'bg-muted')} />
                            {channel.is_active ? 'Connected' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {channel.is_active ? 'Listening for messages' : 'Not receiving messages'}
                        </p>
                        {isAssistantMode && meta?.requiresWebhook !== false ? (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <code className="text-[9px] text-muted-foreground/30 font-mono truncate">/api/webhooks/{channel.channel_type}/{channel.id}</code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`${window.location.origin}/api/webhooks/${channel.channel_type}/${channel.id}`, channel.id)}
                              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                            >
                              {copiedWebhook === channel.id ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5" />}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {confirmingDeleteChannelId === channel.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteChannelId(null)}
                              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingDeleteChannelId(null)
                                void handleDeleteChannel(channel.id)
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 transition-colors px-1.5 py-0.5 rounded border border-red-500/20 hover:border-red-500/40"
                            >
                              Disconnect
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteChannelId(channel.id)}
                            className="text-muted-foreground/50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CredentialFields(props: {
  newChannelType: string
  newBotToken: string
  setNewBotToken: (value: string) => void
  newAppToken: string
  setNewAppToken: (value: string) => void
  newPhoneNumber: string
  setNewPhoneNumber: (value: string) => void
  newPhoneNumberId: string
  setNewPhoneNumberId: (value: string) => void
  newWhatsAppAppSecret: string
  setNewWhatsAppAppSecret: (value: string) => void
  newWhatsAppVerifyToken: string
  setNewWhatsAppVerifyToken: (value: string) => void
  newWhatsAppBusinessAccountId: string
  setNewWhatsAppBusinessAccountId: (value: string) => void
  newChannelId: string
  setNewChannelId: (value: string) => void
  newTeamsAppId: string
  setNewTeamsAppId: (value: string) => void
  newTeamsAppPassword: string
  setNewTeamsAppPassword: (value: string) => void
  newTeamsTenantId: string
  setNewTeamsTenantId: (value: string) => void
  includeWhatsAppFields?: boolean
}) {
  return (
    <div className="space-y-2">
      {(props.newChannelType === 'telegram' || props.newChannelType === 'discord') && (
        <>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Bot token</label>
          <input
            type="password"
            value={props.newBotToken}
            onChange={(event) => props.setNewBotToken(event.target.value)}
            placeholder={props.newChannelType === 'telegram' ? '123456789:ABCdef...' : 'MTIz...'}
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          {props.newChannelType === 'telegram' ? (
            <p className="text-[10px] text-muted-foreground">
              Get it from{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                @BotFather <ExternalLink className="h-2.5 w-2.5" />
              </a>
              {' '}<span className="text-muted-foreground/50">- takes ~30 seconds</span>
            </p>
          ) : null}
          {props.newChannelType === 'discord' ? (
            <p className="text-[10px] text-muted-foreground">
              Get it from{' '}
              <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                Discord Developer Portal <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </p>
          ) : null}
        </>
      )}

      {props.newChannelType === 'discord' ? (
        <>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Channel ID</label>
          <input
            type="text"
            value={props.newChannelId}
            onChange={(event) => props.setNewChannelId(event.target.value)}
            placeholder="123456789012345678"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            Right-click the Discord channel, then copy Channel ID (Developer Mode required).
          </p>
        </>
      ) : null}

      {props.includeWhatsAppFields && props.newChannelType === 'whatsapp' ? (
        <>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Access token</label>
          <input
            type="password"
            value={props.newBotToken}
            onChange={(event) => props.setNewBotToken(event.target.value)}
            placeholder="EAAG..."
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Phone number ID</label>
          <input
            type="text"
            value={props.newPhoneNumberId}
            onChange={(event) => props.setNewPhoneNumberId(event.target.value)}
            placeholder="123456789012345"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Business phone number</label>
          <input
            type="text"
            value={props.newPhoneNumber}
            onChange={(event) => props.setNewPhoneNumber(event.target.value)}
            placeholder="+1234567890"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">App secret</label>
          <input
            type="password"
            value={props.newWhatsAppAppSecret}
            onChange={(event) => props.setNewWhatsAppAppSecret(event.target.value)}
            placeholder="Meta app secret"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Verify token</label>
          <input
            type="text"
            value={props.newWhatsAppVerifyToken}
            onChange={(event) => props.setNewWhatsAppVerifyToken(event.target.value)}
            placeholder="lucid-wa-verify-token"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Business account ID (optional)</label>
          <input
            type="text"
            value={props.newWhatsAppBusinessAccountId}
            onChange={(event) => props.setNewWhatsAppBusinessAccountId(event.target.value)}
            placeholder="Optional WABA ID"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            WhatsApp BYOB uses Meta Cloud API credentials. Lucid will give you a webhook URL and reuse your verify token for Meta verification.
          </p>
        </>
      ) : null}

      {props.newChannelType === 'slack' ? (
        <>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Bot token</label>
          <input
            type="password"
            value={props.newBotToken}
            onChange={(event) => props.setNewBotToken(event.target.value)}
            placeholder="xoxb-..."
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">App token</label>
          <input
            type="password"
            value={props.newAppToken}
            onChange={(event) => props.setNewAppToken(event.target.value)}
            placeholder="xapp-..."
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            Slack requires both the bot token and the Socket Mode app token.
          </p>
        </>
      ) : null}

      {props.newChannelType === 'msteams' ? (
        <>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">App ID</label>
          <input
            type="text"
            value={props.newTeamsAppId}
            onChange={(event) => props.setNewTeamsAppId(event.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">App password</label>
          <input
            type="password"
            value={props.newTeamsAppPassword}
            onChange={(event) => props.setNewTeamsAppPassword(event.target.value)}
            placeholder="Azure client secret"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Tenant ID</label>
          <input
            type="text"
            value={props.newTeamsTenantId}
            onChange={(event) => props.setNewTeamsTenantId(event.target.value)}
            placeholder="common"
            className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition-colors duration-120 font-mono"
          />
        </>
      ) : null}
    </div>
  )
}
