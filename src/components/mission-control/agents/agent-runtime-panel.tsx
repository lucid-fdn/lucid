'use client'

import { useState } from 'react'
import { Server, Cloud, Loader2, AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import { ConnectionStatus } from '@/components/mission-control/connection-status'
import { RadialGaugeRow } from '@/components/mission-control/radial-gauge'
import { PROVIDER_LABELS } from '@/lib/mission-control/constants'
import { toast } from '@/hooks/use-toast'
import { PanelLayout, PanelStateCard, PanelInfoRow } from '@/components/panels/panel-layout'
import { notificationCopy } from '@/lib/notifications/copy'
import { AgentRuntimeEnginePanel } from '@/components/assistant/agent-runtime-engine-panel'
import { runtimeModeToFlavor } from '@/lib/agent-builder/runtime-engine-validation'
import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { RuntimeFeatureAccess } from '@/lib/access-control/types'
import { resolveRuntimeProviderForMode } from '@/lib/runtimes/runtime-provider-selection'

interface AgentRuntimePanelProps {
  agentId: string
  agentName: string
  orgId: string
  workspaceSlug?: string
  runtimeId?: string | null
  runtimes?: DedicatedRuntime[]
  engine?: string | null
  runtimeFeatureAccess?: RuntimeFeatureAccess | null
  modelHint?: string | null
  onEngineChange?: (engine: string) => void
  onModelChange?: (modelHint: string | undefined) => void
  onRuntimeChange?: (runtimeId: string | null, runtimeFlavor: 'shared' | 'c1_managed' | 'c2a_autonomous') => void
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  return document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? null
}

const PICKER_ELIGIBLE_STATUSES = new Set(['connected', 'stale', 'deploying'])

export function AgentRuntimePanel({
  agentId,
  agentName,
  orgId,
  workspaceSlug,
  runtimeId,
  runtimes = [],
  engine = 'openclaw',
  runtimeFeatureAccess,
  modelHint = null,
  onEngineChange,
  onModelChange,
  onRuntimeChange,
}: AgentRuntimePanelProps) {
  const currentRuntime = runtimes.find(r => r.id === runtimeId)
  const isShared = !runtimeId || !currentRuntime
  const isDeploying = currentRuntime?.status === 'deploying' || currentRuntime?.status === 'pending'
  const isFailed = currentRuntime?.status === 'failed'
  const [retrying, setRetrying] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeBlueprint>(() => currentRuntime
    ? {
        mode: currentRuntime.runtimeFlavor === 'c2a_autonomous' ? 'byo' : 'dedicated',
        runtime_id: currentRuntime.id,
        engine: currentRuntime.engine,
        provider: currentRuntime.provider,
        channel_ownership: currentRuntime.channelOwnership ?? 'lucid_relay',
        network: currentRuntime.runtimeBootstrapConfig?.advanced?.network,
        limits: currentRuntime.runtimeBootstrapConfig?.advanced?.limits,
        maintenance: currentRuntime.runtimeBootstrapConfig?.advanced?.maintenance ?? {
          auto_update_policy: currentRuntime.autoUpdatePolicy,
        },
        model: currentRuntime.runtimeBootstrapConfig?.advanced?.model,
      }
    : {
        mode: 'shared',
        engine: engine ?? 'openclaw',
        channel_ownership: 'lucid_relay',
      })

  const provisionRuntime = async (mode: 'dedicated' | 'byo') => {
    const selectedEngine = runtimeDraft.engine ?? engine ?? 'openclaw'
    const provider = resolveRuntimeProviderForMode(runtimeDraft, mode)
    const channelOwnership = mode === 'byo'
      ? (runtimeDraft.channel_ownership ?? 'runtime_native')
      : (runtimeDraft.channel_ownership ?? 'lucid_relay')
    const csrf = getCsrfToken()
    const res = await fetch(`/api/runtimes?org_id=${encodeURIComponent(orgId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf && { 'x-csrf-token': csrf }),
      },
      body: JSON.stringify({
        displayName: `${agentName || 'Agent'} ${mode === 'byo' ? 'BYO runtime' : 'runtime'}`,
        description: `Runtime for ${agentName || 'agent'}`,
        provider,
        engine: selectedEngine,
        runtimeTier: mode,
        runtimeFlavor: mode === 'byo' ? 'c2a_autonomous' : 'c1_managed',
        channelOwnership,
        channelMode: channelOwnership === 'runtime_native' ? 'native' : 'relay',
        dedicatedTransportMode: channelOwnership === 'runtime_native' ? 'native_pulse' : 'relay',
        runtimeBootstrapConfig: {
          advanced: {
            ...(runtimeDraft.network ? { network: runtimeDraft.network } : {}),
            ...(runtimeDraft.limits ? { limits: runtimeDraft.limits } : {}),
            ...(runtimeDraft.maintenance ? { maintenance: runtimeDraft.maintenance } : {}),
            ...(runtimeDraft.model ? { model: runtimeDraft.model } : {}),
          },
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.runtime?.id) {
      toast.error(typeof data?.error === 'string' ? data.error : 'Failed to provision runtime')
      return undefined
    }
    const runtimeId = String(data.runtime.id)
    const nextRuntime: RuntimeBlueprint = {
      ...runtimeDraft,
      mode,
      runtime_id: runtimeId,
      engine: selectedEngine,
      provider,
      channel_ownership: channelOwnership,
    }
    setRuntimeDraft(nextRuntime)
    await handleReassign(runtimeId)
    toast.success(mode === 'byo' && provider === 'manual' ? 'BYO runtime token generated' : 'Runtime deployment started')
    return {
      runtimeId,
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : undefined,
      envVars: data.envVars && typeof data.envVars === 'object'
        ? data.envVars as Record<string, string>
        : undefined,
    }
  }

  const runRuntimeMaintenance = async (runtimeIdToUse: string, action: 'reconcile' | 'redeploy' | 'restart') => {
    const csrf = getCsrfToken()
    const res = await fetch(`/api/runtimes/${runtimeIdToUse}/maintenance?org_id=${encodeURIComponent(orgId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf && { 'x-csrf-token': csrf }),
      },
      body: JSON.stringify({ action }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(typeof data?.error === 'string' ? data.error : `Failed to ${action} runtime`)
      return
    }
    toast.success(action === 'reconcile' ? 'Runtime test queued' : `Runtime ${action} queued`)
  }

  const testRuntime = async (runtimeIdToUse: string) => {
    const res = await fetch(`/api/runtimes/${runtimeIdToUse}/capabilities?org_id=${encodeURIComponent(orgId)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(typeof data?.error === 'string' ? data.error : 'Runtime test failed')
      return
    }
    toast.success(data?.warning ? `Runtime reachable: ${data.warning}` : 'Runtime reachable')
  }

  const handleReassign = async (newRuntimeId: string | null) => {
    setReassigning(true)
    try {
      const csrf = getCsrfToken()
      const res = await fetch(`/api/mission-control/agents/${agentId}/runtime`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ runtimeId: newRuntimeId }),
      })
      if (res.ok) {
        const nextRuntime = newRuntimeId ? runtimes.find((runtime) => runtime.id === newRuntimeId) : null
        onRuntimeChange?.(
          newRuntimeId,
          nextRuntime?.runtimeFlavor ?? (newRuntimeId ? 'c1_managed' : 'shared'),
        )
        toast.success(
          newRuntimeId
            ? `Moved ${agentName} to dedicated runtime`
            : `Moved ${agentName} to shared runtime`
        )
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to reassign')
      }
    } catch {
      toast.error(notificationCopy.common.networkError)
    }
    setReassigning(false)
  }

  const handleRuntimeDraftChange = async (nextRuntime: RuntimeBlueprint | undefined) => {
    if (!nextRuntime) return
    setRuntimeDraft(nextRuntime)

    if (nextRuntime.runtime_id !== runtimeId) {
      await handleReassign(nextRuntime.runtime_id ?? null)
    }

    if (nextRuntime.engine && nextRuntime.engine !== engine) {
      try {
        const csrf = getCsrfToken()
        const res = await fetch(`/api/assistants/${agentId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf && { 'x-csrf-token': csrf }),
          },
          body: JSON.stringify({
            engine: nextRuntime.engine,
            runtime_flavor: runtimeModeToFlavor(nextRuntime.mode),
          }),
        })
        if (!res.ok) throw new Error('Failed to update engine')
        onEngineChange?.(nextRuntime.engine)
        toast.success('Updated runtime engine')
      } catch {
        toast.error('Failed to update runtime engine')
      }
    }

    if (nextRuntime.runtime_id) {
      try {
        const csrf = getCsrfToken()
        const autoUpdatePolicy = nextRuntime.maintenance?.auto_update_policy
        const res = await fetch(`/api/runtimes/${nextRuntime.runtime_id}?org_id=${encodeURIComponent(orgId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf && { 'x-csrf-token': csrf }),
          },
          body: JSON.stringify({
            engine: nextRuntime.engine,
            runtimeFlavor: runtimeModeToFlavor(nextRuntime.mode) === 'shared'
              ? undefined
              : runtimeModeToFlavor(nextRuntime.mode),
            channelOwnership: nextRuntime.channel_ownership,
            autoUpdatePolicy,
            runtimeBootstrapConfig: {
              advanced: {
                ...(nextRuntime.network ? { network: nextRuntime.network } : {}),
                ...(nextRuntime.limits ? { limits: nextRuntime.limits } : {}),
                ...(nextRuntime.maintenance ? { maintenance: nextRuntime.maintenance } : {}),
                ...(nextRuntime.model ? { model: nextRuntime.model } : {}),
              },
            },
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to update runtime configuration')
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update runtime configuration')
      }
    }
  }

  const handleModelChange = async (nextModel: string | undefined) => {
    try {
      const csrf = getCsrfToken()
      const model = nextModel ?? 'lucid-auto'
      const res = await fetch(`/api/assistants/${agentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ lucid_model: model }),
      })
      if (!res.ok) throw new Error('Failed to update model')
      onModelChange?.(nextModel)
      toast.success('Updated model')
    } catch {
      toast.error('Failed to update model')
    }
  }

  const handleRetry = async () => {
    if (!currentRuntime) return
    setRetrying(true)
    try {
      const csrf = getCsrfToken()
      const res = await fetch(`/api/runtimes/deploy-for-agent?org_id=${orgId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          agentId,
          provider: currentRuntime.provider,
        }),
      })
      if (res.ok) {
        toast.success('Redeploying runtime...')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Retry failed')
      }
    } catch {
      toast.error(notificationCopy.common.networkError)
    }
    setRetrying(false)
  }

  // Build the primary state card
  const stateBlock = (() => {
    if (isShared) {
      return (
        <PanelStateCard
          icon={<Cloud className="h-4 w-4 text-muted-foreground" />}
          title="Lucid Cloud (Shared)"
          subtitle="Managed runtime · Auto-scaling"
          status={<span className="text-[10px] text-emerald-400 font-medium">Active</span>}
        >
          <div className="space-y-1.5">
            <PanelInfoRow label="Region" value="Auto" />
            <PanelInfoRow label="Cold start" value="~200ms" />
            <PanelInfoRow label="Scaling" value="Auto (shared pool)" />
          </div>
        </PanelStateCard>
      )
    }

    const isLucidManaged = currentRuntime.runtimeTier === 'dedicated' || currentRuntime.provider === 'railway'
    const providerLabel = isLucidManaged
      ? 'Lucid Cloud'
      : (PROVIDER_LABELS[currentRuntime.provider] || currentRuntime.provider)

    if (isDeploying) {
      return (
        <PanelStateCard
          icon={<Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
          title={currentRuntime.displayName}
          subtitle={`Deploying · ${providerLabel}`}
          variant="warning"
        />
      )
    }

    if (isFailed) {
      return (
        <PanelStateCard
          icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
          title={currentRuntime.displayName}
          subtitle={`${providerLabel} · Deployment failed`}
          variant="error"
          status={
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleRetry} disabled={retrying}>
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
              Retry
            </Button>
          }
        />
      )
    }

    const rt = currentRuntime!

    return (
      <PanelStateCard
        icon={<Server className="h-4 w-4 text-muted-foreground" />}
        title={rt.displayName}
        subtitle={providerLabel}
        status={<ConnectionStatus lastSeenAt={rt.lastSeenAt} />}
        variant="success"
      >
        <div className="space-y-3">
          {/* Resource gauges */}
          {(rt.cpuPercent != null || rt.ramPercent != null || rt.diskPercent != null || rt.gpuPercent != null) && (
            <RadialGaugeRow
              cpu={rt.cpuPercent}
              ram={rt.ramPercent}
              disk={rt.diskPercent}
              gpu={rt.gpuPercent}
              size={64}
              strokeWidth={5}
            />
          )}

          {/* Hardware specs */}
          {rt.systemInfo && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              {rt.systemInfo.cpuModel && (
                <PanelInfoRow label="CPU" value={<span className="font-mono text-[10px]">{rt.systemInfo.cpuModel}</span>} />
              )}
              {rt.systemInfo.cpuCores && (
                <PanelInfoRow label="Cores" value={String(rt.systemInfo.cpuCores)} />
              )}
              {rt.systemInfo.ramTotalGb && (
                <PanelInfoRow label="RAM" value={`${rt.systemInfo.ramTotalGb} GB`} />
              )}
              {rt.systemInfo.platform && (
                <PanelInfoRow label="OS" value={`${rt.systemInfo.platform}${rt.systemInfo.arch ? ` / ${rt.systemInfo.arch}` : ''}`} />
              )}
            </div>
          )}

          {/* Worker detail */}
          <div className="space-y-1 pt-1 border-t border-border/50">
            <PanelInfoRow label="Provider" value={providerLabel} />
            {rt.restartPolicy && <PanelInfoRow label="Restart" value={rt.restartPolicy} />}
          </div>

          {/* Queue health */}
          {(rt.workerPendingEvents > 0 || rt.workerDeadLetters > 0) && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              {rt.workerPendingEvents > 0 && <PanelInfoRow label="Pending" value={<span className="text-amber-400">{rt.workerPendingEvents}</span>} />}
              {rt.workerDeadLetters > 0 && <PanelInfoRow label="Dead letters" value={<span className="text-red-400">{rt.workerDeadLetters}</span>} />}
            </div>
          )}
        </div>
      </PanelStateCard>
    )
  })()

  return (
    <PanelLayout
      context="Where this agent runs. Shared is zero-config, dedicated gives isolated compute."
      state={stateBlock}
    >
      <AgentRuntimeEnginePanel
        mode="agent-page"
        runtime={runtimeDraft}
        runtimes={runtimes.filter((runtime) => PICKER_ELIGIBLE_STATUSES.has(runtime.status) || runtime.id === runtimeId)}
        runtimeFeatureAccess={runtimeFeatureAccess}
        modelHint={modelHint}
        onChange={(nextRuntime) => { void handleRuntimeDraftChange(nextRuntime) }}
        onModelChange={(nextModel) => { void handleModelChange(nextModel) }}
        onCreateDedicatedRuntime={() => provisionRuntime('dedicated')}
        onConnectByoRuntime={() => provisionRuntime('byo')}
        onViewRuntime={(id) => {
          if (workspaceSlug) window.location.href = `/${workspaceSlug}/mission-control/system/runtimes/${id}`
        }}
        onTestRuntime={(id) => testRuntime(id)}
        onRestartRuntime={(id) => runRuntimeMaintenance(id, 'restart')}
        onRedeployRuntime={(id) => runRuntimeMaintenance(id, 'redeploy')}
      />
    </PanelLayout>
  )
}
