import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import type { RuntimeFeatureAccess } from '@/lib/access-control/types'
import {
  ENGINE_OPTIONS,
  getEngineDefinition,
  isEngineAvailable,
  supportsRuntimeConfiguration,
  supportsRuntimeFlavor,
} from '@/lib/engines/registry'
import type { AgentEngine, ChannelOwnership, RuntimeFlavor } from '@/lib/engines/types'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import { getRuntimeProviderLabel } from '@/lib/runtimes/runtime-provider-selection'

export type RuntimeEngineStatus =
  | 'ready'
  | 'needs-runtime'
  | 'runtime-offline'
  | 'engine-unsupported'
  | 'channel-mode-mismatch'
  | 'update-available'

export interface RuntimeEngineIssue {
  code: RuntimeEngineStatus | 'runtime-engine-mismatch' | 'skill-unsupported' | 'plan-gated'
  message: string
  action: string
  blocking: boolean
}

export interface RuntimeEngineValidation {
  engine: AgentEngine
  runtimeFlavor: RuntimeFlavor
  channelOwnership: ChannelOwnership
  status: RuntimeEngineStatus
  summary: string
  selectedRuntime: DedicatedRuntime | null
  issues: RuntimeEngineIssue[]
  blockingIssues: RuntimeEngineIssue[]
  warnings: RuntimeEngineIssue[]
}

