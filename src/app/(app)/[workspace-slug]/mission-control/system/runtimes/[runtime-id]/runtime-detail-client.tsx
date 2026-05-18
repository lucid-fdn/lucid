'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import { ConnectionStatus } from '@/components/mission-control/connection-status'
import { MetricBar, metricColor } from '@/components/mission-control/metric-bar'
import { PROVIDER_LABELS, RUNTIME_POLL_INTERVAL, formatRelativeTime } from '@/lib/mission-control/constants'
import { getConnectionStatus } from '@/lib/mission-control/types'
import type { DedicatedRuntime, RuntimeMaintenanceState } from '@/lib/mission-control/types'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import Link from 'next/link'
import { ArrowLeft, Cpu, HardDrive, MemoryStick, Server, Clock, Bot, RefreshCw, Terminal, Activity, Shield, RotateCw, AlertTriangle, Key, Globe, HeartPulse, Plus, Trash2, Eye, EyeOff, Radio, FolderKanban, Puzzle, Wrench, Database, CalendarClock } from 'lucide-react'
import { useProviderCapabilities, hasCapability } from '@/hooks/use-provider-capabilities'
import type { DeploymentMetrics } from '@/lib/mission-control/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/mission-control/empty-state'
import { NativeChannelsSection } from '@/components/mission-control/system/native-channels-section'
import { getEngineLabel } from '@/components/icons/engine-icon'
import { RUNTIME_FLAVOR_LABELS } from '@/lib/runtimes/runtime-flavors'
import { getRuntimeCompatibilityNote, mapRuntimeApiErrorToUiMessage } from '@/lib/engines/presentation'
import { buildProjectAgentDetailPath, buildProjectOverviewPath } from '@/lib/projects/urls'
import type { RuntimeManagementCommand } from '@contracts/runtime-capability'

// ─── Types ───

interface HealthSnapshot {
  reportedAt: string
  cpuPercent: number
  ramPercent: number
  diskPercent: number
}

interface RuntimeDetailData {
  runtime: DedicatedRuntime | null
  agents: Array<{
    id: string
    name: string
    projectId: string | null
    projectSlug: string | null
    projectName: string | null
    mcStatus: 'active' | 'paused' | 'stopped' | 'failed'
  }>
  history: HealthSnapshot[]
}

interface RuntimeDetailClientProps {
  orgId: string
  workspaceSlug: string
  runtimeId: string
}

// ─── Helpers ───

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ─── Component ───

