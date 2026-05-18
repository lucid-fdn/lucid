import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { ArrowUpRight, CheckCircle2, CreditCard, PlugZap, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUserId } from '@/lib/auth/server-utils'
import { hasPermission } from '@/lib/access-control'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { isAgentCommerceEnabled } from '@/lib/agent-commerce/feature-gates'
import {
  listAgentCommerceProviderManifests,
  registerDefaultAgentCommerceProviders,
} from '@/lib/agent-commerce/provider-registry'
import {
  listAgentCommerceConnections,
  listAgentCommerceProviderHealth,
} from '@/lib/db/agent-commerce'

const STATUS_TONE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-600',
  degraded: 'bg-amber-500/15 text-amber-700',
  disabled: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-amber-500/15 text-amber-700',
  revoked: 'bg-muted text-muted-foreground',
  expired: 'bg-muted text-muted-foreground',
  failed: 'bg-red-500/15 text-red-600',
}

function statusBadge(status: string) {
  return (
    <Badge className={STATUS_TONE[status] ?? 'bg-muted text-muted-foreground'}>
      {status.replaceAll('_', ' ')}
    </Badge>
  )
}

export default async function WorkspaceCommerceSettingsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  const userId = await requireUserId()
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) notFound()

  const canManageSettings = await hasPermission(workspace.id, userId, 'manageWorkspace')
  if (!canManageSettings) notFound()

  registerDefaultAgentCommerceProviders()
  const [connections, providerHealth] = isAgentCommerceEnabled()
    ? await Promise.all([
      listAgentCommerceConnections({ orgId: workspace.id }),
      listAgentCommerceProviderHealth(),
    ])
    : [[], []]
  const manifests = listAgentCommerceProviderManifests()
  const healthByProvider = new Map(providerHealth.map((item) => [item.provider, item]))
  const activeConnections = connections.filter((connection) => connection.status === 'active')
  const liveProviders = manifests.filter((manifest) => manifest.availability.mode === 'live')
  const previewProviders = manifests.filter((manifest) => manifest.availability.mode !== 'live')

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Workspace Settings</Badge>
            {isAgentCommerceEnabled() ? statusBadge('healthy') : statusBadge('disabled')}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Agent Commerce</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provider connections, rail availability, and Commerce stack status for {workspace.name}.
          </p>
        </div>
        <Link
          href={`/${workspace.slug}/mission-control/commerce`}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
        >
          Mission Control
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={<PlugZap className="h-5 w-5 text-muted-foreground" />} label="Providers" value={String(manifests.length)} />
        <Metric icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" />} label="Live Rails" value={String(liveProviders.length)} />
        <Metric icon={<CreditCard className="h-5 w-5 text-muted-foreground" />} label="Connections" value={String(activeConnections.length)} />
        <Metric icon={<ShieldAlert className="h-5 w-5 text-muted-foreground" />} label="Preview/Waitlist" value={String(previewProviders.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>Registered Commerce providers and their current availability mode.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {manifests.map((manifest) => {
            const health = healthByProvider.get(manifest.id)
            const connectionsForProvider = connections.filter((connection) => connection.provider === manifest.id)
            return (
              <div key={manifest.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{manifest.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{manifest.roles.join(', ')} provider</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{manifest.availability.mode}</Badge>
                    {statusBadge(health?.status ?? (manifest.availability.mode === 'live' ? 'healthy' : 'disabled'))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {manifest.capabilities.map((capability) => (
                    <Badge key={capability} variant="secondary" className="capitalize">
                      {capability.replaceAll('_', ' ')}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>{manifest.rails.length} rails</span>
                  <span>{connectionsForProvider.filter((connection) => connection.status === 'active').length} active</span>
                  <span>{health?.failure_count ?? 0} failures</span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>User and workspace provider grants visible to this org.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Commerce provider connections have been recorded yet.</p>
          ) : (
            connections.map((connection) => (
              <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{connection.provider.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">{connection.capabilities.join(', ') || 'No capabilities'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(connection.status)}
                  <span className="text-xs text-muted-foreground">
                    {connection.updated_at ? new Date(connection.updated_at).toLocaleString() : 'No update'}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-xl">
          {icon}
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}
