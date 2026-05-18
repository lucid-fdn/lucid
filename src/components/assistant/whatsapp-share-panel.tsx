'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageSquareShare } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import {
  ChannelAgentRoster,
  ChannelAliasManager,
  ChannelDefaultBadge,
  ChannelOwnershipCard,
} from '@/components/assistant/channel-admin-blocks'
import { WhatsAppEmbeddedSignupButton } from '@/components/assistant/whatsapp-embedded-signup-button'

interface WhatsAppAliasSummary {
  id: string
  alias: string
}

interface WhatsAppChatAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  aliases: WhatsAppAliasSummary[]
  isDefault: boolean
  isCurrentAssistant: boolean
}

interface WhatsAppDefaultAssistantSummary {
  assistantId: string
  assistantName: string
  bindingChannelId?: string | null
  assistantChannelId?: string | null
  aliases?: WhatsAppAliasSummary[]
  isCurrentAssistant: boolean
}

interface WhatsAppSurfaceAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  isCurrentAssistant: boolean
  isSurfaceDefault: boolean
  boundChatId: string | null
}

interface WhatsAppByobAdminPayload {
  mode: 'byob'
  channelId: string
  isActive: boolean
  webhookUrl: string
  verifyToken: string | null
  phoneNumber: string | null
  phoneNumberId: string | null
  businessAccountId: string | null
  hasAccessToken: boolean
  hasAppSecret: boolean
}

export interface WhatsAppSharePanelProps {
  assistantId: string
  connectedChannel?: AssistantChannel | null
  onRefreshChannels?: () => Promise<void> | void
}