export function RuntimeDetailClient({ orgId, workspaceSlug, runtimeId }: RuntimeDetailClientProps) {
  const router = useRouter()
  const [maintenance, setMaintenance] = useState<RuntimeMaintenanceState | null>(null)

  const subscriptions: RealtimeSubscription[] = useMemo(
    () => [
      { table: 'dedicated_runtimes', events: ['UPDATE'] as const },
      { table: 'vps_health_snapshots', events: ['INSERT'] as const },
    ],
    []
  )

  const queryFn = useMemo(() => {
    return async (): Promise<RuntimeDetailData> => {
      const [runtimeRes, historyRes] = await Promise.all([
        fetch(`/api/runtimes/${runtimeId}?org_id=${orgId}`),
        fetch(`/api/runtimes/${runtimeId}/history?org_id=${orgId}`),
      ])
      const runtimeData = runtimeRes.ok ? await runtimeRes.json() : null
      const historyData = historyRes.ok ? await historyRes.json() : { snapshots: [] }
      return {
        runtime: runtimeData?.runtime ?? null,
        agents: runtimeData?.agents ?? [],
        history: historyData.snapshots ?? [],
      }
    }
  }, [orgId, runtimeId])

  const { data } = useRealtimeQuery<RuntimeDetailData>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-runtime-detail-${runtimeId}`,
      subscriptions,
      orgId,
    },
    initialData: { runtime: null, agents: [], history: [] },
    pollInterval: RUNTIME_POLL_INTERVAL,
  })

  const { runtime, agents, history } = data
  const capState = useProviderCapabilities(runtimeId, orgId)

  useEffect(() => {
    let cancelled = false

    async function loadMaintenance() {
      const res = await fetch(`/api/runtimes/${runtimeId}/maintenance?org_id=${orgId}`)
      const payload = await res.json().catch(() => null)
      if (!cancelled) {
        setMaintenance(res.ok ? payload?.maintenance ?? null : null)
      }
    }

    void loadMaintenance()
    return () => {
      cancelled = true
    }
  }, [orgId, runtimeId])

  if (!runtime) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/${workspaceSlug}/mission-control/system`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Runtime Detail</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState title="Runtime not found" />
        </div>
      </div>
    )
  }

  const status = getConnectionStatus(runtime.lastSeenAt)
  const isLucidManagedRuntime = runtime.managedByLucid || runtime.runtimeTier === 'dedicated'
  const providerLabel = isLucidManagedRuntime
    ? 'Lucid Cloud'
    : PROVIDER_LABELS[runtime.provider] || runtime.provider
  const executionModelNote = getRuntimeCompatibilityNote({
    engine: runtime.engine,
    runtimeFlavor: runtime.runtimeFlavor,
    channelOwnership: runtime.channelOwnership,
  })
  const connectedProjects = Array.from(
    new Map(
      agents
        .filter((agent) => agent.projectSlug && agent.projectName)
        .map((agent) => [agent.projectSlug as string, { slug: agent.projectSlug as string, name: agent.projectName as string }]),
    ).values(),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/${workspaceSlug}/mission-control/system`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ConnectionStatus lastSeenAt={runtime.lastSeenAt} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{runtime.displayName}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Workspace runtime observability for diagnosing infrastructure, connectivity, and execution health across projects.
          </p>
          <span className="text-[10px] text-muted-foreground">
            {providerLabel}
            {` \u00B7 ${getEngineLabel(runtime.engine)}`}
            {(runtime.runtimeVersion || runtime.engineVersion || runtime.openclawVersion) &&
              ` \u00B7 v${runtime.runtimeVersion || runtime.engineVersion || runtime.openclawVersion}`}
            {runtime.channelMode && (
              <span className={cn(
                'ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                runtime.channelMode === 'native'
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              )}>
                <Radio className="h-2 w-2" />
                {runtime.channelMode === 'native' ? 'C2a Native' : 'C1 Relay'}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Current Metrics */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Current Metrics</h3>
            {status !== 'offline' ? (
              <div className="space-y-1.5">
                <MetricBar label="CPU" value={runtime.cpuPercent} icon={Cpu} />
                <MetricBar label="RAM" value={runtime.ramPercent} icon={MemoryStick} />
                <MetricBar label="Disk" value={runtime.diskPercent} icon={HardDrive} />
                {runtime.gpuPercent != null && (
                  <MetricBar label="GPU" value={runtime.gpuPercent} icon={Server} />
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">Runtime is offline</p>
            )}
          </section>

          {/* Info Grid */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
                  <Bot className="h-3 w-3" />
                  Agents
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {agents.length}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
                  <Clock className="h-3 w-3" />
                  Last Seen
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {runtime.lastSeenAt ? formatRelativeTime(runtime.lastSeenAt) : '--'}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
                  <FolderKanban className="h-3 w-3" />
                  Projects
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {connectedProjects.length}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
                  <AlertTriangle className="h-3 w-3" />
                  Runtime State
                </div>
                <div className="text-sm font-medium capitalize">
                  {runtime.status}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Attached Agents</h3>
            {agents.length > 0 ? (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {agent.projectName ?? 'Unassigned'} · {agent.mcStatus}
                      </div>
                    </div>
                    {agent.projectSlug ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={buildProjectAgentDetailPath(workspaceSlug, agent.projectSlug, agent.id)}>
                          Open in project
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border p-6 text-center">
                <p className="text-xs text-muted-foreground/50">No agents are attached to this runtime yet.</p>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Connected Projects</h3>
            {connectedProjects.length > 0 ? (
              <div className="space-y-2">
                {connectedProjects.map((project) => (
                  <div key={project.slug} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{project.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{project.slug}</div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={buildProjectOverviewPath(workspaceSlug, project.slug)}>
                        Open project
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border p-6 text-center">
                <p className="text-xs text-muted-foreground/50">No projects are currently attached to this runtime.</p>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Execution Model</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-[10px] text-muted-foreground/60 mb-1">Runtime Flavor</div>
                <div className="text-sm font-medium">
                  {runtime.runtimeFlavor ? RUNTIME_FLAVOR_LABELS[runtime.runtimeFlavor] : '--'}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[10px] text-muted-foreground/60 mb-1">Channel Ownership</div>
                <div className="text-sm font-medium">
                  {runtime.channelOwnership === 'runtime_native'
                    ? 'Runtime native'
                    : runtime.channelOwnership === 'lucid_relay'
                      ? 'Lucid relay'
                      : '--'}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[10px] text-muted-foreground/60 mb-1">Runtime Protocol</div>
                <div className="text-sm font-medium">{runtime.runtimeProtocol}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[10px] text-muted-foreground/60 mb-1">Scheduler Transport</div>
                <div className="text-sm font-medium">
                  {runtime.dedicatedTransportMode === 'native_pulse'
                    ? 'Native Pulse'
                    : runtime.dedicatedTransportMode === 'relay'
                      ? 'Relay'
                      : '--'}
                </div>
              </div>
            </div>
            {executionModelNote && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-400">{executionModelNote}</p>
              </div>
            )}
          </section>

          <RuntimeCapabilityPlaneSection runtime={runtime} orgId={orgId} />

          {/* Historical Metrics */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-3">
              Health History ({history.length} snapshots)
            </h3>
            {history.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPU</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">RAM</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Disk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((snapshot, i) => (
                        <tr
                          key={snapshot.reportedAt}
                          className={cn(
                            'border-b last:border-b-0 transition-colors hover:bg-muted/20',
                            i % 2 === 0 && 'bg-muted/5'
                          )}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">
                            {formatTimestamp(snapshot.reportedAt)}
                          </td>
                          <td className={cn('px-3 py-1.5 text-right tabular-nums', metricColor(snapshot.cpuPercent))}>
                            {Math.round(snapshot.cpuPercent)}%
                          </td>
                          <td className={cn('px-3 py-1.5 text-right tabular-nums', metricColor(snapshot.ramPercent))}>
                            {Math.round(snapshot.ramPercent)}%
                          </td>
                          <td className={cn('px-3 py-1.5 text-right tabular-nums', metricColor(snapshot.diskPercent))}>
                            {Math.round(snapshot.diskPercent)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-6 text-center">
                <p className="text-xs text-muted-foreground/50">No health snapshots recorded yet</p>
              </div>
            )}
          </section>

          <RuntimeCapabilityPlaneSection runtime={runtime} orgId={orgId} />

          {/* Runtime Logs */}
          <RuntimeLogsSection runtimeId={runtimeId} orgId={orgId} />

          {/* ─── Capability-Driven Sections ─── */}

          {/* Capabilities Status Banner */}
          {capState.status === 'unavailable' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-400">
                {capState.warning || 'Control plane temporarily unavailable. Some features may be limited.'}
              </p>
            </div>
          )}

          {capState.status === 'unmanaged' && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                Unmanaged runtime — showing heartbeat data only. Provider management features are not available for manually provisioned runtimes.
              </p>
            </div>
          )}

          {/* Historical Metrics (Provider) */}
          {hasCapability(capState, 'observability.metrics') && (
            <ProviderMetricsSection runtimeId={runtimeId} orgId={orgId} />
          )}

          {/* Redeploy */}
          {(runtime.managedByLucid || hasCapability(capState, 'lifecycle.redeploy')) && (
            <MaintenanceSection
              runtime={runtime}
              runtimeId={runtimeId}
              orgId={orgId}
              maintenance={maintenance}
              onMaintenanceUpdate={setMaintenance}
            />
          )}

          {/* Restart Policy */}
          {hasCapability(capState, 'configuration.restartPolicy') && (
            <RestartPolicySection
              runtimeId={runtimeId}
              orgId={orgId}
              currentPolicy={runtime.restartPolicy || 'always'}
            />
          )}

          {/* Env Vars (Phase 3) */}
          {!isLucidManagedRuntime && hasCapability(capState, 'configuration.envUpdate') && (
            <EnvVarsSection
              runtimeId={runtimeId}
              orgId={orgId}
              envSnapshot={runtime.envSnapshot ?? null}
            />
          )}

          {/* Custom Domains (Phase 4) */}
          {hasCapability(capState, 'configuration.customDomains') && (
            <DomainsSection runtimeId={runtimeId} orgId={orgId} />
          )}

          {/* Healthcheck (Phase 4) */}
          {hasCapability(capState, 'observability.healthcheckConfig') && (
            <HealthcheckSection
              runtimeId={runtimeId}
              orgId={orgId}
              currentConfig={runtime.healthcheckConfig ?? null}
            />
          )}

          {/* Native Channels (C2a) */}
          {runtime.channelMode === 'native' && (
            <NativeChannelsSection
              runtimeId={runtimeId}
              orgId={orgId}
              channels={runtime.nativeChannels ?? []}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function statusTone(status: string | null | undefined): string {
  if (status === 'available' || status === 'healthy' || status === 'ready' || status === 'running' || status === 'pass' || status === 'accepted' || status === 'applied') {
    return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
  }
  if (status === 'limited' || status === 'needs_setup' || status === 'degraded' || status === 'warn' || status === 'unknown' || status === 'queued' || status === 'sent' || status === 'needs_user_action') {
    return 'border-amber-500/30 bg-amber-500/5 text-amber-400'
  }
  return 'border-red-500/30 bg-red-500/5 text-red-400'
}

function RuntimeCapabilityPlaneSection({ runtime, orgId }: { runtime: DedicatedRuntime; orgId: string }) {
  const capabilities = runtime.nativeCapabilities ?? []
  const services = runtime.runtimeServices ?? []
  const adapter = runtime.adapterIdentity
  const parser = runtime.transcriptParser
  const parserMode = parser?.mode ?? (parser ? 'adapter' : null)
  const parserStatus = parser?.status ?? 'unknown'
  const homePolicy = runtime.engineHomePolicy
  const reportedAt = runtime.capabilityReportedAt
  const [commands, setCommands] = useState<RuntimeManagementCommand[]>([])
  const [commandsLoading, setCommandsLoading] = useState(false)
  const [commandMessage, setCommandMessage] = useState<string | null>(null)

  const fetchCommands = useCallback(async () => {
    setCommandsLoading(true)
    try {
      const res = await fetch(`/api/runtimes/${runtime.id}/management-commands?org_id=${orgId}`)
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setCommands(data?.commands ?? [])
      }
    } finally {
      setCommandsLoading(false)
    }
  }, [runtime.id, orgId])

  const queueCommand = useCallback(async (
    commandType: string,
    label: string,
    payload: Record<string, unknown> = {},
  ) => {
    setCommandsLoading(true)
    setCommandMessage(null)
    try {
      const res = await fetch(`/api/runtimes/${runtime.id}/management-commands?org_id=${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType,
          payload: { source: 'mission_control_runtime_detail', ...payload },
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setCommandMessage(`${label} command queued`)
        setCommands((prev) => [data.command, ...prev].filter(Boolean))
      } else {
        setCommandMessage(data?.error ?? `Failed to queue ${label.toLowerCase()}`)
      }
    } finally {
      setCommandsLoading(false)
    }
  }, [runtime.id, orgId])

  useEffect(() => {
    void fetchCommands()
  }, [fetchCommands])

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Puzzle className="h-3 w-3" />
          Runtime Capabilities
        </h3>
        {reportedAt ? (
          <span className="text-[10px] text-muted-foreground/60">
            Updated {formatRelativeTime(reportedAt)}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
            <Wrench className="h-3 w-3" />
            Adapter
          </div>
          <div className="text-sm font-medium">
            {adapter?.label ?? getEngineLabel(runtime.engine)}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/60">
            {adapter?.version ? `v${adapter.version}` : runtime.runtimeVersion ? `v${runtime.runtimeVersion}` : 'No adapter report yet'}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
            <Database className="h-3 w-3" />
            Memory Home
          </div>
          <div className="text-sm font-medium capitalize">
            {homePolicy?.mode ? homePolicy.mode.replace(/_/g, ' ') : 'Not reported'}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/60">
            {homePolicy
              ? `${homePolicy.authority} authority - ${homePolicy.writePolicy.replace(/_/g, ' ')}`
              : 'Waiting for heartbeat capability report'}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-1">
            <Terminal className="h-3 w-3" />
            Parser & Command
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parser ? (
              <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px]', statusTone(parserStatus))}>
                {parserMode?.replace(/_/g, ' ') ?? 'adapter'}
              </span>
            ) : (
              <span className="text-sm font-medium">Not reported</span>
            )}
            {runtime.commandSpec ? (
              <span className="inline-flex rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                {runtime.commandSpec.displayName ?? runtime.commandSpec.parserSupport}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {capabilities.length > 0 ? (
        <div className="mt-3 rounded-lg border p-3">
          <div className="text-[10px] text-muted-foreground/60 mb-2">Engine-Native Features</div>
          <div className="flex flex-wrap gap-2">
            {capabilities.map((capability) => (
              <span
                key={capability.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]',
                  statusTone(capability.availability),
                )}
                title={capability.notes?.join(' ') || capability.description || capability.label}
              >
                {capability.label}
                <span className="text-[9px] opacity-70">{capability.manageMode.replace(/_/g, ' ')}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border p-6 text-center">
          <p className="text-xs text-muted-foreground/50">No runtime capability report has been received yet.</p>
        </div>
      )}

      {services.length > 0 ? (
        <div className="mt-3 rounded-lg border p-3">
          <div className="text-[10px] text-muted-foreground/60 mb-2">Runtime Services</div>
          <div className="space-y-2">
            {services.map((service) => (
              <div key={service.serviceName} className="flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium truncate">{service.label ?? service.serviceName}</div>
                  <div className="text-[10px] text-muted-foreground/60">
                    {(service.lifecycle ?? 'runtime').replace(/_/g, ' ')}
                  </div>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px]', statusTone(service.status))}>
                  {service.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-[10px] text-muted-foreground/60">Management Commands</div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={fetchCommands}
              disabled={commandsLoading}
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', commandsLoading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => queueCommand('adapter.probe', 'Probe')}
              disabled={commandsLoading}
            >
              <Activity className="h-3 w-3 mr-1" />
              Probe
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => queueCommand('transcript.parser.test', 'Parser test')}
              disabled={commandsLoading}
            >
              <Terminal className="h-3 w-3 mr-1" />
              Parser
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => queueCommand('runtime.services.inspect', 'Services')}
              disabled={commandsLoading}
            >
              <Wrench className="h-3 w-3 mr-1" />
              Services
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => queueCommand('engine_home.snapshot', 'EHV snapshot')}
              disabled={commandsLoading}
            >
              <Database className="h-3 w-3 mr-1" />
              EHV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => queueCommand('native_scheduler.observe', 'Native schedule observe')}
              disabled={commandsLoading}
            >
              <CalendarClock className="h-3 w-3 mr-1" />
              Schedules
            </Button>
          </div>
        </div>
        {commands.length > 0 ? (
          <div className="space-y-2">
            {commands.slice(0, 5).map((command) => (
              <div key={command.id} className="flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium truncate">{command.commandType}</div>
                  <div className="text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(command.requestedAt)}
                    {command.targetCapabilityId ? ` · ${command.targetCapabilityId}` : ''}
                  </div>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px]', statusTone(command.status))}>
                  {command.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/50">
            {commandsLoading ? 'Loading commands...' : 'No management commands have been queued.'}
          </p>
        )}
        {commandMessage ? (
          <p className={cn(
            'mt-2 text-[10px]',
            commandMessage.includes('Failed') ? 'text-red-400' : 'text-emerald-400',
          )}>
            {commandMessage}
          </p>
        ) : null}
      </div>
    </section>
  )
}

// ─── Logs Section ───

function RuntimeLogsSection({ runtimeId, orgId }: { runtimeId: string; orgId: string }) {
  const [logs, setLogs] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const normalizeLogs = useCallback((value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => normalizeLogs(entry))
    }
    if (typeof value === 'string') {
      return value.split(/\r?\n/).filter((line) => line.trim().length > 0)
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const messageValue = record.message ?? record.msg ?? record.text ?? record.line
      if (typeof messageValue === 'string') {
        return normalizeLogs(messageValue)
      }
      return [JSON.stringify(value)]
    }
    return []
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/logs?org_id=${orgId}&lines=100`)
      if (res.ok) {
        const data = await res.json()
        setLogs(normalizeLogs(data.logs))
        setMessage(data.message ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [runtimeId, orgId, normalizeLogs])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Terminal className="h-3 w-3" />
          Runtime Logs
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          onClick={fetchLogs}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>
      {message && logs.length === 0 ? (
        <div className="rounded-lg border p-6 text-center">
          <p className="text-xs text-muted-foreground/50">{message}</p>
        </div>
      ) : logs.length > 0 ? (
        <div className="rounded-lg border bg-muted p-3 overflow-x-auto max-h-[400px] overflow-y-auto">
          <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {logs.join('\n')}
          </pre>
        </div>
      ) : (
        <div className="rounded-lg border p-6 text-center">
          <p className="text-xs text-muted-foreground/50">
            {loading ? 'Loading logs...' : 'No logs available'}
          </p>
        </div>
      )}
    </section>
  )
}

// ─── Provider Metrics Section ───

function ProviderMetricsSection({ runtimeId, orgId }: { runtimeId: string; orgId: string }) {
  const [metrics, setMetrics] = useState<DeploymentMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/metrics?org_id=${orgId}&range=3600&granularity=minute`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [runtimeId, orgId])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          Provider Metrics (1h)
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          onClick={fetchMetrics}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>
      {metrics ? (
        <div className="grid grid-cols-2 gap-3">
          {metrics.cpu?.current != null && (
            <div className="rounded-lg border p-3">
              <div className="text-[10px] text-muted-foreground/60 mb-1">CPU</div>
              <div className="text-sm font-medium tabular-nums">
                {typeof metrics.cpu.current === 'number' ? `${metrics.cpu.current.toFixed(1)}%` : '--'}
              </div>
              {metrics.cpu.series && (
                <div className="text-[10px] text-muted-foreground/40 mt-1">
                  {metrics.cpu.series.length} data points
                </div>
              )}
            </div>
          )}
          {metrics.memory?.current != null && (
            <div className="rounded-lg border p-3">
              <div className="text-[10px] text-muted-foreground/60 mb-1">Memory</div>
              <div className="text-sm font-medium tabular-nums">
                {typeof metrics.memory.current === 'number'
                  ? metrics.memory.unit === 'bytes'
                    ? `${(metrics.memory.current / 1024 / 1024).toFixed(0)} MB`
                    : `${metrics.memory.current.toFixed(1)}%`
                  : '--'}
              </div>
            </div>
          )}
          {metrics.disk?.current != null && (
            <div className="rounded-lg border p-3">
              <div className="text-[10px] text-muted-foreground/60 mb-1">Disk</div>
              <div className="text-sm font-medium tabular-nums">
                {typeof metrics.disk.current === 'number'
                  ? metrics.disk.unit === 'bytes'
                    ? `${(metrics.disk.current).toFixed(1)} GB`
                    : `${metrics.disk.current.toFixed(1)}%`
                  : '--'}
              </div>
            </div>
          )}
          {metrics.network && (
            <div className="rounded-lg border p-3">
              <div className="text-[10px] text-muted-foreground/60 mb-1">Network</div>
              <div className="text-xs font-medium tabular-nums space-y-0.5">
                {metrics.network.rxBytes?.current != null && (
                  <div>RX: {(metrics.network.rxBytes.current / 1024 / 1024).toFixed(1)} MB</div>
                )}
                {metrics.network.txBytes?.current != null && (
                  <div>TX: {(metrics.network.txBytes.current / 1024 / 1024).toFixed(1)} MB</div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border p-6 text-center">
          <p className="text-xs text-muted-foreground/50">
            {loading ? 'Loading metrics...' : 'No metrics available'}
          </p>
        </div>
      )}
    </section>
  )
}

// ─── Maintenance Section ───

function MaintenanceSection({
  runtime,
  runtimeId,
  orgId,
  maintenance,
  onMaintenanceUpdate,
}: {
  runtime: DedicatedRuntime
  runtimeId: string
  orgId: string
  maintenance: RuntimeMaintenanceState | null
  onMaintenanceUpdate: (next: RuntimeMaintenanceState | null) => void
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleRedeploy = useCallback(async () => {
    if (!confirm('Are you sure you want to redeploy this runtime? This will rebuild and restart the container.')) {
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/maintenance?org_id=${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeploy' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        onMaintenanceUpdate(data.maintenance ?? maintenance)
        setResult('Redeploy triggered successfully')
      } else {
        setResult(`Redeploy failed: ${data.error || res.statusText}`)
      }
    } catch (err) {
      setResult(`Redeploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [runtimeId, orgId, maintenance, onMaintenanceUpdate])

  const handleRehome = useCallback(async () => {
    if (!confirm('Re-home this runtime onto a new Lucid-managed deployment? This rotates the runtime key after the replacement deployment is accepted.')) {
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/maintenance/rehome?org_id=${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        onMaintenanceUpdate(data.maintenance ?? maintenance)
        setResult('Re-home queued successfully')
      } else {
        setResult(`Re-home failed: ${data.error || res.statusText}`)
      }
    } catch (err) {
      setResult(`Re-home failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [runtimeId, orgId, maintenance, onMaintenanceUpdate])

  const needsRehome =
    runtime.managedByLucid &&
    (runtime.lastL2Status === 'operator_action_required' || Boolean(maintenance?.lastMaintenanceError))

  return (
    <section>
      <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
        <RotateCw className="h-3 w-3" />
        Maintenance
      </h3>
      <div className="space-y-3">
        <div className="rounded-lg border p-3 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">Control Plane</div>
            <div className="text-sm font-medium">
              {runtime.managedByLucid ? 'Lucid-managed' : 'External'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">Channel</div>
            <div className="text-sm font-medium">
              {maintenance?.maintenanceChannel ?? runtime.maintenanceChannel}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">Policy</div>
            <div className="text-sm font-medium">
              {(maintenance?.autoUpdatePolicy ?? runtime.autoUpdatePolicy).replace('_', ' ')}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Rebuild and restart the container from the current image.</p>
            {maintenance?.lastMaintenanceAt && (
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Last action: {maintenance.lastMaintenanceAction ?? 'maintenance'} {formatRelativeTime(maintenance.lastMaintenanceAt)}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleRedeploy}
            disabled={loading || !runtime.managedByLucid}
          >
            {loading ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3 mr-1" />
            )}
            Redeploy
          </Button>
        </div>

        {needsRehome && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-amber-300">Operator re-home required</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Move this runtime onto a fresh Lucid-managed deployment without exposing provider internals.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={handleRehome}
              disabled={loading || !runtime.managedByLucid}
            >
              {loading ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RotateCw className="h-3 w-3 mr-1" />
              )}
              Re-home
            </Button>
          </div>
        )}

        {maintenance?.jobs?.length ? (
          <div className="rounded-lg border p-3">
            <div className="text-[10px] text-muted-foreground/60 mb-2">Recent Jobs</div>
            <div className="space-y-2">
              {maintenance.jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {job.action} · {job.status}
                    </div>
                    <div className="text-muted-foreground/60 truncate">
                      {job.error || formatTimestamp(job.createdAt)}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(job.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {result && (
        <p className={cn(
          'text-[10px] mt-2',
          result.includes('failed') ? 'text-red-400' : 'text-emerald-400'
        )}>
          {result}
        </p>
      )}
    </section>
  )
}

// ─── Restart Policy Section ───

function RestartPolicySection({
  runtimeId,
  orgId,
  currentPolicy,
}: {
  runtimeId: string
  orgId: string
  currentPolicy: string
}) {
  const [policy, setPolicy] = useState(currentPolicy)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/restart-policy?org_id=${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      })
      if (res.ok) {
        setMessage('Restart policy updated')
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(`Failed: ${mapRuntimeApiErrorToUiMessage(data.error) || res.statusText}`)
      }
    } finally {
      setSaving(false)
    }
  }, [runtimeId, orgId, policy])

  return (
    <section>
      <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
        <Shield className="h-3 w-3" />
        Restart Policy
      </h3>
      <div className="rounded-lg border p-3 flex items-center gap-3">
        <select
          value={policy}
          onChange={(e) => setPolicy(e.target.value)}
          className="text-xs bg-transparent border rounded px-2 py-1 text-foreground"
        >
          <option value="always">Always</option>
          <option value="on_failure">On Failure</option>
          <option value="never">Never</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={saving || policy === currentPolicy}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
        {message && (
          <span className={cn(
            'text-[10px]',
            message.includes('Failed') ? 'text-red-400' : 'text-emerald-400'
          )}>
            {message}
          </span>
        )}
      </div>
    </section>
  )
}

// ─── Env Vars Section (Phase 3 — Write-Only Secrets Editor) ───

const SENSITIVE_PATTERNS = /KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL/i

interface EnvEntry {
  key: string
  value: string
}

type EnvSnapshot = Record<string, { present: boolean; updatedAt?: string; masked?: boolean; valuePreview?: string }>

function EnvVarsSection({
  runtimeId,
  orgId,
  envSnapshot,
}: {
  runtimeId: string
  orgId: string
  envSnapshot: EnvSnapshot | null
}) {
  const [entries, setEntries] = useState<EnvEntry[]>([{ key: '', value: '' }])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showValues, setShowValues] = useState<Record<number, boolean>>({})

  const updateEntry = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
  }, [])

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, { key: '', value: '' }])
  }, [])

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const toggleShowValue = useCallback((index: number) => {
    setShowValues((prev) => ({ ...prev, [index]: !prev[index] }))
  }, [])

  const handleSave = useCallback(async () => {
    const vars: Record<string, string | null> = {}
    for (const entry of entries) {
      const key = entry.key.trim()
      if (key) vars[key] = entry.value || null
    }
    if (Object.keys(vars).length === 0) return

    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/env?org_id=${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars }),
      })
      if (res.ok) {
        setMessage('Environment variables updated')
        setEntries([{ key: '', value: '' }])
        setShowValues({})
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(`Failed: ${mapRuntimeApiErrorToUiMessage(data.error) || res.statusText}`)
      }
    } finally {
      setSaving(false)
    }
  }, [runtimeId, orgId, entries])

  const hasValidEntries = entries.some((e) => e.key.trim())

  return (
    <section>
      <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
        <Key className="h-3 w-3" />
        Environment Variables
      </h3>

      {/* Existing vars (read-only metadata) */}
      {envSnapshot && Object.keys(envSnapshot).length > 0 && (
        <div className="rounded-lg border mb-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Key</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Updated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(envSnapshot).map(([key, meta], i) => (
                  <tr
                    key={key}
                    className={cn('border-b last:border-b-0', i % 2 === 0 && 'bg-muted/5')}
                  >
                    <td className="px-3 py-1.5 font-mono">{key}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {meta.masked ? '••••••••' : meta.valuePreview || (meta.present ? 'Set' : '—')}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground/60 tabular-nums whitespace-nowrap">
                      {meta.updatedAt ? formatTimestamp(meta.updatedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / update vars */}
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-[10px] text-muted-foreground/60 mb-2">
          Add or update variables. Values are sent to the provider and never stored here. Set value to empty to remove a variable.
        </p>
        {entries.map((entry, i) => {
          const isSensitive = SENSITIVE_PATTERNS.test(entry.key)
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="KEY"
                value={entry.key}
                onChange={(e) => updateEntry(i, 'key', e.target.value)}
                className="text-xs bg-transparent border rounded px-2 py-1 text-foreground font-mono w-[140px]"
              />
              <div className="relative flex-1">
                <input
                  type={isSensitive && !showValues[i] ? 'password' : 'text'}
                  placeholder="value"
                  value={entry.value}
                  onChange={(e) => updateEntry(i, 'value', e.target.value)}
                  className="text-xs bg-transparent border rounded px-2 py-1 text-foreground font-mono w-full pr-7"
                />
                {isSensitive && (
                  <button
                    type="button"
                    onClick={() => toggleShowValue(i)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
                  >
                    {showValues[i] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                )}
              </div>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  className="text-muted-foreground/40 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={addEntry}
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add variable
          </button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={saving || !hasValidEntries}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
        {message && (
          <p className={cn(
            'text-[10px]',
            message.includes('Failed') ? 'text-red-400' : 'text-emerald-400'
          )}>
            {message}
          </p>
        )}
      </div>
    </section>
  )
}

// ─── Domains Section (Phase 4) ───

interface DomainInfo {
  domain: string
  isDefault?: boolean
  ssl?: boolean
}

function DomainsSection({ runtimeId, orgId }: { runtimeId: string; orgId: string }) {
  const [domains, setDomains] = useState<DomainInfo[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const fetchDomains = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/domains?org_id=${orgId}`)
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [runtimeId, orgId])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  const handleAdd = useCallback(async () => {
    const domain = newDomain.trim()
    if (!domain) return
    setAdding(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/domains?org_id=${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      if (res.ok) {
        setNewDomain('')
        setMessage('Domain added')
        fetchDomains()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(`Failed: ${mapRuntimeApiErrorToUiMessage(data.error) || res.statusText}`)
      }
    } finally {
      setAdding(false)
    }
  }, [runtimeId, orgId, newDomain, fetchDomains])

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Globe className="h-3 w-3" />
          Custom Domains
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          onClick={fetchDomains}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Existing domains */}
      {domains.length > 0 ? (
        <div className="rounded-lg border mb-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Domain</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">SSL</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d, i) => (
                  <tr key={d.domain} className={cn('border-b last:border-b-0', i % 2 === 0 && 'bg-muted/5')}>
                    <td className="px-3 py-1.5 font-mono">
                      {d.domain}
                      {d.isDefault && (
                        <span className="ml-2 text-[10px] text-muted-foreground/60">(default)</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {d.ssl ? (
                        <span className="text-emerald-400">Active</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !loading ? (
        <div className="rounded-lg border p-6 text-center mb-3">
          <p className="text-xs text-muted-foreground/50">No custom domains configured</p>
        </div>
      ) : null}

      {/* Add domain */}
      <div className="rounded-lg border p-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="example.com"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="text-xs bg-transparent border rounded px-2 py-1 text-foreground font-mono flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleAdd}
          disabled={adding || !newDomain.trim()}
        >
          {adding ? 'Adding...' : 'Add'}
        </Button>
      </div>
      {message && (
        <p className={cn(
          'text-[10px] mt-2',
          message.includes('Failed') ? 'text-red-400' : 'text-emerald-400'
        )}>
          {message}
        </p>
      )}
    </section>
  )
}

// ─── Healthcheck Section (Phase 4) ───

function HealthcheckSection({
  runtimeId,
  orgId,
  currentConfig,
}: {
  runtimeId: string
  orgId: string
  currentConfig: { path: string; intervalSeconds: number; timeoutSeconds: number } | null
}) {
  const [path, setPath] = useState(currentConfig?.path ?? '/health')
  const [interval, setInterval_] = useState(String(currentConfig?.intervalSeconds ?? 30))
  const [timeout, setTimeout_] = useState(String(currentConfig?.timeoutSeconds ?? 10))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    const intervalNum = parseInt(interval, 10)
    const timeoutNum = parseInt(timeout, 10)
    if (!path.trim() || isNaN(intervalNum) || isNaN(timeoutNum)) return

    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/healthcheck?org_id=${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: path.trim(),
          intervalSeconds: intervalNum,
          timeoutSeconds: timeoutNum,
        }),
      })
      if (res.ok) {
        setMessage('Healthcheck configuration updated')
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(`Failed: ${mapRuntimeApiErrorToUiMessage(data.error) || res.statusText}`)
      }
    } finally {
      setSaving(false)
    }
  }, [runtimeId, orgId, path, interval, timeout])

  const hasChanges =
    path !== (currentConfig?.path ?? '/health') ||
    interval !== String(currentConfig?.intervalSeconds ?? 30) ||
    timeout !== String(currentConfig?.timeoutSeconds ?? 10)

  return (
    <section>
      <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
        <HeartPulse className="h-3 w-3" />
        Healthcheck
      </h3>
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-muted-foreground/60 w-16 shrink-0">Path</label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="text-xs bg-transparent border rounded px-2 py-1 text-foreground font-mono flex-1"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-muted-foreground/60 w-16 shrink-0">Interval</label>
          <input
            type="number"
            min={1}
            max={3600}
            value={interval}
            onChange={(e) => setInterval_(e.target.value)}
            className="text-xs bg-transparent border rounded px-2 py-1 text-foreground tabular-nums w-20"
          />
          <span className="text-[10px] text-muted-foreground/40">seconds</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-muted-foreground/60 w-16 shrink-0">Timeout</label>
          <input
            type="number"
            min={1}
            max={300}
            value={timeout}
            onChange={(e) => setTimeout_(e.target.value)}
            className="text-xs bg-transparent border rounded px-2 py-1 text-foreground tabular-nums w-20"
          />
          <span className="text-[10px] text-muted-foreground/40">seconds</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
        {message && (
          <p className={cn(
            'text-[10px]',
            message.includes('Failed') ? 'text-red-400' : 'text-emerald-400'
          )}>
            {message}
          </p>
        )}
      </div>
    </section>
  )
}
