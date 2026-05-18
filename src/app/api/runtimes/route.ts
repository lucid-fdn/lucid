import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimes, createRuntime, updateRuntimeL2Status } from '@/lib/db/mission-control'
import { createRuntimeSchema } from '@/lib/mission-control/schemas'
import { MANAGED_PROVIDERS } from '@/lib/mission-control/constants'
import {
  canUseByo,
  canUseManagedRuntime,
  canUseNativeRuntimeChannels,
  canUseRuntimeCustomLimits,
  canUseRuntimeFullAutoUpdates,
  canUseRuntimeMaintenance,
  canUseRuntimeNetworkControls,
} from '@/lib/mission-control/plan-check'
import { provisionRuntimeKey, deployRuntimeViaL2, isL2DeployError } from './_deploy'
import { ErrorService } from '@/lib/errors/error-service'
import {
  getEngineDefinition,
  isEngineAvailable,
} from '@/lib/engines/registry'
import { getEngineDeployReadiness } from '@/lib/engines/deploy-readiness'
import {
  supportsChannelOwnership,
  supportsDedicatedTransportMode,
  supportsRuntimeConfiguration,
  supportsRuntimeFlavor,
} from '@lucid/runtime-compat'
import { getRuntimeBridge } from '@/lib/engines/bridges'
import type { AgentEngine } from '@/lib/engines/types'
import { getRuntimeImageConfigurationError } from '@/lib/engines/image-resolution'
import { normalizeRuntimeBootstrapConfig, type RuntimeBootstrapConfig } from '@/lib/runtimes/bootstrap'
import type { RuntimeMigrationConfig } from '@/lib/runtimes/migration'
import { isDedicatedNativePulseAllowed } from '@/lib/runtimes/dedicated-transport'
import { revokeRuntime } from '@/lib/db/mission-control'
import { sanitizeRuntimeForClient } from '@/lib/mission-control/runtime-client-sanitize'

export const dynamic = 'force-dynamic'

const FEATURE_REDIS_INGEST = process.env.FEATURE_REDIS_INGEST === 'true'