export function WhatsAppSharePanel({
  assistantId,
  connectedChannel = null,
  onRefreshChannels,
}: WhatsAppSharePanelProps) {
  const router = useRouter()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [chatAgents, setChatAgents] = useState<WhatsAppChatAgentSummary[]>([])
  const [defaultAssistant, setDefaultAssistant] = useState<WhatsAppDefaultAssistantSummary | null>(null)
  const [surfaceDefault, setSurfaceDefault] = useState<WhatsAppDefaultAssistantSummary | null>(null)
  const [surfaceAgents, setSurfaceAgents] = useState<WhatsAppSurfaceAgentSummary[]>([])
  const [byobAdmin, setByobAdmin] = useState<WhatsAppByobAdminPayload | null>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null)
  const [isSavingChatDefault, setIsSavingChatDefault] = useState(false)
  const [isSavingSurfaceDefault, setIsSavingSurfaceDefault] = useState(false)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  const isHosted = connectedChannel?.connection_mode !== 'byob'
  const chatId =
    typeof connectedChannel?.external_channel_id === 'string' &&
    connectedChannel.external_channel_id.trim().length > 0
      ? connectedChannel.external_channel_id.trim()
      : null
  const whatsappConfig =
    connectedChannel?.channel_config && typeof connectedChannel.channel_config === 'object'
      ? connectedChannel.channel_config
      : {}
  const hostedSurfaceId =
    typeof whatsappConfig.hosted_surface_id === 'string' && whatsappConfig.hosted_surface_id.trim().length > 0
      ? whatsappConfig.hosted_surface_id.trim()
      : null
  const currentChatAgent = useMemo(
    () => chatAgents.find((agent) => agent.isCurrentAssistant) ?? null,
    [chatAgents],
  )
  const aliasConflictAgent = useMemo(() => {
    const normalizedDraft = aliasDraft.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalizedDraft) return null
    return (
      chatAgents.find((agent) =>
        agent.aliases.some(
          (alias) => alias.alias.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedDraft,
        ),
      ) ?? null
    )
  }, [aliasDraft, chatAgents])

  const copyValue = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedValue(label)
      window.setTimeout(() => setCopiedValue(null), 1800)
    } catch {
      toast.error(`Failed to copy ${label}`)
    }
  }, [])

  const loadAdmin = useCallback(async () => {
    if (!connectedChannel?.id) return

    if (!isHosted) {
      setIsLoadingAdmin(true)
      try {
        const response = await fetch(
          `/api/assistants/${assistantId}/whatsapp-admin?channelId=${encodeURIComponent(connectedChannel.id)}`,
        )
        const payload = (await response.json().catch(() => null)) as
          | (WhatsAppByobAdminPayload & { error?: string })
          | null
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load WhatsApp BYOB setup')
        }

        setByobAdmin(payload)
        setChatAgents([])
        setDefaultAssistant(null)
        setSurfaceDefault(null)
        setSurfaceAgents([])
        return
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load WhatsApp BYOB setup')
      } finally {
        setIsLoadingAdmin(false)
      }
      return
    }

    if (!chatId) {
      setChatAgents([])
      setDefaultAssistant(null)
      setSurfaceDefault(null)
      setSurfaceAgents([])
      setByobAdmin(null)
      return
    }

    setIsLoadingAdmin(true)
    try {
      const params = new URLSearchParams({ chatId })
      if (hostedSurfaceId) params.set('hostedSurfaceId', hostedSurfaceId)
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-admin?${params.toString()}`)
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            bindings?: WhatsAppChatAgentSummary[]
            defaultAssistant?: WhatsAppDefaultAssistantSummary | null
            surfaceDefault?: WhatsAppDefaultAssistantSummary | null
            surfaceAgents?: WhatsAppSurfaceAgentSummary[]
          }
        | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load WhatsApp admin data')
      }

      setChatAgents(Array.isArray(payload?.bindings) ? payload.bindings : [])
      setDefaultAssistant(payload?.defaultAssistant ?? null)
      setSurfaceDefault(payload?.surfaceDefault ?? null)
      setSurfaceAgents(Array.isArray(payload?.surfaceAgents) ? payload.surfaceAgents : [])
      setByobAdmin(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load WhatsApp admin data')
    } finally {
      setIsLoadingAdmin(false)
    }
  }, [assistantId, chatId, connectedChannel?.id, hostedSurfaceId, isHosted])

  useEffect(() => {
    if (!connectedChannel) return
    void loadAdmin()
  }, [connectedChannel, loadAdmin])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-connect`, {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; connectUrl?: string }
        | null
      if (!response.ok || !payload?.connectUrl) {
        throw new Error(payload?.error || 'Failed to generate WhatsApp connect link')
      }

      window.open(payload.connectUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate WhatsApp connect link')
    } finally {
      setIsConnecting(false)
    }
  }, [assistantId])

  const handleCreateAlias = useCallback(async () => {
    const nextAlias = aliasDraft.trim()
    if (!chatId || nextAlias.length === 0) return
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
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, alias: nextAlias }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to create WhatsApp alias')

      setAliasDraft('')
      toast.success('WhatsApp alias added')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create WhatsApp alias')
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasConflictAgent, aliasDraft, assistantId, chatId, loadAdmin, router])

  const handleDeleteAlias = useCallback(async (aliasId: string) => {
    if (!chatId) return
    setDeletingAliasId(aliasId)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-aliases`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, aliasId }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete WhatsApp alias')
      toast.success('WhatsApp alias removed')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete WhatsApp alias')
    } finally {
      setDeletingAliasId(null)
    }
  }, [assistantId, chatId, loadAdmin, router])

  const handleMakeChatDefault = useCallback(async () => {
    if (!chatId || !currentChatAgent) return
    setIsSavingChatDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_chat_default',
          chatId,
          bindingChannelId: currentChatAgent.bindingChannelId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to update WhatsApp chat default')
      toast.success('WhatsApp chat default updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update WhatsApp chat default')
    } finally {
      setIsSavingChatDefault(false)
    }
  }, [assistantId, chatId, currentChatAgent, loadAdmin, router])

  const handleSetSurfaceDefault = useCallback(async () => {
    if (!hostedSurfaceId || !connectedChannel) return
    setIsSavingSurfaceDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_surface_default',
          hostedSurfaceId,
          assistantChannelId: connectedChannel.id,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to update WhatsApp default for new chats')
      toast.success('WhatsApp default for new chats updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update WhatsApp default for new chats',
      )
    } finally {
      setIsSavingSurfaceDefault(false)
    }
  }, [assistantId, connectedChannel, hostedSurfaceId, loadAdmin, router])

  const handleClearSurfaceDefault = useCallback(async () => {
    if (!hostedSurfaceId) return
    setIsSavingSurfaceDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/whatsapp-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_surface_default',
          hostedSurfaceId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to clear WhatsApp default for new chats')
      toast.success('WhatsApp default for new chats cleared')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to clear WhatsApp default for new chats',
      )
    } finally {
      setIsSavingSurfaceDefault(false)
    }
  }, [assistantId, hostedSurfaceId, loadAdmin, router])

  const handleRefreshSetup = useCallback(async () => {
    await loadAdmin()
    await onRefreshChannels?.()
  }, [loadAdmin, onRefreshChannels])

  const renderCopyField = useCallback((params: {
    label: string
    value: string | null
    copyLabel: string
    helper?: string | null
  }) => {
    if (!params.value) return null

    return (
      <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-foreground">{params.label}</p>
            <code className="mt-1 block break-all text-[10px] text-muted-foreground">{params.value}</code>
            {params.helper ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{params.helper}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void copyValue(params.value!, params.copyLabel)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/70 text-foreground transition-colors hover:bg-background"
            aria-label={`Copy ${params.copyLabel}`}
          >
            {copiedValue === params.copyLabel ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    )
  }, [copiedValue, copyValue])

  if (!isHosted && connectedChannel) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 space-y-3">
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px] font-medium">WhatsApp BYOB connected</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This assistant is using your own WhatsApp Business number. Lucid still handles the shared agent runtime and worker pipeline, while Meta continues to deliver messages to your channel-specific webhook.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-300">
              BYOB
            </span>
            <span className="inline-flex items-center rounded-full border border-border/40 bg-background/50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {connectedChannel.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <WhatsAppEmbeddedSignupButton
            assistantId={assistantId}
            label="Reconnect with Meta Embedded Signup"
            busyLabel="Reconnecting..."
            onConnected={async () => {
              await handleRefreshSetup()
              router.refresh()
            }}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <ChannelOwnershipCard
          title="Meta webhook handoff"
          description="Use these values in Meta App Dashboard for your Cloud API number. Lucid will receive inbound webhooks on the callback URL below."
          currentTitle="Status"
          currentLabel={
            byobAdmin
              ? byobAdmin.isActive
                ? 'Webhook credentials are stored and this channel is active.'
                : 'Webhook credentials are stored, but the channel is inactive. Re-save credentials if Meta stopped delivering events.'
              : 'Loading WhatsApp BYOB setup details.'
          }
          actionLabel="Refresh details"
          actionDisabled={isLoadingAdmin}
          actionBusy={isLoadingAdmin}
          onAction={() => void handleRefreshSetup()}
          helper="Meta should verify with the same token shown here, and the app secret remains the signing secret Lucid checks on inbound requests."
          isLoading={isLoadingAdmin}
          onRefresh={() => void handleRefreshSetup()}
        >
          {renderCopyField({
            label: 'Callback URL',
            value: byobAdmin?.webhookUrl ?? null,
            copyLabel: 'callback URL',
            helper: 'Paste this into the WhatsApp webhook callback URL field in Meta.',
          })}
          {renderCopyField({
            label: 'Verify token',
            value: byobAdmin?.verifyToken ?? null,
            copyLabel: 'verify token',
            helper: 'Meta must send this token back during webhook verification.',
          })}
        </ChannelOwnershipCard>

        <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium text-foreground">Channel details</p>
              <p className="text-[10px] text-muted-foreground">
                These values help confirm Lucid is pointed at the right WhatsApp Business assets.
              </p>
            </div>
            <a
              href="https://developers.facebook.com/docs/whatsapp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 text-[10px] text-foreground transition-colors hover:bg-background"
            >
              Meta docs
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {renderCopyField({
              label: 'Phone number ID',
              value: byobAdmin?.phoneNumberId ?? null,
              copyLabel: 'phone number ID',
            })}
            {renderCopyField({
              label: 'Business phone number',
              value: byobAdmin?.phoneNumber ?? null,
              copyLabel: 'business phone number',
            })}
            {renderCopyField({
              label: 'Business account ID',
              value: byobAdmin?.businessAccountId ?? null,
              copyLabel: 'business account ID',
            })}
          </div>
          <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-foreground">Checklist</p>
            <ul className="mt-1 space-y-1 text-[10px] text-muted-foreground">
              <li>1. Set Meta callback URL to the Lucid webhook above.</li>
              <li>2. Reuse the verify token shown here during Meta webhook verification.</li>
              <li>3. Subscribe your app to WhatsApp message events for this number.</li>
              <li>4. Keep the same Meta app secret in your Lucid channel credentials so signature checks continue to pass.</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 space-y-3">
      {connectedChannel ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px] font-medium">WhatsApp connected</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This agent is currently active in one hosted WhatsApp chat. You can control who owns the current chat and who should catch new chats on this hosted number.
          </p>
          {chatId ? (
            <p className="text-[10px] text-muted-foreground">
              Connected chat: <span className="font-mono text-foreground">{chatId}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <ChannelDefaultBadge kind={currentChatAgent?.isDefault ? 'default' : 'override'} />
            {surfaceDefault?.isCurrentAssistant ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-300">
                New chats default
              </span>
            ) : null}
          </div>

          <ChannelOwnershipCard
            title="Chat ownership"
            description="Decide which Lucid agent is the default in this WhatsApp chat."
            currentLabel={
              defaultAssistant
                ? `${defaultAssistant.assistantName}${defaultAssistant.isCurrentAssistant ? ' (this assistant)' : ''}`
                : 'Not set'
            }
            actionLabel={currentChatAgent?.isDefault ? 'This assistant is chat default' : 'Make this assistant chat default'}
            actionDisabled={isSavingChatDefault || !currentChatAgent || currentChatAgent.isDefault}
            actionBusy={isSavingChatDefault}
            onAction={() => void handleMakeChatDefault()}
            isLoading={isLoadingAdmin}
            onRefresh={() => void loadAdmin()}
          >
            <ChannelAliasManager
              aliases={currentChatAgent?.aliases ?? []}
              inputPlaceholder="Add a WhatsApp alias"
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
              title="Agents in this chat"
              agents={chatAgents.map((agent) => ({
                key: agent.bindingChannelId,
                name: agent.assistantName,
                aliases: agent.aliases.map((alias) => alias.alias),
                isDefault: agent.isDefault,
                isCurrent: agent.isCurrentAssistant,
              }))}
            />
          </ChannelOwnershipCard>

          {hostedSurfaceId ? (
            <ChannelOwnershipCard
              title="New chats on this hosted number"
              description="Choose which agent should catch new hosted WhatsApp chats before a specific chat override exists."
              currentTitle="Default for new chats"
              currentLabel={
                surfaceDefault
                  ? `${surfaceDefault.assistantName}${surfaceDefault.isCurrentAssistant ? ' (this assistant)' : ''}`
                  : 'No default set'
              }
              actionLabel={
                surfaceDefault?.isCurrentAssistant
                  ? 'This assistant is new-chat default'
                  : 'Make this assistant new-chat default'
              }
              actionDisabled={isSavingSurfaceDefault || !connectedChannel || surfaceDefault?.isCurrentAssistant === true}
              actionBusy={isSavingSurfaceDefault}
              onAction={() => void handleSetSurfaceDefault()}
              secondaryActionLabel={surfaceDefault?.isCurrentAssistant ? 'Clear default' : undefined}
              secondaryActionDisabled={isSavingSurfaceDefault}
              secondaryActionBusy={isSavingSurfaceDefault}
              onSecondaryAction={surfaceDefault?.isCurrentAssistant ? () => void handleClearSurfaceDefault() : null}
            >
              <ChannelAgentRoster
                title="Agents on this hosted number"
                agents={surfaceAgents.map((agent) => ({
                  key: agent.bindingChannelId,
                  name: agent.assistantName,
                  aliases: [],
                  isDefault: agent.isSurfaceDefault,
                  isCurrent: agent.isCurrentAssistant,
                  meta: agent.boundChatId ? `Currently bound to chat ${agent.boundChatId}` : 'No current chat bound',
                }))}
              />
            </ChannelOwnershipCard>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Generate a hosted WhatsApp connect link for this agent. When a user opens it, Lucid binds that chat to the agent and can inherit the shared hosted-number default when no chat override exists yet.
        </p>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareShare className="h-3.5 w-3.5" />}
        {connectedChannel ? 'Generate another WhatsApp connect link' : 'Generate WhatsApp connect link'}
      </button>

      <p className="text-[10px] text-muted-foreground">
        Open the generated WhatsApp link on a phone to bind a chat to this agent.
      </p>
    </div>
  )
}
