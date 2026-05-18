'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import {
  ChannelAgentRoster,
  ChannelAliasManager,
  ChannelDefaultBadge,
  ChannelOwnershipCard,
} from '@/components/assistant/channel-admin-blocks'

interface IMessageAliasSummary {
  id: string
  alias: string
}

interface IMessageChatAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  aliases: IMessageAliasSummary[]
  isDefault: boolean
  isCurrentAssistant: boolean
}

interface IMessageDefaultAssistantSummary {
  assistantId: string
  assistantName: string
  bindingChannelId: string
  aliases: IMessageAliasSummary[]
  isCurrentAssistant: boolean
}

interface IMessageHostedSurfaceSummary {
  id: string
  displayName: string | null
  status: string
  lastHeartbeatAt: string | null
  lastProbeAt: string | null
  lastError: string | null
}

interface IMessageHostedAdminPayload {
  channelId: string
  hostedSurfaceId: string
  surface: IMessageHostedSurfaceSummary
  surfaceAgents: IMessageChatAgentSummary[]
  surfaceDefault: {
    assistantId: string
    assistantChannelId: string | null
  } | null
  chatId: string | null
  chatBindings: IMessageChatAgentSummary[]
}

interface ByobBridgeConfig {
  webhookUrl: string
  webhookSecret: string
  samplePayload: Record<string, unknown>
}

interface HostedProviderConfig {
  surfaceId: string
  surfaceToken: string
  heartbeatUrl: string
  dispatchUrl: string
  ingressUrl: string
}

type BridgeConfig =
  | { mode: 'byob'; value: ByobBridgeConfig }
  | { mode: 'hosted'; value: HostedProviderConfig }

export interface IMessageSharePanelProps {
  assistantId: string
  connectedChannel?: AssistantChannel | null
  onRefreshChannels?: () => Promise<void> | void
}