export function validateRuntimeEngineSetup(params: {
  runtime?: RuntimeBlueprint | null
  runtimes?: DedicatedRuntime[]
  selectedSkills?: UnifiedSkillItem[]
  runtimeFeatureAccess?: RuntimeFeatureAccess | null
}): RuntimeEngineValidation {
  const runtime = params.runtime ?? null
  const runtimes = params.runtimes ?? []
  const engine = normalizeAgentEngine(runtime?.engine)
  const runtimeFlavor = runtimeModeToFlavor(runtime?.mode ?? 'shared')
  const channelOwnership = runtime?.channel_ownership ?? 'lucid_relay'
  const selectedRuntime = runtime?.runtime_id
    ? runtimes.find((candidate) => candidate.id === runtime.runtime_id) ?? null
    : null
  const issues: RuntimeEngineIssue[] = []
  const access = params.runtimeFeatureAccess ?? null

  if (!isEngineAvailable(engine)) {
    const definition = getEngineDefinition(engine)
    issues.push({
      code: 'engine-unsupported',
      message: `${definition.label} is not available for deployment yet.`,
      action: 'Switch to OpenClaw or another available engine.',
      blocking: true,
    })
  }

  if (!supportsRuntimeFlavor(engine, runtimeFlavor)) {
    const definition = getEngineDefinition(engine)
    issues.push({
      code: 'engine-unsupported',
      message: `${definition.label} does not support ${runtimeFlavor}.`,
      action: 'Switch engine or choose a compatible runtime mode.',
      blocking: true,
    })
  }

  if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
    const definition = getEngineDefinition(engine)
    issues.push({
      code: 'channel-mode-mismatch',
      message: `${definition.label} does not support ${channelOwnership} on ${runtimeFlavor}.`,
      action: channelOwnership === 'runtime_native' ? 'Use Lucid relay or switch to OpenClaw.' : 'Choose a compatible engine/runtime path.',
      blocking: true,
    })
  }

  if (runtimeFlavor !== 'shared' && !runtime?.runtime_id) {
    issues.push({
      code: 'needs-runtime',
      message: runtime?.mode === 'byo' ? 'BYO runtime is selected but no runtime is connected.' : 'Dedicated runtime is selected but no runtime is selected.',
      action: runtime?.mode === 'byo' ? 'Connect a BYO runtime.' : 'Create or select a dedicated runtime.',
      blocking: true,
    })
  }

  if (access) {
    if (runtime?.mode === 'dedicated' && !access.canUseDedicatedRuntime) {
      issues.push({
        code: 'plan-gated',
        message: 'Dedicated runtimes are not available on this plan.',
        action: 'Upgrade to Pro or use Lucid Cloud.',
        blocking: true,
      })
    }

    if (runtime?.mode === 'byo' && !access.canUseByoRuntime) {
      issues.push({
        code: 'plan-gated',
        message: 'BYO runtimes are not available on this plan.',
        action: 'Upgrade to Business or use Lucid Cloud.',
        blocking: true,
      })
    }

    if (channelOwnership === 'runtime_native' && !access.canUseNativeChannels) {
      issues.push({
        code: 'plan-gated',
        message: 'Runtime-native channels are not available on this plan.',
        action: 'Upgrade to Business or use Lucid relay.',
        blocking: true,
      })
    }

    if (runtime?.network && !access.canUseNetworkControls) {
      issues.push({
        code: 'plan-gated',
        message: 'Network and secrets controls are not available on this plan.',
        action: 'Upgrade to Business or reset network settings.',
        blocking: true,
      })
    }

    if (runtime?.limits && Object.keys(runtime.limits).length > 0 && !access.canUseCustomLimits) {
      issues.push({
        code: 'plan-gated',
        message: 'Custom runtime limits are not available on this plan.',
        action: 'Upgrade to Pro or reset capacity limits.',
        blocking: true,
      })
    }

    if (runtime?.maintenance && !access.canUseMaintenance) {
      issues.push({
        code: 'plan-gated',
        message: 'Runtime maintenance controls are not available on this plan.',
        action: 'Upgrade to Pro or reset maintenance settings.',
        blocking: true,
      })
    } else if (runtime?.maintenance?.auto_update_policy === 'full_auto' && !access.canUseFullAutoUpdates) {
      issues.push({
        code: 'plan-gated',
        message: 'Full auto-updates are not available on this plan.',
        action: 'Upgrade to Business or choose security/patch auto-updates.',
        blocking: true,
      })
    }
  }

  if (runtime?.runtime_id && !selectedRuntime) {
    issues.push({
      code: 'needs-runtime',
      message: 'The selected runtime is no longer available.',
      action: 'Select another runtime or return to Lucid Cloud.',
      blocking: true,
    })
  }

  if (selectedRuntime) {
    if (selectedRuntime.status === 'offline' || selectedRuntime.status === 'failed' || selectedRuntime.status === 'revoked') {
      issues.push({
        code: 'runtime-offline',
        message: `Runtime is ${selectedRuntime.status}.`,
        action: 'Restart, redeploy, or choose another runtime.',
        blocking: true,
      })
    } else if (selectedRuntime.status === 'stale' || selectedRuntime.status === 'pending' || selectedRuntime.status === 'deploying') {
      issues.push({
        code: selectedRuntime.status === 'deploying' ? 'needs-runtime' : 'runtime-offline',
        message: `Runtime is ${selectedRuntime.status}; deployment may not be ready yet.`,
        action: 'Wait for heartbeat or choose a connected runtime.',
        blocking: selectedRuntime.status !== 'stale',
      })
    }

    if (selectedRuntime.engine !== engine) {
      issues.push({
        code: 'runtime-engine-mismatch',
        message: `Runtime engine is ${selectedRuntime.engine}, but this agent is set to ${engine}.`,
        action: `Switch engine to ${selectedRuntime.engine} or select a matching runtime.`,
        blocking: true,
      })
    }

    if (selectedRuntime.runtimeFlavor && selectedRuntime.runtimeFlavor !== runtimeFlavor) {
      issues.push({
        code: 'runtime-engine-mismatch',
        message: `Runtime flavor is ${selectedRuntime.runtimeFlavor}, but this setup requires ${runtimeFlavor}.`,
        action: 'Select a compatible runtime target.',
        blocking: true,
      })
    }

    if (runtime?.provider && selectedRuntime.provider !== runtime.provider) {
      issues.push({
        code: 'runtime-engine-mismatch',
        message: `Runtime provider is ${selectedRuntime.provider}, but this setup targets ${runtime.provider}.`,
        action: 'Switch provider setup or select a matching runtime.',
        blocking: true,
      })
    }

    if (selectedRuntime.channelOwnership && selectedRuntime.channelOwnership !== channelOwnership) {
      issues.push({
        code: 'channel-mode-mismatch',
        message: `Runtime uses ${selectedRuntime.channelOwnership}, but this setup uses ${channelOwnership}.`,
        action: 'Switch channel ownership or select another runtime.',
        blocking: true,
      })
    }

    if (selectedRuntime.targetImageRef && selectedRuntime.currentImageRef && selectedRuntime.targetImageRef !== selectedRuntime.currentImageRef) {
      issues.push({
        code: 'update-available',
        message: 'Runtime has an update available.',
        action: 'Update or redeploy when ready.',
        blocking: false,
      })
    }
  }

  for (const skill of params.selectedSkills ?? []) {
    if (skill.supported_engines?.length && !skill.supported_engines.includes(engine)) {
      issues.push({
        code: 'skill-unsupported',
        message: `${skill.name} does not declare support for ${engine}.`,
        action: 'Remove the skill or switch to a compatible engine.',
        blocking: true,
      })
    }

    if (skill.runtime_flavors?.length && !skill.runtime_flavors.includes(runtimeFlavor)) {
      issues.push({
        code: 'skill-unsupported',
        message: `${skill.name} does not support ${runtimeFlavor}.`,
        action: 'Remove the skill or choose a compatible runtime mode.',
        blocking: true,
      })
    }

    if (skill.channel_ownership?.length && !skill.channel_ownership.includes(channelOwnership)) {
      issues.push({
        code: 'skill-unsupported',
        message: `${skill.name} does not support ${channelOwnership}.`,
        action: 'Remove the skill or switch channel ownership.',
        blocking: true,
      })
    }

    if (skill.support_level === 'unsupported') {
      issues.push({
        code: 'skill-unsupported',
        message: `${skill.name} is marked unsupported for runtime execution.`,
        action: 'Remove the skill or choose a compatible replacement.',
        blocking: true,
      })
    } else if (skill.support_level === 'experimental') {
      issues.push({
        code: 'skill-unsupported',
        message: `${skill.name} has experimental runtime support.`,
        action: 'Review the skill before deploying production traffic.',
        blocking: false,
      })
    }
  }

  const blockingIssues = issues.filter((issue) => issue.blocking)
  const warnings = issues.filter((issue) => !issue.blocking)
  const status = deriveRuntimeEngineStatus(blockingIssues[0] ?? warnings[0])

  return {
    engine,
    runtimeFlavor,
    channelOwnership,
    status,
    summary: buildRuntimeEngineSummary(runtime, engine, runtimeFlavor),
    selectedRuntime,
    issues,
    blockingIssues,
    warnings,
  }
}

