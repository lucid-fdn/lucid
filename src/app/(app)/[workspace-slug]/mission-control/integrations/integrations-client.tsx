'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, PackageCheck, Plug, Puzzle, Radio, TerminalSquare, XCircle } from 'lucide-react'

import { EmptyState } from '@/components/mission-control/empty-state'
import { KPICard } from '@/components/mission-control/kpi-card'
import { PageSection } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface ChannelHealth {
  id: string
  channel_type: string
  assistant_name: string
  is_active: boolean
  last_event_at: string | null
  error_count_24h: number
}

interface PluginStatus {
  id: string
  slug: string
  name: string
  is_active: boolean
  tool_call_count: number
  error_count: number
}

interface LucidPackSummary {
  id: string
  slug: string
  name: string
  status: string
  manifest?: {
    resources?: Array<{ key: string; kind: string; name: string; policy: string }>
  }
}

interface ExternalKnowledgeClient {
  id: string
  name: string
  status: string
  scopes: string[]
  lastUsedAt?: string | null
}

interface IntegrationsClientProps {
  orgId: string
}

export function IntegrationsClient({ orgId }: IntegrationsClientProps) {
  const [channels, setChannels] = useState<ChannelHealth[]>([])
  const [plugins, setPlugins] = useState<PluginStatus[]>([])
  const [packs, setPacks] = useState<LucidPackSummary[]>([])
  const [externalClients, setExternalClients] = useState<ExternalKnowledgeClient[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [res, packsRes, externalClientsRes] = await Promise.all([
        fetch(`/api/mission-control/integrations?org_id=${orgId}`),
        fetch(`/api/agent-ops/packs?org_id=${orgId}&status=active&limit=12`),
        fetch(`/api/knowledge/external-clients?org_id=${orgId}&status=active&limit=12`),
      ])
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels ?? [])
        setPlugins(data.plugins ?? [])
      }
      if (packsRes.ok) {
        const data = await packsRes.json()
        setPacks(data.packs ?? [])
      }
      if (externalClientsRes.ok) {
        const data = await externalClientsRes.json()
        setExternalClients(data.clients ?? [])
      }
    } catch {
      // Keep the page usable with empty states when one integration endpoint fails.
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      </div>
    )
  }

  const activeChannels = channels.filter((c) => c.is_active).length
  const activePlugins = plugins.filter((p) => p.is_active).length

  if (channels.length === 0 && plugins.length === 0 && packs.length === 0 && externalClients.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Plug className="h-8 w-8" />}
          title="No integrations configured"
          description="Connect a channel or install a plugin to monitor health here."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPICard label="Channels" value={`${activeChannels}/${channels.length}`} icon={Radio} />
        <KPICard label="Plugins" value={`${activePlugins}/${plugins.length}`} icon={Puzzle} />
        <KPICard label="Managed Packs" value={packs.length} icon={PackageCheck} />
        <KPICard
          label="Knowledge Clients"
          value={externalClients.length}
          icon={TerminalSquare}
          variant={externalClients.length === 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PageSection title="Channel Health" description="Connected messaging and execution channels." contentClassName="space-y-2">
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No channels connected.</p>
          ) : channels.map((channel) => (
            <WorkspaceActionRow
              key={channel.id}
              title={channel.channel_type}
              description={channel.assistant_name}
              icon={channel.is_active ? CheckCircle2 : XCircle}
              tone={channel.error_count_24h > 0 ? 'danger' : channel.is_active ? 'success' : 'default'}
              meta={channel.error_count_24h > 0 ? `${channel.error_count_24h} errors` : channel.is_active ? 'Active' : 'Inactive'}
            />
          ))}
        </PageSection>

        <PageSection title="Plugin Status" description="Installed tools and recent execution health." contentClassName="space-y-2">
          {plugins.length === 0 ? (
            <p className="text-xs text-muted-foreground">No plugins installed for this workspace.</p>
          ) : plugins.map((plugin) => (
            <WorkspaceActionRow
              key={plugin.id}
              title={plugin.name}
              description={`${plugin.tool_call_count} calls`}
              icon={Puzzle}
              tone={plugin.error_count > 0 ? 'danger' : plugin.is_active ? 'success' : 'default'}
              meta={plugin.error_count > 0 ? `${plugin.error_count} errors` : plugin.is_active ? 'Active' : 'Inactive'}
            />
          ))}
        </PageSection>

        <PageSection title="Managed Packs" description="Reusable bundles installed for this workspace." contentClassName="space-y-2">
          {packs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active packs available for this workspace.</p>
          ) : packs.map((pack) => (
            <WorkspaceActionRow
              key={pack.id}
              title={pack.name}
              description={`${(pack.manifest?.resources ?? []).length} governed resources - ${pack.slug}`}
              icon={PackageCheck}
              tone={pack.status === 'active' ? 'success' : 'default'}
              meta={pack.status}
            />
          ))}
        </PageSection>

        <PageSection title="Knowledge Clients" description="Scoped clients that can read or write workspace knowledge." contentClassName="space-y-2">
          {externalClients.length === 0 ? (
            <p className="text-xs text-muted-foreground">No external clients have active knowledge access.</p>
          ) : externalClients.map((client) => (
            <WorkspaceActionRow
              key={client.id}
              title={client.name}
              description={client.scopes.join(', ') || 'No scopes recorded'}
              icon={TerminalSquare}
              tone={client.status === 'active' ? 'success' : 'default'}
              meta={client.status}
            />
          ))}
        </PageSection>
      </div>
    </div>
  )
}