export function IMessageSharePanel({
  assistantId,
  connectedChannel = null,
  onRefreshChannels: _onRefreshChannels,
}: IMessageSharePanelProps) {
  const router = useRouter()
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [chatAgents, setChatAgents] = useState<IMessageChatAgentSummary[]>([])
  const [defaultAssistant, setDefaultAssistant] = useState<IMessageDefaultAssistantSummary | null>(null)
  const [hostedAdmin, setHostedAdmin] = useState<IMessageHostedAdminPayload | null>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null)
  const [isSavingDefault, setIsSavingDefault] = useState(false)
  const [isSavingSurfaceDefault, setIsSavingSurfaceDefault] = useState(false)
  const [bridgeConfig, setBridgeConfig] = useState<BridgeConfig | null>(null)
  const [isLoadingBridgeConfig, setIsLoadingBridgeConfig] = useState(false)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  const isHosted = connectedChannel?.connection_mode === 'hosted'
  const chatId =
    isHosted
      ? hostedAdmin?.chatId ?? null
      : typeof connectedChannel?.external_channel_id === 'string' &&
          connectedChannel.external_channel_id.trim().length > 0
        ? connectedChannel.external_channel_id.trim()
        : null

  const currentChatAgent = useMemo(
    () => (isHosted ? hostedAdmin?.chatBindings ?? [] : chatAgents).find((agent) => agent.isCurrentAssistant) ?? null,
    [chatAgents, hostedAdmin?.chatBindings, isHosted],
  )
  const hostedSurfaceAgents = useMemo(
    () => hostedAdmin?.surfaceAgents ?? [],
    [hostedAdmin?.surfaceAgents],
  )
  const currentSurfaceAgent = useMemo(
    () => hostedSurfaceAgents.find((agent) => agent.isCurrentAssistant) ?? null,
    [hostedSurfaceAgents],
  )

  const aliasConflictAgent = useMemo(() => {
    const normalizedDraft = aliasDraft.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalizedDraft) return null
    return (
      (isHosted ? hostedAdmin?.chatBindings ?? [] : chatAgents).find((agent) =>
        agent.aliases.some(
          (alias) => alias.alias.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedDraft,
        ),
      ) ?? null
    )
  }, [aliasDraft, chatAgents, hostedAdmin?.chatBindings, isHosted])

  const loadAdmin = useCallback(async () => {
    if (!connectedChannel?.id) return

    if (isHosted) {
      setIsLoadingAdmin(true)
      try {
        const response = await fetch(
          `/api/assistants/${assistantId}/imessage-admin?channelId=${encodeURIComponent(connectedChannel.id)}`,
        )
        const payload = (await response.json().catch(() => null)) as
          | (IMessageHostedAdminPayload & { error?: string })
          | null
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load hosted iMessage admin data')
        }
        setHostedAdmin(payload)
        return
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load hosted iMessage admin data')
      } finally {
        setIsLoadingAdmin(false)
      }
      return
    }

    if (!chatId) {
      setChatAgents([])
      setDefaultAssistant(null)
      return
    }

    setIsLoadingAdmin(true)
    try {
      const response = await fetch(
        `/api/assistants/${assistantId}/imessage-admin?chatId=${encodeURIComponent(chatId)}`,
      )
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            bindings?: IMessageChatAgentSummary[]
            defaultAssistant?: IMessageDefaultAssistantSummary | null
          }
        | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load iMessage admin data')
      }

      setChatAgents(Array.isArray(payload?.bindings) ? payload.bindings : [])
      setDefaultAssistant(payload?.defaultAssistant ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load iMessage admin data')
    } finally {
      setIsLoadingAdmin(false)
    }
  }, [assistantId, chatId, connectedChannel?.id, isHosted])

  useEffect(() => {
    if (!connectedChannel) return
    void loadAdmin()
  }, [connectedChannel, loadAdmin])

  const handleRefreshBridgeConfig = useCallback(async () => {
    if (!connectedChannel?.id) return
    setIsLoadingBridgeConfig(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/imessage-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: connectedChannel.id }),
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            webhookUrl?: string
            webhookSecret?: string
            samplePayload?: Record<string, unknown>
            providerConfig?: HostedProviderConfig
          }
        | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to generate iMessage config')
      }

      if (payload?.providerConfig) {
        setBridgeConfig({ mode: 'hosted', value: payload.providerConfig })
        toast.success('Hosted iMessage provider config refreshed')
      } else if (payload?.webhookUrl && payload?.webhookSecret && payload?.samplePayload) {
        setBridgeConfig({
          mode: 'byob',
          value: {
            webhookUrl: payload.webhookUrl,
            webhookSecret: payload.webhookSecret,
            samplePayload: payload.samplePayload,
          },
        })
        toast.success('iMessage bridge config refreshed')
      } else {
        throw new Error('Failed to generate iMessage config')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate iMessage config')
    } finally {
      setIsLoadingBridgeConfig(false)
    }
  }, [assistantId, connectedChannel?.id])

  const copyValue = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedValue(label)
      window.setTimeout(() => setCopiedValue(null), 1800)
    } catch {
      toast.error(`Failed to copy ${label}`)
    }
  }, [])

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
      const response = await fetch(`/api/assistants/${assistantId}/imessage-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, alias: nextAlias }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to create iMessage alias')
      setAliasDraft('')
      toast.success('iMessage alias added')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create iMessage alias')
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasConflictAgent, aliasDraft, assistantId, chatId, loadAdmin, router])

  const handleDeleteAlias = useCallback(async (aliasId: string) => {
    if (!chatId) return
    setDeletingAliasId(aliasId)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/imessage-aliases`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, aliasId }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete iMessage alias')
      toast.success('iMessage alias removed')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete iMessage alias')
    } finally {
      setDeletingAliasId(null)
    }
  }, [assistantId, chatId, loadAdmin, router])

  const handleMakeDefault = useCallback(async () => {
    if (!chatId || !currentChatAgent) return
    setIsSavingDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/imessage-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_chat_default',
          chatId,
          bindingChannelId: currentChatAgent.bindingChannelId,
          ...(isHosted ? { hosted: true } : {}),
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to update iMessage default agent')
      toast.success('iMessage chat default updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update iMessage default agent')
    } finally {
      setIsSavingDefault(false)
    }
  }, [assistantId, chatId, currentChatAgent, isHosted, loadAdmin, router])

  const handleMakeSurfaceDefault = useCallback(async () => {
    if (!hostedAdmin?.hostedSurfaceId || !currentSurfaceAgent) return
    setIsSavingSurfaceDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/imessage-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_surface_default',
          hostedSurfaceId: hostedAdmin.hostedSurfaceId,
          assistantChannelId: currentSurfaceAgent.bindingChannelId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to update hosted iMessage default')
      toast.success('Hosted iMessage default updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update hosted iMessage default')
    } finally {
      setIsSavingSurfaceDefault(false)
    }
  }, [assistantId, currentSurfaceAgent, hostedAdmin?.hostedSurfaceId, loadAdmin, router])

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 space-y-3">
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <p className="text-[11px] font-medium">
            {isHosted ? 'Hosted iMessage connected' : 'iMessage connected'}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isHosted
            ? 'This channel uses Lucid’s hosted iMessage control plane. The worker routes messages normally, while a managed provider node owns the Apple transport.'
            : 'This channel uses your own iMessage bridge. Lucid receives normalized inbound messages at the webhook below and replies through your configured `imsg` runtime.'}
        </p>
        {chatId ? (
          <p className="text-[10px] text-muted-foreground">
            Active chat target: <span className="font-mono text-foreground break-all">{chatId}</span>
          </p>
        ) : isHosted ? (
          <p className="text-[10px] text-muted-foreground">
            Surface default handles new chats until a specific chat override is created.
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Waiting for the first inbound iMessage to bind this channel to a concrete chat target.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <ChannelDefaultBadge
            kind={
              isHosted
                ? hostedAdmin?.surfaceAgents.find((agent) => agent.isCurrentAssistant && agent.isDefault)
                  ? 'default'
                  : 'override'
                : currentChatAgent?.isDefault
                  ? 'default'
                  : 'override'
            }
          />
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-background/30 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium text-foreground">
              {isHosted ? 'Provider config' : 'Bridge config'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isHosted
                ? 'Use this to attach or rotate the hosted iMessage provider node.'
                : 'Use this in your iMessage bridge or OpenClaw relay.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshBridgeConfig()}
            disabled={isLoadingBridgeConfig || !connectedChannel?.id}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isLoadingBridgeConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>

        {bridgeConfig?.mode === 'hosted' ? (
          <div className="space-y-2">
            {[
              ['Surface ID', bridgeConfig.value.surfaceId, 'surface id'],
              ['Surface token', bridgeConfig.value.surfaceToken, 'surface token'],
              ['Heartbeat URL', bridgeConfig.value.heartbeatUrl, 'heartbeat url'],
              ['Dispatch URL', bridgeConfig.value.dispatchUrl, 'dispatch url'],
              ['Ingress URL', bridgeConfig.value.ingressUrl, 'ingress url'],
            ].map(([label, value, copyLabel]) => (
              <div key={label} className="rounded-md border border-border/40 bg-card/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
                  <button
                    type="button"
                    onClick={() => void copyValue(value, copyLabel)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-foreground">{value}</p>
              </div>
            ))}
          </div>
        ) : bridgeConfig?.mode === 'byob' ? (
          <div className="space-y-2">
            <div className="rounded-md border border-border/40 bg-card/40 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Webhook URL</span>
                <button
                  type="button"
                  onClick={() => void copyValue(bridgeConfig.value.webhookUrl, 'webhook url')}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-foreground">{bridgeConfig.value.webhookUrl}</p>
            </div>
            <div className="rounded-md border border-border/40 bg-card/40 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Webhook secret</span>
                <button
                  type="button"
                  onClick={() => void copyValue(bridgeConfig.value.webhookSecret, 'webhook secret')}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-foreground">{bridgeConfig.value.webhookSecret}</p>
            </div>
            <div className="rounded-md border border-border/40 bg-card/40 px-2.5 py-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample payload</span>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                {JSON.stringify(bridgeConfig.value.samplePayload, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {isHosted
              ? 'Refresh to reveal the current hosted provider credentials for this surface.'
              : 'Generate bridge credentials to configure your BYOB iMessage sender.'}
          </p>
        )}

        {copiedValue ? (
          <p className="text-[10px] text-emerald-400">{copiedValue} copied</p>
        ) : null}
      </div>

      {isHosted ? (
        <>
          <ChannelOwnershipCard
            title="Hosted surface ownership"
            description="Choose which Lucid agent handles new iMessage chats on this hosted surface by default."
            currentLabel={
              currentSurfaceAgent?.isDefault
                ? `${currentSurfaceAgent.assistantName} (this assistant)`
                : hostedAdmin?.surfaceDefault?.assistantId
                  ? 'Another assistant owns the surface default.'
                  : 'Not set'
            }
            actionLabel={
              currentSurfaceAgent?.isDefault
                ? 'This assistant is surface default'
                : 'Make this assistant surface default'
            }
            actionDisabled={isSavingSurfaceDefault || !currentSurfaceAgent || currentSurfaceAgent.isDefault}
            actionBusy={isSavingSurfaceDefault}
            onAction={() => void handleMakeSurfaceDefault()}
            helper={
              hostedAdmin?.surface
                ? `Status: ${hostedAdmin.surface.status}${hostedAdmin.surface.lastError ? ` · ${hostedAdmin.surface.lastError}` : ''}`
                : null
            }
            isLoading={isLoadingAdmin}
            onRefresh={() => void loadAdmin()}
          />

          <ChannelAgentRoster
            title="Agents on this hosted iMessage surface"
            agents={hostedSurfaceAgents.map((agent) => ({
              key: agent.bindingChannelId,
              name: agent.assistantName,
              aliases: agent.aliases.map((alias) => alias.alias),
              isCurrent: agent.isCurrentAssistant,
              isDefault: agent.isDefault,
              meta: agent.assistantDescription,
            }))}
          />

          {chatId ? (
            <>
              <ChannelOwnershipCard
                title="Active chat override"
                description="If this chat has a dedicated override, you can keep it pinned to this assistant."
                currentLabel={
                  currentChatAgent?.isDefault
                    ? `${currentChatAgent.assistantName} (this assistant)`
                    : hostedAdmin?.chatBindings.find((agent) => agent.isDefault)?.assistantName ?? 'No override'
                }
                actionLabel={
                  currentChatAgent?.isDefault
                    ? 'This assistant is chat default'
                    : 'Make this assistant chat default'
                }
                actionDisabled={isSavingDefault || !currentChatAgent || currentChatAgent.isDefault}
                actionBusy={isSavingDefault}
                onAction={() => void handleMakeDefault()}
                isLoading={isLoadingAdmin}
                onRefresh={() => void loadAdmin()}
              >
                <ChannelAliasManager
                  aliases={currentChatAgent?.aliases ?? []}
                  inputPlaceholder="Add an iMessage alias"
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
              </ChannelOwnershipCard>

              <ChannelAgentRoster
                title="Agents in this iMessage chat"
                agents={(hostedAdmin?.chatBindings ?? []).map((agent) => ({
                  key: agent.bindingChannelId,
                  name: agent.assistantName,
                  aliases: agent.aliases.map((alias) => alias.alias),
                  isCurrent: agent.isCurrentAssistant,
                  isDefault: agent.isDefault,
                  meta: agent.assistantDescription,
                }))}
              />
            </>
          ) : null}
        </>
      ) : chatId ? (
        <>
          <ChannelOwnershipCard
            title="Chat ownership"
            description="Decide which Lucid agent is the default for this iMessage chat target."
            currentLabel={
              defaultAssistant
                ? `${defaultAssistant.assistantName}${defaultAssistant.isCurrentAssistant ? ' (this assistant)' : ''}`
                : 'Not set'
            }
            actionLabel={currentChatAgent?.isDefault ? 'This assistant is chat default' : 'Make this assistant chat default'}
            actionDisabled={isSavingDefault || !currentChatAgent || currentChatAgent.isDefault}
            actionBusy={isSavingDefault}
            onAction={() => void handleMakeDefault()}
            isLoading={isLoadingAdmin}
            onRefresh={() => void loadAdmin()}
          >
            <ChannelAliasManager
              aliases={currentChatAgent?.aliases ?? []}
              inputPlaceholder="Add an iMessage alias"
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
          </ChannelOwnershipCard>

          <ChannelAgentRoster
            title="Agents in this iMessage chat"
            agents={chatAgents.map((agent) => ({
              key: agent.bindingChannelId,
              name: agent.assistantName,
              aliases: agent.aliases.map((alias) => alias.alias),
              isCurrent: agent.isCurrentAssistant,
              isDefault: agent.isDefault,
              meta: agent.assistantDescription,
            }))}
          />
        </>
      ) : null}
    </div>
  )
}
