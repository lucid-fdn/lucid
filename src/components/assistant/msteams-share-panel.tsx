'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import {
  ChannelAgentRoster,
  ChannelAliasManager,
  ChannelDefaultBadge,
  ChannelOwnershipCard,
} from '@/components/assistant/channel-admin-blocks'

interface TeamsAliasSummary {
  id: string
  alias: string
}

interface TeamsConversationAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  aliases: TeamsAliasSummary[]
  isDefault: boolean
  isCurrentAssistant: boolean
}

interface TeamsTenantAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  bindingChannelId: string
  aliases: TeamsAliasSummary[]
  isCurrentAssistant: boolean
  isSurfaceDefault: boolean
  boundConversationId: string | null
  isActive: boolean
  isConversationDefault: boolean
}

interface TeamsDefaultAssistantSummary {
  assistantId: string
  assistantName: string
  bindingChannelId?: string | null
  assistantChannelId?: string | null
  aliases?: TeamsAliasSummary[]
  isCurrentAssistant: boolean
}

export interface TeamsSharePanelProps {
  assistantId: string
  connectedChannel?: AssistantChannel | null
  onRefreshChannels?: () => Promise<void> | void
}

export function TeamsSharePanel({
  assistantId,
  connectedChannel = null,
  onRefreshChannels: _onRefreshChannels,
}: TeamsSharePanelProps) {
  const router = useRouter()
  const [isInstalling, setIsInstalling] = useState(false)
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [conversationAgents, setConversationAgents] = useState<TeamsConversationAgentSummary[]>([])
  const [defaultAssistant, setDefaultAssistant] = useState<TeamsDefaultAssistantSummary | null>(null)
  const [surfaceDefault, setSurfaceDefault] = useState<TeamsDefaultAssistantSummary | null>(null)
  const [tenantAgents, setTenantAgents] = useState<TeamsTenantAgentSummary[]>([])
  const [aliasDraft, setAliasDraft] = useState('')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null)
  const [isSavingConversationDefault, setIsSavingConversationDefault] = useState(false)
  const [isSavingTenantDefault, setIsSavingTenantDefault] = useState(false)

  const conversationId =
    typeof connectedChannel?.external_channel_id === 'string' &&
    connectedChannel.external_channel_id.trim().length > 0
      ? connectedChannel.external_channel_id.trim()
      : null
  const teamsConfig =
    connectedChannel?.channel_config && typeof connectedChannel.channel_config === 'object'
      ? connectedChannel.channel_config
      : {}
  const tenantId =
    typeof teamsConfig.msteams_tenant_id === 'string' && teamsConfig.msteams_tenant_id.trim().length > 0
      ? teamsConfig.msteams_tenant_id.trim()
      : null
  const tenantName =
    typeof teamsConfig.msteams_tenant_name === 'string' && teamsConfig.msteams_tenant_name.trim().length > 0
      ? teamsConfig.msteams_tenant_name.trim()
      : null
  const currentConversationAgent = useMemo(
    () => conversationAgents.find((agent) => agent.isCurrentAssistant) ?? null,
    [conversationAgents],
  )
  const currentTenantAgent = useMemo(
    () => tenantAgents.find((agent) => agent.isCurrentAssistant) ?? null,
    [tenantAgents],
  )
  const aliasConflictAgent = useMemo(() => {
    const normalizedDraft = aliasDraft.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalizedDraft) return null
    return (
      tenantAgents.find((agent) =>
        agent.aliases.some(
          (alias) => alias.alias.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedDraft,
        ),
      ) ?? null
    )
  }, [aliasDraft, tenantAgents])

  const loadAdmin = useCallback(async () => {
    if (!tenantId && !conversationId) {
      setConversationAgents([])
      setDefaultAssistant(null)
      setSurfaceDefault(null)
      setTenantAgents([])
      return
    }

    setIsLoadingAdmin(true)
    try {
      const params = new URLSearchParams()
      if (conversationId) params.set('conversationId', conversationId)
      if (tenantId) params.set('tenantId', tenantId)
      const response = await fetch(`/api/assistants/${assistantId}/msteams-admin?${params.toString()}`)
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            bindings?: TeamsConversationAgentSummary[]
            defaultAssistant?: TeamsDefaultAssistantSummary | null
            surfaceDefault?: TeamsDefaultAssistantSummary | null
            tenantAgents?: TeamsTenantAgentSummary[]
          }
        | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Microsoft Teams admin data')
      }

      setConversationAgents(Array.isArray(payload?.bindings) ? payload.bindings : [])
      setDefaultAssistant(payload?.defaultAssistant ?? null)
      setSurfaceDefault(payload?.surfaceDefault ?? null)
      setTenantAgents(Array.isArray(payload?.tenantAgents) ? payload.tenantAgents : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Microsoft Teams admin data')
    } finally {
      setIsLoadingAdmin(false)
    }
  }, [assistantId, conversationId, tenantId])

  useEffect(() => {
    if (!connectedChannel) return
    void loadAdmin()
  }, [connectedChannel, loadAdmin])

  const handleInstall = useCallback(async () => {
    setIsInstalling(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/msteams-connect`, {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; connectUrl?: string }
        | null
      if (!response.ok || !payload?.connectUrl) {
        throw new Error(payload?.error || 'Failed to generate Microsoft Teams install link')
      }

      window.open(payload.connectUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate Microsoft Teams install link',
      )
    } finally {
      setIsInstalling(false)
    }
  }, [assistantId])

  const handleCreateAlias = useCallback(async () => {
    const nextAlias = aliasDraft.trim()
    if (!tenantId || nextAlias.length === 0) return
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
      const response = await fetch(`/api/assistants/${assistantId}/msteams-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, alias: nextAlias }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to create Microsoft Teams alias')

      setAliasDraft('')
      toast.success('Microsoft Teams alias added')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Microsoft Teams alias')
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasConflictAgent, aliasDraft, assistantId, loadAdmin, router, tenantId])

  const handleDeleteAlias = useCallback(async (aliasId: string) => {
    if (!tenantId) return
    setDeletingAliasId(aliasId)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/msteams-aliases`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, aliasId }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete Microsoft Teams alias')
      toast.success('Microsoft Teams alias removed')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete Microsoft Teams alias')
    } finally {
      setDeletingAliasId(null)
    }
  }, [assistantId, loadAdmin, router, tenantId])

  const handleMakeConversationDefault = useCallback(async () => {
    if (!conversationId || !currentConversationAgent) return
    setIsSavingConversationDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/msteams-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_conversation_default',
          conversationId,
          bindingChannelId: currentConversationAgent.bindingChannelId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update Microsoft Teams conversation default')
      }
      toast.success('Microsoft Teams conversation default updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update Microsoft Teams conversation default',
      )
    } finally {
      setIsSavingConversationDefault(false)
    }
  }, [assistantId, conversationId, currentConversationAgent, loadAdmin, router])

  const handleSetTenantDefault = useCallback(async () => {
    if (!tenantId || !currentTenantAgent) return
    setIsSavingTenantDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/msteams-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_tenant_default',
          tenantId,
          assistantChannelId: currentTenantAgent.bindingChannelId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update Microsoft Teams tenant default')
      }
      toast.success('Microsoft Teams tenant default updated')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update Microsoft Teams tenant default',
      )
    } finally {
      setIsSavingTenantDefault(false)
    }
  }, [assistantId, currentTenantAgent, loadAdmin, router, tenantId])

  const handleClearTenantDefault = useCallback(async () => {
    if (!tenantId) return
    setIsSavingTenantDefault(true)
    try {
      const response = await fetch(`/api/assistants/${assistantId}/msteams-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_tenant_default',
          tenantId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to clear Microsoft Teams tenant default')
      }
      toast.success('Microsoft Teams tenant default cleared')
      await loadAdmin()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to clear Microsoft Teams tenant default',
      )
    } finally {
      setIsSavingTenantDefault(false)
    }
  }, [assistantId, loadAdmin, router, tenantId])

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 space-y-3">
      {connectedChannel ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px] font-medium">Microsoft Teams connected</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The shared Lucid Teams app is installed{tenantName ? ` for ${tenantName}` : ''}. You can choose who owns this conversation and which assistant should catch new conversations in the tenant.
          </p>
          {tenantName ? (
            <p className="text-[10px] text-muted-foreground">
              Connected tenant: <span className="text-foreground">{tenantName}</span>
            </p>
          ) : null}
          {conversationId ? (
            <p className="text-[10px] text-muted-foreground">
              Current conversation: <span className="font-mono text-foreground">{conversationId}</span>
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              No Teams conversation is bound to this assistant yet. Open the target Teams chat and type <span className="font-mono text-foreground">bind</span>, or rely on the tenant default below.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <ChannelDefaultBadge kind={currentConversationAgent?.isDefault ? 'default' : 'override'} />
            {surfaceDefault?.isCurrentAssistant ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-300">
                Tenant default
              </span>
            ) : null}
          </div>

          {conversationId ? (
            <ChannelOwnershipCard
              title="Conversation ownership"
              description="Decide which Lucid agent is the default in this Microsoft Teams conversation."
              currentLabel={
                defaultAssistant
                  ? `${defaultAssistant.assistantName}${defaultAssistant.isCurrentAssistant ? ' (this assistant)' : ''}`
                  : 'Not set'
              }
              actionLabel={
                currentConversationAgent?.isDefault
                  ? 'This assistant is conversation default'
                  : 'Make this assistant conversation default'
              }
              actionDisabled={
                isSavingConversationDefault ||
                !currentConversationAgent ||
                currentConversationAgent.isDefault
              }
              actionBusy={isSavingConversationDefault}
              onAction={() => void handleMakeConversationDefault()}
              isLoading={isLoadingAdmin}
              onRefresh={() => void loadAdmin()}
            >
              <ChannelAgentRoster
                title="Agents in this conversation"
                agents={conversationAgents.map((agent) => ({
                  key: agent.bindingChannelId,
                  name: agent.assistantName,
                  aliases: agent.aliases.map((alias) => alias.alias),
                  isDefault: agent.isDefault,
                  isCurrent: agent.isCurrentAssistant,
                  meta:
                    agent.aliases.length > 0
                      ? `Aliases: ${agent.aliases.map((alias) => alias.alias).join(', ')}`
                      : 'No aliases',
                }))}
              />
            </ChannelOwnershipCard>
          ) : null}

          {tenantId ? (
            <ChannelOwnershipCard
              title="Tenant default"
              description="Choose which assistant should catch new Microsoft Teams conversations in this tenant when nothing is explicitly bound yet."
              currentLabel={
                surfaceDefault
                  ? `${surfaceDefault.assistantName}${surfaceDefault.isCurrentAssistant ? ' (this assistant)' : ''}`
                  : 'No tenant default'
              }
              actionLabel={
                surfaceDefault?.isCurrentAssistant
                  ? 'Clear tenant default'
                  : 'Make this assistant tenant default'
              }
              actionDisabled={
                isSavingTenantDefault ||
                !currentTenantAgent ||
                (!surfaceDefault?.isCurrentAssistant && currentTenantAgent.isSurfaceDefault)
              }
              actionBusy={isSavingTenantDefault}
              onAction={() =>
                void (surfaceDefault?.isCurrentAssistant
                  ? handleClearTenantDefault()
                  : handleSetTenantDefault())
              }
              helper="Tenant defaults apply only when no conversation-specific default already owns the chat."
              isLoading={isLoadingAdmin}
              onRefresh={() => void loadAdmin()}
            >
              <ChannelAliasManager
                title="Tenant aliases"
                description="These aliases work across the shared Teams tenant for bind and switch commands."
                aliases={currentTenantAgent?.aliases ?? []}
                inputPlaceholder="Add a Teams alias"
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
                title="Agents in this tenant"
                agents={tenantAgents.map((agent) => ({
                  key: agent.bindingChannelId,
                  name: agent.assistantName,
                  aliases: agent.aliases.map((alias) => alias.alias),
                  isDefault: agent.isSurfaceDefault,
                  isCurrent: agent.isCurrentAssistant,
                  meta: agent.boundConversationId
                    ? `Bound conversation: ${agent.boundConversationId}`
                    : 'Ready for new conversations',
                  extra: agent.isConversationDefault ? (
                    <p className="text-[10px] text-muted-foreground">Currently default in its bound conversation.</p>
                  ) : null,
                }))}
              />
            </ChannelOwnershipCard>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            Install the shared Lucid Microsoft Teams app. Teams tenants can bind the installed app to this agent without creating a separate bot.
          </p>

          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={isInstalling}
            className="w-full h-9 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isInstalling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Install on Microsoft Teams
          </button>

          <p className="text-[10px] text-muted-foreground">
            After install, open the target Teams conversation and type <span className="font-mono text-foreground">bind</span>, or later mark this assistant as the tenant default to catch new conversations automatically.
          </p>
        </>
      )}
    </div>
  )
}
