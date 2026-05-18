'use client'

import * as React from 'react'
import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import {
  ChevronDown,
  Cloud,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  HardDrive,
  HeartPulse,
  Lock,
  RotateCw,
  Server,
  Shield,
  SlidersHorizontal,
} from 'lucide-react'

import type { RuntimeFeatureAccess } from '@/lib/access-control/types'
import { AssistantOptionPickerPanel } from '@/components/assistant/assistant-option-picker-panel'
import { EngineIcon, getEngineLabel } from '@/components/icons/engine-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ENGINE_OPTIONS } from '@/lib/engines/registry'
import { toast } from '@/hooks/use-toast'
import { getEngineAvailabilityLabel, getRuntimeModePresentation } from '@/lib/engines/presentation'
import type { AgentEngine, ChannelOwnership } from '@/lib/engines/types'
import {
  normalizeAgentEngine,
  runtimeModeToFlavor,
  validateRuntimeEngineSetup,
} from '@/lib/agent-builder/runtime-engine-validation'
import { PROVIDER_LABELS } from '@/lib/mission-control/constants'
import type { DedicatedRuntime, RuntimeAutoUpdatePolicy, RuntimeProvider } from '@/lib/mission-control/types'
import {
  BYO_PROVIDER_DEPLOY_TARGETS,
  DEFAULT_BYO_PROVIDER_RUNTIME_PROVIDER,
  DEFAULT_MANAGED_RUNTIME_PROVIDER,
  MANUAL_RUNTIME_PROVIDER,
  getRuntimeProviderLabel,
  resolveByoSetupMode,
  resolveRuntimeProviderForMode,
} from '@/lib/runtimes/runtime-provider-selection'
import { cn } from '@/lib/utils'

type RuntimeMode = RuntimeBlueprint['mode']
type AgentRuntimeEnginePanelMode = 'builder' | 'agent-page'
type RuntimeProvisioningResult = {
  runtimeId: string
  apiKey?: string
  envVars?: Record<string, string>
}

interface AgentRuntimeEnginePanelProps {
  runtime?: RuntimeBlueprint | null
  runtimes?: DedicatedRuntime[]
  selectedSkills?: UnifiedSkillItem[]
  runtimeFeatureAccess?: RuntimeFeatureAccess | null
  modelHint?: string | null
  mode?: AgentRuntimeEnginePanelMode
  onChange: (runtime: RuntimeBlueprint | undefined) => void
  onModelChange?: (modelHint: string | undefined) => void
  onCreateDedicatedRuntime?: () => RuntimeProvisioningResult | void | Promise<RuntimeProvisioningResult | void>
  onConnectByoRuntime?: () => RuntimeProvisioningResult | void | Promise<RuntimeProvisioningResult | void>
  onViewRuntime?: (runtimeId: string) => void
  onTestRuntime?: (runtimeId: string) => void | Promise<void>
  onRestartRuntime?: (runtimeId: string) => void | Promise<void>
  onRedeployRuntime?: (runtimeId: string) => void | Promise<void>
  className?: string
}

const ALLOW_ALL_RUNTIME_FEATURES: RuntimeFeatureAccess = {
  canUseDedicatedRuntime: true,
  canUseByoRuntime: true,
  canUseNativeChannels: true,
  canUseAdvancedControls: true,
  canUseNetworkControls: true,
  canUseCustomLimits: true,
  canUseMaintenance: true,
  canUseFullAutoUpdates: true,
  upgradePlan: null,
}

const RUNTIME_MODE_ITEMS: Array<{
  id: RuntimeMode
  label: string
  description: string
}> = [
  {
    id: 'shared',
    label: 'Lucid Cloud',
    description: 'Default shared Lucid-managed runtime. No infrastructure setup.',
  },
  {
    id: 'dedicated',
    label: 'Dedicated Lucid runtime',
    description: 'Lucid-managed isolated runtime for availability, capacity, and observability.',
  },
  {
    id: 'byo',
    label: 'Bring your own runtime',
    description: 'Run the runtime on your own machine, private network, or custom infrastructure.',
  },
]

