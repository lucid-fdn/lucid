/**
 * GET /api/runtimes/config
 *
 * Config pull endpoint for dedicated runtimes.
 *
 * Called by the worker on startup (config-bootstrap.ts) and optionally on
 * each heartbeat when config_version drifts. Returns the full env var set
 * built from the current control-plane process.env — so secrets rotated
 * after initial deploy are picked up on the next restart without re-provision.
 *
 * Auth: runtime API key (same as heartbeat/events).
 * Rate limit: 10 req/min per runtime (generous for startup retries).
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../_auth'
import { buildDeployEnvVars } from '../_deploy'
import { ErrorService } from '@/lib/errors/error-service'
import { supabase } from '@/lib/db/client'
import { getEngineDefinition } from '@/lib/engines/registry'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'
import { resolveDedicatedRuntimeConfig } from '@/lib/runtimes/runtime-config'
import { computeConfigVersion } from '@/lib/runtimes/config-version'
import {
  RUNTIME_RATE_LIMIT_RETRY_AFTER_MS,
  createRuntimeConfigLimiter,
} from '@/lib/runtimes/policy'

export const dynamic = 'force-dynamic'

const configLimiter = createRuntimeConfigLimiter()

export async function GET(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (runtime.status === 'revoked') {
      return NextResponse.json({ error: 'Runtime revoked' }, { status: 410 })
    }

    if (!configLimiter.check(runtime.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterMs: RUNTIME_RATE_LIMIT_RETRY_AFTER_MS },
        { status: 429 },
      )
    }

    // Fetch channel_mode to correctly set FEATURE_REST_MESSAGE_RELAY / FEATURE_NATIVE_CHANNELS
    const { data: rt } = await supabase
      .from('dedicated_runtimes')
      .select('channel_mode, channel_ownership, dedicated_transport_mode, engine, runtime_flavor, runtime_protocol, engine_metadata, runtime_bootstrap_config')
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
        engine: (rt?.engine as 'openclaw' | 'hermes' | null | undefined) ?? null,
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
        channelMode: null,
        channelOwnership: null,
        dedicatedTransportMode: runtime.dedicatedTransportMode ?? null,
        engine: runtime.engine ?? 'openclaw',
        runtimeFlavor: runtime.runtimeFlavor ?? 'c1_managed',
        runtimeProtocol: runtime.runtimeProtocol ?? 'lucid-runtime-v1',
      },
    })

    const engine = resolved.engine
    const engineDefinition = getEngineDefinition(engine)

    if (!supportsRuntimeFlavor(engine, resolved.runtimeFlavor)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${resolved.runtimeFlavor}` },
        { status: 409 },
      )
    }

    if (!supportsRuntimeConfiguration(engine, resolved.runtimeFlavor, resolved.channelOwnership)) {
      return NextResponse.json(
        {
          error: `${engineDefinition.label} does not support ${resolved.channelOwnership} for ${resolved.runtimeFlavor}`,
        },
        { status: 409 },
      )
    }

    const envVars = buildDeployEnvVars(runtime.id, resolved.channelMode, {
      engine: resolved.engine,
      runtimeFlavor: resolved.runtimeFlavor,
      runtimeProtocol: resolved.runtimeProtocol,
      dedicatedTransportMode: resolved.dedicatedTransportMode,
      runtimeBootstrapConfig: resolved.runtimeBootstrapConfig,
    })
    const configVersion = computeConfigVersion(envVars)

    return NextResponse.json({ envVars, configVersion })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/config GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
