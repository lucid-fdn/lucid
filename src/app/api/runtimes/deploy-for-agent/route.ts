import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import {
  createRuntime,
  getRuntimeByRequestId,
  updateRuntimeStatus,
  updateAgentRuntime,
  revokeRuntime,
  updateRuntimeL2Status,
} from '@/lib/db/mission-control'
import { deployForAgentSchema } from '@/lib/mission-control/schemas'
import { canUseManagedRuntime } from '@/lib/mission-control/plan-check'
import { provisionRuntimeKey, deployRuntimeViaL2, isL2DeployError } from '../_deploy'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'
import { supabase } from '@/lib/db/client'
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
import { isSelfHosted } from '@/lib/deployment-mode'
import { getWorkerUrl } from '@/lib/worker/config'

export const dynamic = 'force-dynamic'

function canUseLocalManagedRuntimeFallback(): boolean {
  return isSelfHosted() && Boolean(getWorkerUrl())
}

async function activateLocalManagedRuntimeFallback(params: {
  runtimeId: string
  orgId: string
  agentId: string
}) {
  const deploymentUrl = getWorkerUrl()
  if (!deploymentUrl) {
    return null
  }

  await supabase
    .from('dedicated_runtimes')
    .update({
      deployment_url: deploymentUrl,
      status: 'connected',
      last_l2_status: JSON.stringify({
        status: 'running',
        health: 'healthy',
        url: deploymentUrl,
      }),
      last_l2_error: null,
      managed_by_lucid: false,
    })
    .eq('id', params.runtimeId)
    .eq('org_id', params.orgId)

  await updateRuntimeStatus(params.runtimeId, params.orgId, 'connected')
  await updateRuntimeL2Status(
    params.runtimeId,
    JSON.stringify({
      status: 'running',
      health: 'healthy',
      url: deploymentUrl,
    }),
    null,
  )
  await updateAgentRuntime(params.agentId, params.orgId, params.runtimeId)

  return {
    runtimeId: params.runtimeId,
    status: 'connected',
    deploymentUrl,
  }
}

async function markL2ManagedRuntimeConnected(params: {
  runtimeId: string
  orgId: string
  deploymentUrl?: string | null
}) {
  await supabase
    .from('dedicated_runtimes')
    .update({
      status: 'connected',
      runtime_tier: 'dedicated',
      deployment_url: params.deploymentUrl ?? null,
      last_l2_status: 'running',
      last_l2_error: null,
      last_l2_checked_at: new Date().toISOString(),
      managed_by_lucid: true,
    })
    .eq('id', params.runtimeId)
    .eq('org_id', params.orgId)
}

/**
 * POST /api/runtimes/deploy-for-agent?org_id=xxx
 *
 * Combined create + deploy + assign endpoint.
 * Creates a dedicated runtime, deploys via L2 Gateway, and assigns to the agent.
 * Idempotent via requestId (client-generated UUID).
 */
