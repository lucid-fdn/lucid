'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, MessageCirclePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import {
  ChannelAgentRoster,
  ChannelAliasManager,
  ChannelDefaultBadge,
  ChannelOwnershipCard,
} from '@/components/assistant/channel-admin-blocks'

interface TelegramAliasSummary {
  id: string
  alias: string
}

interface TelegramChatAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  aliases: TelegramAliasSummary[]
  isDefault: boolean
  isCurrentAssistant: boolean
  roleTitle: string
  essence: string
}

interface TelegramDefaultAssistantSummary {
  assistantId: string
  assistantName: string
  bindingChannelId: string
  aliases: TelegramAliasSummary[]
  isCurrentAssistant: boolean
}

export interface TelegramSharePanelProps {
  assistantId: string
  connectedChannel?: AssistantChannel | null
  onRefreshChannels?: () => Promise<void> | void
}

export function TelegramSharePanel({
  assistantId,
  connectedChannel = null,
  onRefreshChannels: _onRefreshChannels,
}: TelegramSharePanelProps) {
  const router = useRouter()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [chatAgents, setChatAgents] = useState<TelegramChatAgentSummary[]>([])
  const [defaultAssistant, setDefaultAssistant] = useState<TelegramDefaultAssistantSummary | null>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null)
  const [isSavingDefault, setIsSavingDefault] = useState(false)
  const [lastConnectInfo, setLastConnectInfo] = useState<{
    connectUrl: string
    webConnectUrl: string
    manualStartCommand: string
  } | null>(null)

  const chatId =
    typeof connectedChannel?.external_channel_id === 'string' &&
    connectedChannel.external_channel_id.trim().length > 0
      ? connectedChannel.external_channel_id.trim()
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

  const loadAdmin = useCallback(async () => {
    if (!chatId) {
      setChatAgents([])
      setDefaultAssistant(null)
      return
    }

    setIsLoadingAdmin(true)
    try {
      const response = await fetch(
        `/api/assistants/${assistantId}/telegram-admin?chatId=${encodeURIComponent(chatId)}`,
      )
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            bindings?: TelegramChatAgentSummary[]
            defaultAssistant?: TelegramDefaultAssistantSummary | null
          }
        | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Telegram admin data')
      }

      setChatAgents(Array.isArray(payload?.bindings) ? payload.bindings : [])
      setDefaultAssistant(payload?.defaultAssistant ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Telegram admin data')
    } finally {
      setIsLoadingAdmin(false)
    }
  }, [assistantId, chatId])

  useEffect(() => {
    if (!connectedChannel) return
    void loadAdmin()
  }, [connectedChannel, loadAdmin])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/telegram-connect`, {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            connectUrl?: string
            webConnectUrl?: string
            manualStartCommand?: string
          }
        | null
      if (!response.ok || !payload?.connectUrl || !payload?.webConnectUrl || !payload?.manualStartCommand) {
        throw new Error(payload?.error || 'Failed to generate Telegram connect link')
      }

      setLastConnectInfo({
        connectUrl: payload.connectUrl,
        webConnectUrl: payload.webConnectUrl,
        manualStartCommand: payload.manualStartCommand,
      })
      window.open(payload.connectUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate Telegram connect link')
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
      const response = await fetch(`/api/assistants/${assistantId}/telegram-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, alias: nextAlias }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to create Telegram alias')
      setAliasDraft('')
      toast.success('Telegram alias added')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Telegram alias')
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasConflictAgent, aliasDraft, assistantId, chatId, loadAdmin, router])

  const handleDeleteAlias = useCallback(async (aliasId: string) => {
    if (!chatId) return
    setDeletingAliasId(aliasId)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/telegram-aliases`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, aliasId }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete Telegram alias')
      toast.success('Telegram alias removed')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete Telegram alias')
    } finally {
      setDeletingAliasId(null)
    }
  }, [assistantId, chatId, loadAdmin, router])

  const handleMakeDefault = useCallback(async () => {
    if (!chatId || !currentChatAgent) return
    setIsSavingDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/telegram-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, assistantId }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to update Telegram default agent')
      toast.success('Telegram chat default updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update Telegram default agent')
    } finally {
      setIsSavingDefault(false)
    }
  }, [assistantId, chatId, currentChatAgent, loadAdmin, router])

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 space-y-3">
      {connectedChannel ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px] font-medium">Telegram connected</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This agent is active in one Telegram chat. You can control who owns the current chat and which aliases people can use there.
          </p>
          {chatId ? (
            <p className="text-[10px] text-muted-foreground">
              Connected chat: <span className="font-mono text-foreground">{chatId}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <ChannelDefaultBadge kind={currentChatAgent?.isDefault ? 'default' : 'override'} />
          </div>
          <ChannelOwnershipCard
            title="Chat ownership"
            description="Decide which Lucid agent is the default in this Telegram chat."
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
              inputPlaceholder="Add a Telegram alias"
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
                meta: `${agent.roleTitle || 'Agent'}${agent.aliases.length > 0 ? ` • Aliases: ${agent.aliases.map((alias) => alias.alias).join(', ')}` : ''}`,
                extra: agent.essence ? (
                  <p className="text-[10px] text-muted-foreground">{agent.essence}</p>
                ) : null,
              }))}
            />
          </ChannelOwnershipCard>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Generate a Telegram connect link for this agent. When someone opens it and starts the bot, Lucid binds that chat to the agent.
        </p>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCirclePlus className="h-3.5 w-3.5" />}
        {connectedChannel ? 'Generate another Telegram connect link' : 'Generate Telegram connect link'}
      </button>

      {lastConnectInfo ? (
        <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-medium text-foreground">Latest connect shortcut</p>
          <a
            href={lastConnectInfo.webConnectUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-[10px] text-emerald-300 hover:underline"
          >
            Open in Telegram Web
          </a>
          <p className="text-[10px] text-muted-foreground">
            Manual command: <span className="font-mono text-foreground">{lastConnectInfo.manualStartCommand}</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}
