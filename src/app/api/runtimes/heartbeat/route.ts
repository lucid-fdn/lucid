import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../_auth'
import { claimRuntimeManagementCommands, updateRuntimeHeartbeat, fulfillDeployIntent } from '@/lib/db/mission-control'
import { heartbeatSchema, type nativeChannelStatusSchema } from '@/lib/mission-control/schemas'
import { ErrorService } from '@/lib/errors/error-service'
import { supabase } from '@/lib/db/client'
import { buildDeployEnvVars } from '../_deploy'
import type { z } from 'zod'
import type { AgentEngine, RuntimeProtocol } from '@/lib/engines/types'
import type {
  RuntimeAdapterIdentity,
  RuntimeAdapterProbeSummary,
  RuntimeCommandSpec,
  RuntimeEngineHomePolicy,
  RuntimeNativeCapability,
  RuntimeServiceDescriptor,
  RuntimeTranscriptParserStatus,
} from '@contracts/runtime-capability'
import { computeConfigVersion } from '@/lib/runtimes/config-version'
import { syncManagedRuntimeOnHeartbeat } from '@/lib/runtimes/controller'
import { resolveDedicatedRuntimeConfig } from '@/lib/runtimes/runtime-config'
import {
  RUNTIME_RATE_LIMIT_RETRY_AFTER_MS,
  createRuntimeHeartbeatLimiter,
} from '@/lib/runtimes/policy'

export const dynamic = 'force-dynamic'

const FEATURE_REDIS_INGEST = process.env.FEATURE_REDIS_INGEST === 'true'

// ─── Heartbeat Rate Limiting ─────────────────────────────────────────────────
// Prevents a misbehaving runtime from flooding the heartbeat endpoint.
// Normal cadence is 1 beat / 30s. Limit: 10 per minute per runtime.

const heartbeatLimiter = createRuntimeHeartbeatLimiter()

/**
 * C2a: Store native channel status and atomically claim pending governance actions.
 * Uses UPDATE ... RETURNING pattern via RPC-style query to prevent race conditions.
 */
async function handleNativeChannelState(
  runtimeId: string,
  nativeChannels?: z.infer<typeof nativeChannelStatusSchema>[]
): Promise<unknown[]> {
  // Store native channels if reported
  if (nativeChannels && nativeChannels.length > 0) {
    await supabase
      .from('dedicated_runtimes')
      .update({ native_channels: nativeChannels })
      .eq('id', runtimeId)
  }

  // Atomically read and clear pending actions via RPC (SELECT FOR UPDATE + clear)
  const { data: swapped } = await supabase.rpc('swap_runtime_pending_actions', {
    p_runtime_id: runtimeId,
  })

  // Fallback if RPC doesn't exist yet (graceful degradation)
  if (swapped !== undefined && swapped !== null) {
    return Array.isArray(swapped) ? swapped : []
  }

  // Legacy fallback: two-step (read then clear) — works until migration adds the RPC
  const { data: rt } = await supabase
    .from('dedicated_runtimes')
    .select('pending_actions')
    .eq('id', runtimeId)
    .single()

  const pendingActions = (rt?.pending_actions as unknown[]) || []

  if (pendingActions.length > 0) {
    await supabase
      .from('dedicated_runtimes')
      .update({ pending_actions: [] })
      .eq('id', runtimeId)
  }

  return pendingActions
}

// ─── Shared heartbeat processing ─────────────────────────────────────────────
// Extracted to avoid duplication between Redis and direct Postgres paths.

interface HeartbeatMetrics {
  engine?: AgentEngine
  runtimeProtocol?: RuntimeProtocol
  engineVersion?: string
  runtimeVersion?: string
  cpuPercent: number
  ramPercent: number
  diskPercent: number
  gpuPercent?: number
  pendingEvents: number
  deadLetters: number
  openclawVersion?: string
  agentCount: number
  uptimeSeconds: number
  status?: 'connected' | 'shutdown'
  systemInfo?: {
    cpuModel?: string
    cpuCores?: number
    ramTotalGb?: number
    diskTotalGb?: number
    platform?: string
    arch?: string
  } | null
  adapterIdentity?: RuntimeAdapterIdentity | null
  nativeCapabilities?: RuntimeNativeCapability[]
  runtimeServices?: RuntimeServiceDescriptor[]
  adapterProbe?: RuntimeAdapterProbeSummary | null
  transcriptParser?: RuntimeTranscriptParserStatus | null
  commandSpec?: RuntimeCommandSpec | null
  engineHomePolicy?: RuntimeEngineHomePolicy | null
}