export function normalizeAgentEngine(value: string | undefined | null): AgentEngine {
  return ENGINE_OPTIONS.some((definition) => definition.key === value)
    ? value as AgentEngine
    : 'openclaw'
}

export function runtimeModeToFlavor(mode: RuntimeBlueprint['mode']): RuntimeFlavor {
  if (mode === 'byo') return 'c2a_autonomous'
  if (mode === 'dedicated') return 'c1_managed'
  return 'shared'
}

function deriveRuntimeEngineStatus(issue: RuntimeEngineIssue | undefined): RuntimeEngineStatus {
  if (!issue) return 'ready'
  if (
    issue.code === 'ready'
    || issue.code === 'needs-runtime'
    || issue.code === 'runtime-offline'
    || issue.code === 'engine-unsupported'
    || issue.code === 'channel-mode-mismatch'
    || issue.code === 'update-available'
  ) {
    return issue.code
  }
  return issue.blocking ? 'needs-runtime' : 'ready'
}

function buildRuntimeEngineSummary(
  runtime: RuntimeBlueprint | null,
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
) {
  const runtimeLabel = runtime?.mode === 'byo'
    ? `BYO runtime${runtime.provider ? ` (${getRuntimeProviderLabel(runtime.provider)})` : ''}`
    : runtime?.mode === 'dedicated'
      ? `Dedicated Lucid runtime${runtime.provider ? ` (${getRuntimeProviderLabel(runtime.provider)})` : ''}`
      : 'Lucid Cloud'
  const engineLabel = getEngineDefinition(engine).label
  const flavorLabel = runtimeFlavor === 'shared'
    ? 'Shared'
    : runtimeFlavor === 'c1_managed'
      ? 'Dedicated'
      : 'BYO'
  return `${runtimeLabel} - ${engineLabel} - ${flavorLabel}`
}