// GET /api/runtimes?org_id=xxx
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const runtimes = await getRuntimes(orgId)

    // Redis overlay: merge fresher live metrics from Redis Hash
    if (FEATURE_REDIS_INGEST && runtimes.length > 0) {
      try {
        const { getLiveMetrics } = await import('@/lib/redis/streams')
        const runtimeIds = runtimes.map((r) => r.id)
        const liveMetrics = await getLiveMetrics(runtimeIds)

        for (const rt of runtimes) {
          const live = liveMetrics.get(rt.id)
          if (!live) continue

          // Use Redis values if fresher than Postgres
          const pgLastSeen = rt.lastSeenAt ? new Date(rt.lastSeenAt).getTime() : 0
          const redisLastSeen = new Date(live.lastSeenAt).getTime()

          if (redisLastSeen > pgLastSeen) {
            rt.cpuPercent = live.cpuPercent
            rt.ramPercent = live.ramPercent
            rt.diskPercent = live.diskPercent
            rt.gpuPercent = live.gpuPercent
            rt.lastSeenAt = live.lastSeenAt
          }
        }
      } catch {
        // Redis unavailable — return Postgres-only data (graceful degradation)
      }
    }

    return NextResponse.json({ runtimes: runtimes.map(sanitizeRuntimeForClient) })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/runtimes — Create a managed or BYO runtime
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createRuntimeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { runtimeTier } = parsed.data
    const engine = parsed.data.engine as AgentEngine
    const engineDefinition = getEngineDefinition(engine)
    const runtimeBridge = getRuntimeBridge(engine)
    const runtimeFlavor = parsed.data.runtimeFlavor
      ?? (runtimeTier === 'byo' ? 'c2a_autonomous' : 'c1_managed')
    const channelOwnership = parsed.data.channelOwnership
      ?? (runtimeFlavor === 'c2a_autonomous' ? 'runtime_native' : 'lucid_relay')
    const channelMode =
      parsed.data.channelMode ??
      (channelOwnership === 'runtime_native' ? 'native' : 'relay')
    const dedicatedTransportMode =
      parsed.data.dedicatedTransportMode ??
      (channelMode === 'native' ? 'native_pulse' : 'relay')
    const runtimeBootstrapConfig = normalizeRuntimeBootstrapConfig(
      ((parsed.data.runtimeBootstrapConfig as RuntimeBootstrapConfig | undefined) ??
        ((parsed.data.migration as RuntimeMigrationConfig | undefined)
          ? { migration: parsed.data.migration as RuntimeMigrationConfig }
          : null)) as RuntimeBootstrapConfig | null,
    )

    if (!isEngineAvailable(engine)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} is not available for runtime deployment yet` },
        { status: 400 }
      )
    }

    if (!supportsRuntimeFlavor(engine, runtimeFlavor)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${runtimeFlavor}` },
        { status: 400 }
      )
    }

    if (!supportsChannelOwnership(engine, channelOwnership)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${channelOwnership}` },
        { status: 400 }
      )
    }

    if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
      return NextResponse.json(
        {
          error:
            `${engineDefinition.label} does not support ${channelOwnership} for ${runtimeFlavor}`,
        },
        { status: 400 }
      )
    }

    if (!supportsDedicatedTransportMode(engine, runtimeFlavor, channelOwnership, dedicatedTransportMode)) {
      return NextResponse.json(
        {
          error:
            `${engineDefinition.label} does not support ${dedicatedTransportMode} transport for ${channelOwnership}/${runtimeFlavor}`,
        },
        { status: 400 }
      )
    }

    if (dedicatedTransportMode === 'native_pulse' && !isDedicatedNativePulseAllowed(orgId)) {
      return NextResponse.json(
        { error: 'Dedicated native Pulse is not enabled for this organization' },
        { status: 403 }
      )
    }

    // ── Plan-based gating ──
    if (runtimeTier === 'dedicated') {
      if (!(await canUseManagedRuntime(orgId))) {
        return NextResponse.json(
          { error: 'Managed runtimes require a Pro plan or higher' },
          { status: 403 }
        )
      }
    }
    if (runtimeTier === 'byo') {
      if (!(await canUseByo(orgId))) {
        return NextResponse.json(
          { error: 'BYO runtimes require a Business plan or higher' },
          { status: 403 }
        )
      }
    }
    if (channelOwnership === 'runtime_native' && !(await canUseNativeRuntimeChannels(orgId))) {
      return NextResponse.json(
        { error: 'Runtime native channels require a Business plan or higher' },
        { status: 403 },
      )
    }
    const advancedConfig = runtimeBootstrapConfig?.advanced
    if (advancedConfig?.network && !(await canUseRuntimeNetworkControls(orgId))) {
      return NextResponse.json(
        { error: 'Runtime network controls require a Business plan or higher' },
        { status: 403 },
      )
    }
    if (advancedConfig?.limits && !(await canUseRuntimeCustomLimits(orgId))) {
      return NextResponse.json(
        { error: 'Runtime custom limits require a Pro plan or higher' },
        { status: 403 },
      )
    }
    if (advancedConfig?.maintenance && !(await canUseRuntimeMaintenance(orgId))) {
      return NextResponse.json(
        { error: 'Runtime maintenance controls require a Pro plan or higher' },
        { status: 403 },
      )
    }
    if (advancedConfig?.maintenance?.auto_update_policy === 'full_auto' && !(await canUseRuntimeFullAutoUpdates(orgId))) {
      return NextResponse.json(
        { error: 'Full auto-updates require a Business plan or higher' },
        { status: 403 },
      )
    }

    // ── Provider resolution ──
    // Managed: always use the default managed provider (Railway)
    // BYO: use whatever the client sent (already Zod-validated against runtimeProviderSchema)
    const effectiveProvider = runtimeTier === 'dedicated'
      ? MANAGED_PROVIDERS[0]
      : parsed.data.provider

    const deployReadiness = getEngineDeployReadiness({
      engine,
      runtimeFlavor,
      provider: effectiveProvider,
    })
    if (!deployReadiness.ready && !(runtimeTier === 'byo' && parsed.data.provider === 'manual')) {
      return NextResponse.json(
        { error: deployReadiness.error ?? getRuntimeImageConfigurationError(engine, runtimeFlavor) },
        { status: 400 },
      )
    }

    const runtimeResult = await createRuntime({
      orgId,
      displayName: parsed.data.displayName,
      description: parsed.data.description,
      provider: effectiveProvider,
      apiKeyHash: 'pending',
      engine,
      runtimeTier: runtimeTier ?? null,
      runtimeFlavor,
      channelOwnership,
      runtimeProtocol: runtimeBridge.runtimeProtocol,
      dedicatedTransportMode,
      pendingAgentName: parsed.data.pendingAgentName,
      pendingAgentUserId: parsed.data.pendingAgentName ? userId : undefined,
      pendingAgentConfig: parsed.data.pendingAgentConfig,
      runtimeBootstrapConfig,
      autoUpdatePolicy: runtimeBootstrapConfig?.advanced?.maintenance?.auto_update_policy ?? null,
      channelMode,
    })

    if (!runtimeResult) {
      return NextResponse.json({ error: 'Failed to create runtime' }, { status: 500 })
    }

    const { apiKey, envVars } = await provisionRuntimeKey(runtimeResult.id, orgId, channelMode, {
      engine,
      runtimeFlavor,
      runtimeProtocol: runtimeBridge.runtimeProtocol,
      dedicatedTransportMode,
      runtimeBootstrapConfig,
    })

    // Manual BYO: skip L2 deploy, return env vars for user to configure
    const isManualByo = runtimeTier === 'byo' && parsed.data.provider === 'manual'

    let l2Deployment = null
    if (!isManualByo) {
      l2Deployment = await deployRuntimeViaL2({
        runtimeId: runtimeResult.id,
        orgId,
        provider: effectiveProvider,
        displayName: parsed.data.displayName,
        engine,
        runtimeFlavor,
        channelOwnership,
        dedicatedTransportMode,
        runtimeProtocol: runtimeBridge.runtimeProtocol,
        envVars,
      })
    }

    if (!isManualByo && (isL2DeployError(l2Deployment) || !l2Deployment)) {
      if (isL2DeployError(l2Deployment)) {
        await updateRuntimeL2Status(
          runtimeResult.id,
          'launch_failed',
          `[${l2Deployment.code}] ${l2Deployment.error}`,
        )
      }
      await revokeRuntime(runtimeResult.id, orgId)
      return NextResponse.json(
        {
          error:
            isL2DeployError(l2Deployment)
              ? l2Deployment.error
              : 'Failed to deploy runtime. Runtime launch was rejected before infrastructure was created.',
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      runtime: { id: runtimeResult.id },
      apiKey,
      envVars,
      l2Deployment,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