async function processHeartbeat(
  runtimeId: string,
  orgId: string,
  generation: number,
  metrics: HeartbeatMetrics,
  configVersion: string,
  nativeChannels?: z.infer<typeof nativeChannelStatusSchema>[],
): Promise<NextResponse> {
  const result = await updateRuntimeHeartbeat(runtimeId, generation, metrics)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  // Fulfill deploy intent on first connect or while intent is still pending (retry)
  if (result.previousStatus !== 'connected' || result.intentPending) {
    try {
      await fulfillDeployIntent(runtimeId, orgId)
    } catch (e) {
      ErrorService.captureException(e, {
        severity: 'error',
        context: { endpoint: '/api/runtimes/heartbeat:fulfillIntent', runtimeId },
        tags: { layer: 'api', route: 'runtimes' },
      })
    }
  }

  // C2a: Store native channel status + return pending governance actions
  const pendingActions = await handleNativeChannelState(runtimeId, nativeChannels)
  const managementCommands = await claimRuntimeManagementCommands(runtimeId)
  return NextResponse.json({ status: 'ok', pendingActions, managementCommands, configVersion })
}

// POST /api/runtimes/heartbeat — Worker phone-home (API key auth)
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit before parsing body (don't waste work on floods)
    if (!heartbeatLimiter.check(runtime.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterMs: RUNTIME_RATE_LIMIT_RETRY_AFTER_MS },
        { status: 429 },
      )
    }

    const body = await request.json()
    const parsed = heartbeatSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Verify the heartbeat is for the authenticated runtime
    if (parsed.data.runtimeId !== runtime.id) {
      return NextResponse.json({ error: 'Runtime ID mismatch' }, { status: 403 })
    }

    const metrics: HeartbeatMetrics = {
      engine: parsed.data.engine as AgentEngine | undefined,
      runtimeProtocol: parsed.data.runtimeProtocol as RuntimeProtocol | undefined,
      engineVersion: parsed.data.engineVersion,
      runtimeVersion: parsed.data.runtimeVersion,
      cpuPercent: parsed.data.cpuPercent,
      ramPercent: parsed.data.ramPercent,
      diskPercent: parsed.data.diskPercent,
      gpuPercent: parsed.data.gpuPercent,
      pendingEvents: parsed.data.pendingEvents,
      deadLetters: parsed.data.deadLetters,
      openclawVersion: parsed.data.openclawVersion,
      agentCount: parsed.data.agentCount,
      uptimeSeconds: parsed.data.uptimeSeconds,
      status: parsed.data.status,
      systemInfo: parsed.data.systemInfo,
      adapterIdentity: parsed.data.adapterIdentity,
      nativeCapabilities: parsed.data.nativeCapabilities,
      runtimeServices: parsed.data.runtimeServices,
      adapterProbe: parsed.data.adapterProbe,
      transcriptParser: parsed.data.transcriptParser,
      commandSpec: parsed.data.commandSpec,
      engineHomePolicy: parsed.data.engineHomePolicy,
    }

    const { data: rt } = await supabase
      .from('dedicated_runtimes')
      .select('channel_mode, channel_ownership, dedicated_transport_mode, engine, runtime_flavor, runtime_protocol, engine_metadata, runtime_bootstrap_config, managed_by_lucid, auto_update_policy, current_image_ref, target_image_ref, last_successful_image_ref')
      .eq('id', runtime.id)
      .single()

    const resolved = resolveDedicatedRuntimeConfig({
      orgId: runtime.orgId,
      stored: {
        channelMode: (rt?.channel_mode as 'relay' | 'native' | null | undefined) ?? null,
        channelOwnership:
          (rt?.channel_ownership as 'lucid_relay' | 'runtime_native' | null | undefined) ?? null,
        dedicatedTransportMode:
          (rt?.dedicated_transport_mode as 'relay' | 'native_pulse' | null | undefined) ?? null,
        engine: (rt?.engine as AgentEngine | null | undefined) ?? null,
        runtimeFlavor:
          (rt?.runtime_flavor as 'c1_managed' | 'c2a_autonomous' | 'shared' | null | undefined) ?? null,
        runtimeProtocol:
          (rt?.runtime_protocol as 'lucid-runtime-v1' | 'lucid-runtime-v2' | null | undefined) ?? null,
        engineMetadata: (rt?.engine_metadata as Record<string, unknown> | null | undefined) ?? null,
        runtimeBootstrapConfig:
          (rt?.runtime_bootstrap_config as import('@/lib/runtimes/bootstrap').RuntimeBootstrapConfig | null | undefined) ??
          null,
      },
      fallback: {
        dedicatedTransportMode: runtime.dedicatedTransportMode ?? null,
        engine: runtime.engine ?? metrics.engine ?? 'openclaw',
        runtimeFlavor: runtime.runtimeFlavor ?? 'c1_managed',
        runtimeProtocol: runtime.runtimeProtocol ?? metrics.runtimeProtocol ?? 'lucid-runtime-v2',
      },
    })

    const envVars = buildDeployEnvVars(runtime.id, resolved.channelMode, {
      engine: resolved.engine,
      runtimeFlavor: resolved.runtimeFlavor,
      runtimeProtocol: resolved.runtimeProtocol,
      dedicatedTransportMode: resolved.dedicatedTransportMode,
      runtimeBootstrapConfig: resolved.runtimeBootstrapConfig,
    })
    const configVersion = computeConfigVersion(envVars)
    const shouldRunManagedRuntimeController =
      rt?.managed_by_lucid === true

    // Redis ingest path: write live metrics to Redis Hash (drain worker persists to Postgres)
    if (FEATURE_REDIS_INGEST) {
      try {
        const { setLiveMetrics } = await import('@/lib/redis/streams')
        const success = await setLiveMetrics(runtime.id, {
          cpuPercent: parsed.data.cpuPercent,
          ramPercent: parsed.data.ramPercent,
          diskPercent: parsed.data.diskPercent,
          gpuPercent: parsed.data.gpuPercent ?? null,
          lastSeenAt: new Date().toISOString(),
          generation: parsed.data.generation,
        })

        if (success) {
          const response = await processHeartbeat(
            runtime.id, runtime.orgId, parsed.data.generation,
            metrics, configVersion, parsed.data.nativeChannels,
          )
          if (shouldRunManagedRuntimeController) {
            try {
              await syncManagedRuntimeOnHeartbeat(runtime.id, runtime.orgId, parsed.data.status)
            } catch (controllerError) {
              ErrorService.captureException(controllerError, {
                severity: 'warning',
                context: { endpoint: '/api/runtimes/heartbeat:managedRuntimeController', runtimeId: runtime.id },
                tags: { layer: 'api', route: 'runtimes' },
              })
            }
          }
          return response
        }
        // Redis failed — fall through to direct Postgres path
      } catch {
        // Redis unavailable — fall through to direct Postgres path
      }
    }

    // Direct Postgres path (default, or Redis fallback)
    const response = await processHeartbeat(
      runtime.id, runtime.orgId, parsed.data.generation,
      metrics, configVersion, parsed.data.nativeChannels,
    )
    if (shouldRunManagedRuntimeController) {
      try {
        await syncManagedRuntimeOnHeartbeat(runtime.id, runtime.orgId, parsed.data.status)
      } catch (controllerError) {
        ErrorService.captureException(controllerError, {
          severity: 'warning',
          context: { endpoint: '/api/runtimes/heartbeat:managedRuntimeController', runtimeId: runtime.id },
          tags: { layer: 'api', route: 'runtimes' },
        })
      }
    }
    return response
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/heartbeat' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