export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = req.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!(await canUseManagedRuntime(orgId)) && !canUseLocalManagedRuntimeFallback()) {
      return NextResponse.json(
        { error: 'Managed runtimes require a Pro plan or higher' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const parsed = deployForAgentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { requestId, agentId, provider, displayName, runtimeFlavor, channelOwnership, dedicatedTransportMode } = parsed.data

    // Verify agent exists and belongs to org
    const { data: agent, error: agentErr } = await supabase
      .from('ai_assistants')
      .select('id, name, runtime_id, engine')
      .eq('id', agentId)
      .eq('org_id', orgId)
      .single()

    if (agentErr || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const requestedEngine = parsed.data.engine as AgentEngine | undefined
    if (agent.engine && requestedEngine && agent.engine !== requestedEngine) {
      return NextResponse.json(
        {
          error: `Requested engine "${requestedEngine}" does not match agent engine "${agent.engine}"`,
        },
        { status: 409 }
      )
    }
    const runtimeEngine = (agent.engine as AgentEngine | null) ?? requestedEngine ?? 'openclaw'
    const engineDefinition = getEngineDefinition(runtimeEngine)
    const runtimeBridge = getRuntimeBridge(runtimeEngine)
    const effectiveRuntimeFlavor = runtimeFlavor ?? 'c1_managed'
    const effectiveChannelOwnership = channelOwnership ?? 'lucid_relay'
    const channelMode = effectiveChannelOwnership === 'runtime_native' ? 'native' : 'relay'
    const effectiveDedicatedTransportMode =
      dedicatedTransportMode ?? (channelMode === 'native' ? 'native_pulse' : 'relay')
    const runtimeBootstrapConfig = normalizeRuntimeBootstrapConfig(
      ((parsed.data.runtimeBootstrapConfig as RuntimeBootstrapConfig | undefined) ??
        ((parsed.data.migration as RuntimeMigrationConfig | undefined)
          ? { migration: parsed.data.migration as RuntimeMigrationConfig }
          : null)) as RuntimeBootstrapConfig | null,
    )

    if (!isEngineAvailable(runtimeEngine)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} is not available for dedicated deployment yet` },
        { status: 400 }
      )
    }

    if (!supportsRuntimeFlavor(runtimeEngine, effectiveRuntimeFlavor)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${effectiveRuntimeFlavor}` },
        { status: 400 }
      )
    }

    if (!supportsChannelOwnership(runtimeEngine, effectiveChannelOwnership)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${effectiveChannelOwnership}` },
        { status: 400 }
      )
    }

    if (!supportsRuntimeConfiguration(runtimeEngine, effectiveRuntimeFlavor, effectiveChannelOwnership)) {
      return NextResponse.json(
        {
          error:
            `${engineDefinition.label} does not support ${effectiveChannelOwnership} for ${effectiveRuntimeFlavor}`,
        },
        { status: 400 }
      )
    }

    if (!supportsDedicatedTransportMode(
      runtimeEngine,
      effectiveRuntimeFlavor,
      effectiveChannelOwnership,
      effectiveDedicatedTransportMode,
    )) {
      return NextResponse.json(
        {
          error:
            `${engineDefinition.label} does not support ${effectiveDedicatedTransportMode} transport for ${effectiveChannelOwnership}/${effectiveRuntimeFlavor}`,
        },
        { status: 400 }
      )
    }

    const deployReadiness = getEngineDeployReadiness({
      engine: runtimeEngine,
      runtimeFlavor: effectiveRuntimeFlavor,
      provider,
    })
    if (!deployReadiness.ready) {
      return NextResponse.json(
        {
          error:
            deployReadiness.error ??
            getRuntimeImageConfigurationError(runtimeEngine, effectiveRuntimeFlavor),
        },
        { status: 400 },
      )
    }

    if (effectiveDedicatedTransportMode === 'native_pulse' && !isDedicatedNativePulseAllowed(orgId)) {
      return NextResponse.json(
        { error: 'Dedicated native Pulse is not enabled for this organization' },
        { status: 403 }
      )
    }

    // Idempotency: return existing runtime if requestId already used
    const existing = await getRuntimeByRequestId(requestId, orgId)
    if (existing) {
      return NextResponse.json({
        runtimeId: existing.id,
        status: existing.status,
        deploymentUrl: existing.deploymentUrl,
        idempotent: true,
      })
    }

    // If agent already has a runtime, allow retry only if it failed
    if (agent.runtime_id) {
      const { data: existingRuntime } = await supabase
        .from('dedicated_runtimes')
        .select('id, status, display_name')
        .eq('id', agent.runtime_id)
        .eq('org_id', orgId)
        .single()

      if (existingRuntime && existingRuntime.status !== 'failed') {
        return NextResponse.json(
          { error: 'Agent already has a dedicated runtime', runtimeId: agent.runtime_id },
          { status: 409 }
        )
      }

      // Retry failed runtime — reprovision key and redeploy
      if (existingRuntime) {
        if (canUseLocalManagedRuntimeFallback()) {
          const localFallback = await activateLocalManagedRuntimeFallback({
            runtimeId: existingRuntime.id,
            orgId,
            agentId,
          })
          if (localFallback) {
            return NextResponse.json(localFallback)
          }
        }

        const { envVars } = await provisionRuntimeKey(existingRuntime.id, orgId, channelMode, {
          engine: runtimeEngine,
          runtimeFlavor: effectiveRuntimeFlavor,
          runtimeProtocol: runtimeBridge.runtimeProtocol,
          dedicatedTransportMode: effectiveDedicatedTransportMode,
          runtimeBootstrapConfig,
        })
        await updateRuntimeStatus(existingRuntime.id, orgId, 'deploying')

        const l2Result = await deployRuntimeViaL2({
          runtimeId: existingRuntime.id,
          orgId,
          provider,
          displayName: existingRuntime.display_name || `${agent.name}-runtime`,
          engine: runtimeEngine,
          runtimeFlavor: effectiveRuntimeFlavor,
          channelOwnership: effectiveChannelOwnership,
          dedicatedTransportMode: effectiveDedicatedTransportMode,
          runtimeProtocol: runtimeBridge.runtimeProtocol,
          envVars,
        })

        if (isL2DeployError(l2Result) || !l2Result) {
          if (isL2DeployError(l2Result)) {
            await updateRuntimeL2Status(
              existingRuntime.id,
              'launch_failed',
              `[${l2Result.code}] ${l2Result.error}`,
            )
          }
          await updateRuntimeStatus(existingRuntime.id, orgId, 'failed')
          return NextResponse.json(
            {
              error: isL2DeployError(l2Result)
                ? l2Result.error
                : 'Failed to deploy dedicated runtime',
            },
            { status: 502 }
          )
        }

        await markL2ManagedRuntimeConnected({
          runtimeId: existingRuntime.id,
          orgId,
          deploymentUrl: l2Result.deploymentUrl,
        })
        await updateAgentRuntime(agentId, orgId, existingRuntime.id)

        return NextResponse.json({
          runtimeId: existingRuntime.id,
          status: 'connected',
          deploymentUrl: l2Result.deploymentUrl,
        })
      }
    }

    const runtimeName = displayName || `${agent.name}-runtime`

    // Create new runtime record
    const runtimeResult = await createRuntime({
      orgId,
      displayName: runtimeName,
      provider,
      apiKeyHash: 'pending',
      runtimeTier: 'dedicated',
      engine: runtimeEngine,
      runtimeFlavor: effectiveRuntimeFlavor,
      channelOwnership: effectiveChannelOwnership,
      runtimeProtocol: runtimeBridge.runtimeProtocol,
      dedicatedTransportMode: effectiveDedicatedTransportMode,
      channelMode,
      runtimeBootstrapConfig,
      requestId,
    })

    if (!runtimeResult) {
      return NextResponse.json({ error: 'Failed to create runtime' }, { status: 500 })
    }

    const runtimeId = runtimeResult.id

    if (canUseLocalManagedRuntimeFallback()) {
      const localFallback = await activateLocalManagedRuntimeFallback({
        runtimeId,
        orgId,
        agentId,
      })
      if (localFallback) {
        return NextResponse.json(localFallback)
      }
    }

    // Provision API key + build env vars (shared helper)
    const { envVars } = await provisionRuntimeKey(runtimeId, orgId, channelMode, {
      engine: runtimeEngine,
      runtimeFlavor: effectiveRuntimeFlavor,
      runtimeProtocol: runtimeBridge.runtimeProtocol,
      dedicatedTransportMode: effectiveDedicatedTransportMode,
      runtimeBootstrapConfig,
    })

    // Deploy via L2 Gateway (shared helper)
    const l2Result = await deployRuntimeViaL2({
      runtimeId,
      orgId,
      provider,
      displayName: runtimeName,
      engine: runtimeEngine,
      runtimeFlavor: effectiveRuntimeFlavor,
      channelOwnership: effectiveChannelOwnership,
      dedicatedTransportMode: effectiveDedicatedTransportMode,
      runtimeProtocol: runtimeBridge.runtimeProtocol,
      envVars,
    })

    if (isL2DeployError(l2Result) || !l2Result) {
      // L2 failed or unavailable — clean up the runtime, don't leave a ghost
      if (isL2DeployError(l2Result)) {
        await updateRuntimeL2Status(
          runtimeId,
          'launch_failed',
          `[${l2Result.code}] ${l2Result.error}`,
        )
      }
      await revokeRuntime(runtimeId, orgId)
      return NextResponse.json(
        {
          error: isL2DeployError(l2Result)
            ? l2Result.error
            : 'Failed to deploy dedicated runtime. L2 Gateway unavailable or returned an error.',
        },
        { status: 502 }
      )
    }

    // L2 accepted and returned a live deployment URL — mark the managed runtime connected.
    await markL2ManagedRuntimeConnected({
      runtimeId,
      orgId,
      deploymentUrl: l2Result.deploymentUrl,
    })
    await updateAgentRuntime(agentId, orgId, runtimeId)
    return NextResponse.json({
      runtimeId,
      status: 'connected',
      deploymentUrl: l2Result.deploymentUrl,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/deploy-for-agent POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