const CHANNEL_OWNERSHIP_ITEMS: Array<{
  id: ChannelOwnership
  label: string
  description: string
}> = [
  {
    id: 'lucid_relay',
    label: 'Lucid relay',
    description: 'Lucid owns channel delivery. Best default for Slack, Discord, Telegram, and hosted channels.',
  },
  {
    id: 'runtime_native',
    label: 'Runtime native',
    description: 'Runtime owns channel connection. Use for self-hosted/native transports like iMessage or private bridges.',
  },
]

export function AgentRuntimeEnginePanel({
  runtime,
  runtimes = [],
  selectedSkills = [],
  runtimeFeatureAccess,
  modelHint,
  mode: surfaceMode = 'builder',
  onChange,
  onModelChange,
  onCreateDedicatedRuntime,
  onConnectByoRuntime,
  onViewRuntime,
  onTestRuntime,
  onRestartRuntime,
  onRedeployRuntime,
  className,
}: AgentRuntimeEnginePanelProps) {
  const featureAccess = runtimeFeatureAccess ?? ALLOW_ALL_RUNTIME_FEATURES
  const [provisioningResult, setProvisioningResult] = React.useState<RuntimeProvisioningResult | null>(null)
  const [busyAction, setBusyAction] = React.useState<string | null>(null)
  const normalizedRuntime = runtime ?? { mode: 'shared', engine: 'openclaw' }
  const runtimeMode = normalizedRuntime.mode
  const engine = normalizeAgentEngine(normalizedRuntime.engine)
  const runtimeFlavor = runtimeModeToFlavor(runtimeMode)
  const channelOwnership = normalizedRuntime.channel_ownership ?? 'lucid_relay'
  const selectedProvider = resolveRuntimeProviderForMode(normalizedRuntime, runtimeMode)
  const byoSetupMode = resolveByoSetupMode(selectedProvider)
  const isManualByo = runtimeMode === 'byo' && selectedProvider === MANUAL_RUNTIME_PROVIDER
  const selectedProviderLabel = getRuntimeProviderLabel(selectedProvider)
  const validation = React.useMemo(() => validateRuntimeEngineSetup({
    runtime: normalizedRuntime,
    runtimes,
    selectedSkills,
    runtimeFeatureAccess: featureAccess,
  }), [featureAccess, normalizedRuntime, runtimes, selectedSkills])
  const runtimePresentation = getRuntimeModePresentation({
    runtimeFlavor,
    runtimeTier: runtimeMode === 'byo' ? 'byo' : runtimeMode === 'dedicated' ? 'dedicated' : null,
    runtimeProvider: validation.selectedRuntime?.provider ?? normalizedRuntime.provider ?? null,
    channelOwnership,
  })
  const selectedRuntimeImageLabel = validation.selectedRuntime
    ? validation.selectedRuntime.managedByLucid || validation.selectedRuntime.runtimeTier === 'dedicated'
      ? 'Lucid managed'
      : validation.selectedRuntime.currentImageRef ?? 'Not reported'
    : 'Shared pool'
  const modelMode = normalizedRuntime.model?.mode ?? (modelHint && modelHint !== 'lucid-auto' ? 'custom' : 'lucid_auto')
  const modelId = normalizedRuntime.model?.model_id ?? (modelHint && modelHint !== 'lucid-auto' ? modelHint : '')
  const commandRuntimeId = provisioningResult?.runtimeId ?? normalizedRuntime.runtime_id ?? ''
  const pairingToken = provisioningResult?.apiKey ?? ''
  const hasPairingToken = Boolean(commandRuntimeId && pairingToken)
  const envVars = provisioningResult?.envVars ?? (hasPairingToken ? {
    LUCID_RUNTIME_ID: commandRuntimeId,
    LUCID_PAIRING_TOKEN: pairingToken,
    LUCID_CONTROL_PLANE_URL: 'https://app.lucid.run',
  } : {})

  const patchRuntime = React.useCallback((patch: Partial<RuntimeBlueprint>) => {
    onChange({
      ...normalizedRuntime,
      ...patch,
    })
  }, [normalizedRuntime, onChange])

  const runProvisioningAction = React.useCallback(async (
    key: string,
    action: (() => RuntimeProvisioningResult | void | Promise<RuntimeProvisioningResult | void>) | undefined,
  ) => {
    if (!action) return
    setBusyAction(key)
    try {
      const result = await action()
      if (result?.runtimeId) {
        setProvisioningResult(result)
        patchRuntime({ runtime_id: result.runtimeId })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Runtime action failed')
    } finally {
      setBusyAction(null)
    }
  }, [patchRuntime])

  const runRuntimeAction = React.useCallback(async (
    key: string,
    runtimeId: string,
    action: ((runtimeId: string) => void | Promise<void>) | undefined,
  ) => {
    if (!action) return
    setBusyAction(key)
    try {
      await action(runtimeId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Runtime action failed')
    } finally {
      setBusyAction(null)
    }
  }, [])

  const patchNetwork = React.useCallback((patch: Partial<NonNullable<RuntimeBlueprint['network']>>) => {
    patchRuntime({
      network: {
        access: normalizedRuntime.network?.access ?? 'limited',
        allowed_hosts: normalizedRuntime.network?.allowed_hosts ?? [],
        secrets_source: normalizedRuntime.network?.secrets_source ?? 'lucid_vault',
        filesystem_access: normalizedRuntime.network?.filesystem_access ?? 'none',
        ...patch,
      },
    })
  }, [normalizedRuntime.network, patchRuntime])

  const patchLimits = React.useCallback((patch: Partial<NonNullable<RuntimeBlueprint['limits']>>) => {
    patchRuntime({
      limits: {
        ...(normalizedRuntime.limits ?? {}),
        ...patch,
      },
    })
  }, [normalizedRuntime.limits, patchRuntime])

  const statusLabel = getStatusLabel(validation.status)
  const statusTone = validation.blockingIssues.length > 0
    ? 'border-red-500/30 bg-red-500/10 text-red-200'
    : validation.warnings.length > 0
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'

  return (
    <div className={cn('space-y-5', className)}>
      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/45 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">Runtime & Engine</p>
            <p className="truncate text-xs font-mono text-muted-foreground">{validation.summary}</p>
          </div>
          <Badge variant="outline" className={cn('shrink-0 rounded-full', statusTone)}>
            {statusLabel}
          </Badge>
        </div>

        {validation.issues.length > 0 ? (
          <div className="space-y-2">
            {validation.issues.map((issue) => (
              <div
                key={`${issue.code}:${issue.message}`}
                className={cn(
                  'rounded-xl border px-3 py-2 text-[11px] leading-4',
                  issue.blocking
                    ? 'border-red-500/25 bg-red-500/10 text-red-100'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-100',
                )}
              >
                <span className="font-medium">{issue.message}</span>
                <span className="ml-1 text-muted-foreground">{issue.action}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <AssistantOptionPickerPanel
        title="Runtime"
        description="Most agents should stay on Lucid Cloud. Dedicated and BYO are advanced runtime ownership paths."
        selectedId={runtimeMode}
        onSelect={(nextMode) => {
          const selectedMode = nextMode as RuntimeMode
          onChange({
            ...normalizedRuntime,
            mode: selectedMode,
            ...(selectedMode === 'shared'
              ? { runtime_id: undefined, provider: undefined, channel_ownership: 'lucid_relay' as const }
              : selectedMode === 'dedicated'
                ? {
                    runtime_id: undefined,
                    provider: DEFAULT_MANAGED_RUNTIME_PROVIDER,
                    channel_ownership: normalizedRuntime.channel_ownership ?? 'lucid_relay',
                  }
                : {
                    runtime_id: undefined,
                    provider: normalizedRuntime.provider ?? MANUAL_RUNTIME_PROVIDER,
                    channel_ownership: normalizedRuntime.channel_ownership ?? 'runtime_native',
                  }),
          })
        }}
        items={RUNTIME_MODE_ITEMS.map((item) => {
          const blocked = item.id === 'dedicated'
            ? !featureAccess.canUseDedicatedRuntime
            : item.id === 'byo'
              ? !featureAccess.canUseByoRuntime
              : false
          return {
            ...item,
            disabled: blocked,
            badge: blocked ? (item.id === 'dedicated' ? 'Pro' : 'Business') : undefined,
          }
        })}
      />

      <AssistantOptionPickerPanel
        title="Engine"
        description="Engine controls the execution framework. It is not the LLM model."
        selectedId={engine}
        onSelect={(nextEngine) => patchRuntime({ engine: nextEngine })}
        items={ENGINE_OPTIONS.map((definition) => {
          const badge = getEngineAvailabilityLabel(definition.key, definition.available, runtimeFlavor, channelOwnership)
          return {
            id: definition.key,
            label: getEngineLabel(definition.key),
            description: definition.available
              ? describeEngine(definition.key)
              : 'Planned engine. It appears from the registry but is not deployable yet.',
            disabled: !definition.available,
            badge: badge ?? (definition.available ? undefined : 'Soon'),
            icon: <EngineIcon engine={definition.key} size={22} className="!h-[22px] !w-[22px]" />,
          }
        })}
      />

      <Section title="Model" icon={<SlidersHorizontal className="h-3.5 w-3.5" />} defaultOpen>
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Model mode">
            <Select
              value={modelMode}
              disabled={!featureAccess.canUseAdvancedControls}
              onValueChange={(value) => {
                const nextMode = value as 'lucid_auto' | 'custom'
                patchRuntime({
                  model: {
                    mode: nextMode,
                    ...(nextMode === 'custom' && modelId ? { model_id: modelId } : {}),
                    gateway_key_source: normalizedRuntime.model?.gateway_key_source ?? 'lucid',
                  },
                })
                onModelChange?.(nextMode === 'custom' && modelId ? modelId : undefined)
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lucid_auto">Lucid Auto</SelectItem>
                <SelectItem value="custom">Custom model</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Model">
            <Input
              value={modelMode === 'custom' ? modelId : 'Lucid Auto'}
              disabled={modelMode !== 'custom' || !featureAccess.canUseAdvancedControls}
              placeholder="openai/gpt-4.1-mini"
              onChange={(event) => {
                const nextModel = event.target.value
                patchRuntime({
                  model: {
                    mode: 'custom',
                    model_id: nextModel || undefined,
                    gateway_key_source: normalizedRuntime.model?.gateway_key_source ?? 'lucid',
                  },
                })
                onModelChange?.(nextModel || undefined)
              }}
            />
          </Field>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Engine is the runtime behavior. Model is the LLM. Keeping these separate avoids the old engine/model confusion.
        </p>
      </Section>

      <Section title="Runtime Target" icon={<Server className="h-3.5 w-3.5" />} defaultOpen>
        <div className="space-y-3">
          <RuntimeTargetSummary
            title={runtimePresentation.title}
            description={runtimePresentation.description}
            selectedRuntime={validation.selectedRuntime}
          />
          {runtimeMode !== 'shared' ? (
            <RuntimeTargetList
              mode={runtimeMode}
              runtime={normalizedRuntime}
              runtimes={runtimes}
              engine={engine}
              provider={selectedProvider}
              onUse={(runtimeId) => patchRuntime({ runtime_id: runtimeId })}
              onViewRuntime={onViewRuntime}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {runtimeMode === 'dedicated' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!featureAccess.canUseDedicatedRuntime || busyAction === 'create-dedicated'}
                onClick={() => void runProvisioningAction('create-dedicated', onCreateDedicatedRuntime)}
              >
                {busyAction === 'create-dedicated' ? 'Creating...' : 'Create dedicated runtime'}
              </Button>
            ) : null}
            {runtimeMode === 'byo' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!featureAccess.canUseByoRuntime || busyAction === 'connect-byo'}
                onClick={() => void runProvisioningAction('connect-byo', onConnectByoRuntime)}
              >
                {busyAction === 'connect-byo'
                  ? (isManualByo ? 'Generating...' : 'Deploying...')
                  : (isManualByo ? 'Generate pairing token' : `Deploy to ${selectedProviderLabel}`)}
              </Button>
            ) : null}
            {normalizedRuntime.runtime_id ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onViewRuntime?.(normalizedRuntime.runtime_id!)}>
                View runtime
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Channels & Ownership" icon={<Globe className="h-3.5 w-3.5" />}>
        <AssistantOptionPickerPanel
          title="Channel ownership"
          description="Lucid relay is the default. Runtime native is for self-hosted/native transports."
          selectedId={channelOwnership}
          onSelect={(value) => patchRuntime({ channel_ownership: value as ChannelOwnership })}
          items={CHANNEL_OWNERSHIP_ITEMS.map((item) => ({
            ...item,
            disabled: item.id === 'runtime_native' && !featureAccess.canUseNativeChannels,
            badge: item.id === 'runtime_native' && !featureAccess.canUseNativeChannels ? 'Business' : undefined,
          }))}
        />
        <div className="grid gap-2 md:grid-cols-2">
          <MiniCard title="Lucid relay" value="Slack, Telegram, Discord, hosted channels" />
          <MiniCard title="Runtime native" value="iMessage, WhatsApp bridge, private transports" />
        </div>
      </Section>

      {runtimeMode !== 'shared' ? (
        <Section title="Network & Secrets" icon={<Lock className="h-3.5 w-3.5" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Network access">
              <Select
                value={normalizedRuntime.network?.access ?? 'limited'}
                disabled={!featureAccess.canUseNetworkControls}
                onValueChange={(value) => patchNetwork({ access: value as NonNullable<RuntimeBlueprint['network']>['access'] })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="limited">Limited</SelectItem>
                  <SelectItem value="unrestricted">Unrestricted</SelectItem>
                  <SelectItem value="custom_allowlist">Custom allowlist</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Secrets source">
              <Select
                value={normalizedRuntime.network?.secrets_source ?? 'lucid_vault'}
                disabled={!featureAccess.canUseNetworkControls}
                onValueChange={(value) => patchNetwork({ secrets_source: value as NonNullable<RuntimeBlueprint['network']>['secrets_source'] })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lucid_vault">Lucid vault</SelectItem>
                  <SelectItem value="runtime_env">Runtime env</SelectItem>
                  <SelectItem value="byo_local_env">BYO local env</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Allowed hosts">
              <Input
                placeholder="api.company.com, internal.service"
                value={(normalizedRuntime.network?.allowed_hosts ?? []).join(', ')}
                disabled={!featureAccess.canUseNetworkControls}
                onChange={(event) => patchNetwork({
                  allowed_hosts: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                })}
              />
            </Field>
            <Field label="File access">
              <Select
                value={normalizedRuntime.network?.filesystem_access ?? 'none'}
                disabled={!featureAccess.canUseNetworkControls}
                onValueChange={(value) => patchNetwork({ filesystem_access: value as NonNullable<RuntimeBlueprint['network']>['filesystem_access'] })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="workspace_sandbox">Workspace sandbox</SelectItem>
                  <SelectItem value="runtime_local">Runtime local</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>
      ) : null}

      {runtimeMode === 'byo' ? (
        <Section title="BYO Setup" icon={<HardDrive className="h-3.5 w-3.5" />} defaultOpen>
          <AssistantOptionPickerPanel
            title="Setup method"
            description="Run manually for a local/private runtime, or deploy through a provider target handled by the Lucid L2 control plane."
            selectedId={byoSetupMode}
            onSelect={(value) => {
              const nextMode = value as 'manual' | 'provider'
              patchRuntime({
                provider: nextMode === 'manual'
                  ? MANUAL_RUNTIME_PROVIDER
                  : normalizedRuntime.provider && normalizedRuntime.provider !== MANUAL_RUNTIME_PROVIDER
                    ? normalizedRuntime.provider
                    : DEFAULT_BYO_PROVIDER_RUNTIME_PROVIDER,
                runtime_id: undefined,
              })
              setProvisioningResult(null)
            }}
            items={[
              {
                id: 'manual',
                label: 'Run manually',
                description: 'Create a runtime record and reveal pairing env vars. You run the bridge yourself.',
              },
              {
                id: 'provider',
                label: 'Deploy to provider',
                description: 'Launch runtime infrastructure through the existing provider-backed L2 deployment path.',
              },
            ]}
          />

          {byoSetupMode === 'provider' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-[11px] text-muted-foreground">Provider target</Label>
                <Badge variant="outline" className="rounded-full text-[10px]">L2 deploy</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {BYO_PROVIDER_DEPLOY_TARGETS.map((provider) => (
                  <ProviderTargetButton
                    key={provider}
                    provider={provider}
                    selected={selectedProvider === provider}
                    onSelect={() => {
                      patchRuntime({ provider, runtime_id: undefined })
                      setProvisioningResult(null)
                    }}
                  />
                ))}
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Lucid keeps the control plane. L2 launches the runtime on the selected target and returns normalized status, logs, metrics, and maintenance controls when available.
              </p>
            </div>
          ) : (
            <p className="text-[11px] leading-4 text-muted-foreground">
              Manual BYO creates the runtime and pairing secret only. Use this for a local machine, private network, or any infra you operate directly.
            </p>
          )}
        </Section>
      ) : null}

      <Section title="Capacity & Limits" icon={<Gauge className="h-3.5 w-3.5" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField label="Max concurrent runs" disabled={!featureAccess.canUseCustomLimits} value={normalizedRuntime.limits?.max_concurrent_runs} onChange={(value) => patchLimits({ max_concurrent_runs: value })} />
          <NumberField label="Tool timeout seconds" disabled={!featureAccess.canUseCustomLimits} value={normalizedRuntime.limits?.tool_timeout_seconds} onChange={(value) => patchLimits({ tool_timeout_seconds: value })} />
          <NumberField label="Memory window" disabled={!featureAccess.canUseCustomLimits} value={normalizedRuntime.limits?.memory_window} onChange={(value) => patchLimits({ memory_window: value })} />
          <NumberField label="Max tokens" disabled={!featureAccess.canUseCustomLimits} value={normalizedRuntime.limits?.max_tokens} onChange={(value) => patchLimits({ max_tokens: value })} />
          <NumberField label="Cost budget USD" disabled={!featureAccess.canUseCustomLimits} value={normalizedRuntime.limits?.cost_budget_usd} onChange={(value) => patchLimits({ cost_budget_usd: value })} />
          <Field label="Retry policy">
            <Select
              value={normalizedRuntime.limits?.retry_policy ?? 'safe'}
              disabled={!featureAccess.canUseCustomLimits}
              onValueChange={(value) => patchLimits({ retry_policy: value as NonNullable<RuntimeBlueprint['limits']>['retry_policy'] })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="safe">Safe</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Health & Maintenance" icon={<HeartPulse className="h-3.5 w-3.5" />}>
        <div className="grid gap-2 md:grid-cols-2">
          <MiniCard title="Status" value={validation.selectedRuntime?.status ?? (runtimeMode === 'shared' ? 'Ready' : 'No runtime selected')} />
          <MiniCard title="Last heartbeat" value={formatRuntimeDate(validation.selectedRuntime?.lastSeenAt)} />
          <MiniCard title="Version" value={validation.selectedRuntime?.runtimeVersion ?? validation.selectedRuntime?.engineVersion ?? 'Auto'} />
          <MiniCard title="Image" value={selectedRuntimeImageLabel} />
          <MiniCard title="Queue depth" value={String(validation.selectedRuntime?.workerPendingEvents ?? 0)} />
          <MiniCard title="Error queue" value={String(validation.selectedRuntime?.workerDeadLetters ?? 0)} />
          <MiniCard title="Attached agents" value={String(validation.selectedRuntime?.agentCount ?? 0)} />
          <MiniCard title="Auto update" value={normalizedRuntime.maintenance?.auto_update_policy ?? validation.selectedRuntime?.autoUpdatePolicy ?? 'security_auto'} />
        </div>
        <div className="flex flex-wrap gap-2">
          {validation.selectedRuntime ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyAction === 'test-runtime'}
                onClick={() => void runRuntimeAction('test-runtime', validation.selectedRuntime!.id, onTestRuntime)}
              >
                {busyAction === 'test-runtime' ? 'Testing...' : 'Test runtime'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!featureAccess.canUseMaintenance || busyAction === 'restart-runtime'}
                onClick={() => void runRuntimeAction('restart-runtime', validation.selectedRuntime!.id, onRestartRuntime)}
              >
                {busyAction === 'restart-runtime' ? 'Restarting...' : 'Restart'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!featureAccess.canUseMaintenance || busyAction === 'redeploy-runtime'}
                onClick={() => void runRuntimeAction('redeploy-runtime', validation.selectedRuntime!.id, onRedeployRuntime)}
              >
                {busyAction === 'redeploy-runtime' ? 'Redeploying...' : 'Redeploy'}
              </Button>
            </>
          ) : null}
          <Select
            value={normalizedRuntime.maintenance?.auto_update_policy ?? 'security_auto'}
            disabled={!featureAccess.canUseMaintenance}
            onValueChange={(value) => patchRuntime({
              maintenance: { auto_update_policy: value as RuntimeAutoUpdatePolicy },
            })}
          >
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual updates</SelectItem>
              <SelectItem value="security_auto">Security auto</SelectItem>
              <SelectItem value="patch_auto">Patch auto</SelectItem>
              <SelectItem value="full_auto" disabled={!featureAccess.canUseFullAutoUpdates}>Full auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {isManualByo ? (
        <Section title="BYO Pairing" icon={<HardDrive className="h-3.5 w-3.5" />} defaultOpen>
          <CopyBlock
            label="Install command"
            value={hasPairingToken
              ? `npx @lucid/bridge-cli init --runtime-id ${commandRuntimeId} --pairing-token ${pairingToken}`
              : 'Generate a pairing token to reveal the install command.'}
          />
          <CopyBlock
            label="Environment"
            value={Object.keys(envVars).length > 0
              ? Object.entries(envVars).map(([key, value]) => `${key}=${value}`).join('\n')
              : 'Generate a pairing token to reveal runtime environment variables.'}
          />
          <MiniCard title="Health check" value={commandRuntimeId ? `/api/runtimes/${commandRuntimeId}/capabilities` : 'Available after token generation'} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!featureAccess.canUseByoRuntime || busyAction === 'connect-byo'}
              onClick={() => void runProvisioningAction('connect-byo', onConnectByoRuntime)}
            >
              {busyAction === 'connect-byo' ? 'Generating...' : 'Generate pairing token'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!featureAccess.canUseByoRuntime || busyAction === 'connect-byo'}
              onClick={() => void runProvisioningAction('connect-byo', onConnectByoRuntime)}
            >
              Rotate token
            </Button>
          </div>
        </Section>
      ) : null}

      {surfaceMode === 'agent-page' ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          Changes here affect the existing agent runtime assignment. Runtime creation and BYO pairing still use the shared runtime control plane.
        </p>
      ) : null}
    </div>
  )
}

function Section({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-2xl border border-border/60 bg-background/40">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 px-4 pb-4">
          <Separator className="bg-border/60" />
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number | undefined
  disabled?: boolean
  onChange: (value: number | undefined) => void
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.valueAsNumber
          onChange(Number.isFinite(next) ? next : undefined)
        }}
      />
    </Field>
  )
}

function RuntimeTargetSummary({
  title,
  description,
  selectedRuntime,
}: {
  title: string
  description: string
  selectedRuntime: DedicatedRuntime | null
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground">{selectedRuntime?.displayName ?? title}</p>
        <Badge variant="outline" className="rounded-full text-[10px]">{selectedRuntime?.status ?? 'Ready'}</Badge>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{description}</p>
    </div>
  )
}

function RuntimeTargetList({
  mode,
  runtime,
  runtimes,
  engine,
  provider,
  onUse,
  onViewRuntime,
}: {
  mode: RuntimeMode
  runtime: RuntimeBlueprint
  runtimes: DedicatedRuntime[]
  engine: AgentEngine
  provider: RuntimeProvider
  onUse: (runtimeId: string) => void
  onViewRuntime?: (runtimeId: string) => void
}) {
  const compatibleRuntimes = runtimes.filter((candidate) => (
    mode === 'dedicated'
      ? candidate.runtimeFlavor === 'c1_managed' || candidate.runtimeTier === 'dedicated'
      : (candidate.runtimeFlavor === 'c2a_autonomous' || candidate.runtimeTier === 'byo')
        && candidate.provider === provider
  ))

  if (compatibleRuntimes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-3 text-[11px] leading-4 text-muted-foreground">
        No {mode === 'byo' ? 'BYO' : 'dedicated'} runtime is available yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {compatibleRuntimes.map((candidate) => {
        const selected = candidate.id === runtime.runtime_id
        const engineMismatch = candidate.engine !== engine
        return (
          <div
            key={candidate.id}
            className={cn(
              'rounded-xl border px-3 py-2',
              selected ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/40',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{candidate.displayName}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {candidate.provider} - {candidate.engine} - {candidate.runtimeFlavor} - {candidate.agentCount} agents
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Last heartbeat: {formatRuntimeDate(candidate.lastSeenAt)}
                </p>
                {engineMismatch ? (
                  <p className="mt-1 text-[10px] text-amber-300">Engine mismatch. Switch engine or use another runtime.</p>
                ) : null}
              </div>
              <Badge variant="outline" className="rounded-full text-[10px]">{candidate.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={selected ? 'secondary' : 'outline'} onClick={() => onUse(candidate.id)}>
                {selected ? 'Selected' : 'Use this runtime'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onViewRuntime?.(candidate.id)}>
                View runtime <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProviderTargetButton({
  provider,
  selected,
  onSelect,
}: {
  provider: RuntimeProvider
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-xl border px-3 py-2 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/40 hover:bg-muted/30',
      )}
    >
      <span className="block text-xs font-medium text-foreground">
        {PROVIDER_LABELS[provider] ?? provider}
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
        {describeRuntimeProvider(provider)}
      </span>
    </button>
  )
}

function MiniCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-[11px]"
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-border/60 bg-black p-3 text-[11px] leading-5 text-zinc-100">
        {value}
      </pre>
    </div>
  )
}

function getStatusLabel(status: ReturnType<typeof validateRuntimeEngineSetup>['status']) {
  switch (status) {
    case 'needs-runtime':
      return 'Needs runtime'
    case 'runtime-offline':
      return 'Runtime offline'
    case 'engine-unsupported':
      return 'Engine unsupported'
    case 'channel-mode-mismatch':
      return 'Channel mode mismatch'
    case 'update-available':
      return 'Update available'
    default:
      return 'Ready'
  }
}

function describeEngine(engine: AgentEngine): string {
  if (engine === 'openclaw') return 'Default stable engine with best compatibility and native-channel support.'
  if (engine === 'hermes') return 'Advanced engine for durable memory, skill changes, and deeper autonomy.'
  if (engine === 'lucid') return 'Lucid managed execution path for shared internal runtime behavior.'
  return 'Future engine from the registry.'
}

function describeRuntimeProvider(provider: RuntimeProvider): string {
  if (provider === 'railway') return 'Best supported provider-backed deploy target.'
  if (provider === 'docker') return 'Container target for your own infrastructure.'
  if (provider === 'akash') return 'Decentralized cloud target through L2.'
  if (provider === 'phala') return 'TEE-oriented cloud target through L2.'
  if (provider === 'io.net') return 'GPU/network compute target through L2.'
  if (provider === 'nosana') return 'Distributed compute target through L2.'
  return 'Manual pairing target.'
}

function formatRuntimeDate(value: string | null | undefined) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}
