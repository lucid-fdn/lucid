/**
 * Shared L2 Gateway deploy helper.
 *
 * Extracted from POST /api/runtimes to be reused by deploy-for-agent.
 * Handles: env var building, L2 Gateway call, deployment tracking.
 */

import 'server-only'
import { resolvePassportOwner } from '@/lib/ai/passports'
import { isL2Available, getL2BaseUrl } from '@/lib/deployment-mode'
import { supabase } from '@/lib/db/client'
import {
  updateRuntimeApiKeyHash,
  updateRuntimeEnvSnapshot,
  updateRuntimeImageTracking,
  updateRuntimeL2Deployment,
} from '@/lib/db/mission-control'
import { generateApiKey, hashApiKey } from './_auth'
import { resolveRuntimeLaunchImage } from '@/lib/engines/image-resolution'
import type { AgentEngine, ChannelOwnership, RuntimeFlavor, RuntimeProtocol } from '@/lib/engines/types'
import type { RuntimeBootstrapConfig } from '@/lib/runtimes/bootstrap'
import type { RuntimeMigrationConfig } from '@/lib/runtimes/migration'
import type { DedicatedTransportMode } from '@lucid/runtime-compat'
import { resolveDedicatedTransportMode } from '@/lib/runtimes/dedicated-transport'
import { deriveDedicatedRuntimeExecutionContract } from '@/lib/runtimes/execution-contract'
import { buildRuntimeEnvSnapshot } from '@/lib/runtimes/env-snapshot'
import { getLucidProviderConfig } from '@/lib/ai/lucid-provider-config'
import {
  serializeRuntimeEnvSpec,
  trimRuntimeEnvValue,
  type RuntimeEnvSpec,
} from '@/lib/runtimes/env-spec'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'
import { getPassportOwnerFallback } from '@/lib/lucid-l2/env'

export interface L2DeployResult {
  deploymentId: string
  deploymentUrl: string
  passportId: string | null
  passportOwner: string | null
  ownerMode: 'user_wallet' | 'workspace_custody' | 'platform_default' | null
  claimStatus: 'claimed' | 'claimable' | null
}

export interface L2DeployError {
  error: string
  code:
    | 'l2_disabled'
    | 'l2_missing_base_url'
    | 'launch_failed'
    | 'invalid_response'
    | 'unreachable'
  status?: number
}

export type L2DeployResponse = L2DeployResult | L2DeployError | null

export interface L2RuntimeLaunchResult {
  result: L2DeployResult
  image: string
}

export function isL2DeployError(result: unknown): result is L2DeployError {
  return !!result && typeof result === 'object' && 'error' in result
}

/**
 * Destroy a runtime deployment via L2 Gateway.
 *
 * Calls L2 to tear down the actual infrastructure (Railway/Akash/etc.)
 * so it stops running and billing. On success, clears `l2_deployment_id`
 * on the runtime record — the reconciler uses this as a completion marker
 * (revoked + non-null l2_deployment_id = teardown still pending).
 *
 * Non-fatal: returns false on failure so the caller can proceed with
 * DB revocation regardless. The reconciler will retry on next sweep.
 */
export async function destroyRuntimeViaL2(
  l2DeploymentId: string,
  runtimeId?: string,
  l2PassportId?: string | null,
): Promise<boolean> {
  if (!l2DeploymentId && !l2PassportId) return false

  const l2Base = getL2BaseUrl()
  if (!l2Base) return false

  // Prefer passport-based terminate route when available
  const url = l2PassportId
    ? `${l2Base}/v1/agents/${encodeURIComponent(l2PassportId)}/terminate`
    : `${l2Base}/v1/agents/deployments/${encodeURIComponent(l2DeploymentId)}`
  const method = l2PassportId ? 'POST' : 'DELETE'

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...getL2AdminAuthHeaders(),
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`[_deploy] L2 destroy failed (${res.status}): ${errText}`)
      return false
    }

    // Clear l2_deployment_id to mark teardown complete.
    // The reconciler uses (revoked + l2_deployment_id IS NOT NULL) to find
    // runtimes that still need infra teardown.
    if (runtimeId) {
      await supabase
        .from('dedicated_runtimes')
        .update({
          l2_deployment_id: null,
          deployment_url: null,
          teardown_attempts: 0,
          teardown_last_attempt_at: null,
        })
        .eq('id', runtimeId)
    }

    return true
  } catch (err) {
    console.error(
      '[_deploy] L2 Gateway destroy unreachable:',
      err instanceof Error ? err.message : err
    )
    return false
  }
}

/**
 * Generate an API key for a runtime and store its hash in the DB.
 * Returns the plaintext key (only shown once) and env vars for the worker.
 */
/**
 * Build the environment variable set for a dedicated runtime.
 *
 * Extracted so both `provisionRuntimeKey` (deploy-time) and
 * `GET /api/runtimes/config` (pull-on-boot) can produce the same
 * canonical env set from the current control-plane process.env.
 *
 * Does NOT include LUCID_RUNTIME_KEY — that is a one-time secret
 * set at provision time and never re-issued over the config API.
 */
export function buildDeployEnvVars(
  runtimeId: string,
  channelMode?: string | null,
  metadata?: {
    engine?: AgentEngine
    runtimeFlavor?: Exclude<RuntimeFlavor, 'shared'>
    runtimeProtocol?: RuntimeProtocol
    dedicatedTransportMode?: DedicatedTransportMode | null
    runtimeBootstrapConfig?: RuntimeBootstrapConfig | null
  },
): Record<string, string> {
  const lucidProviderConfig = getLucidProviderConfig()
  const isNative = channelMode === 'native'
  const engine = metadata?.engine ?? 'openclaw'
  const runtimeFlavor = metadata?.runtimeFlavor ?? 'c1_managed'
  const runtimeProtocol = metadata?.runtimeProtocol ?? 'lucid-runtime-v1'
  const dedicatedTransportMode = resolveDedicatedTransportMode({
    dedicatedTransportMode: metadata?.dedicatedTransportMode ?? null,
    channelMode: (channelMode as 'relay' | 'native' | null | undefined) ?? null,
    channelOwnership: isNative ? 'runtime_native' : 'lucid_relay',
  })
  const execution = deriveDedicatedRuntimeExecutionContract({
    dedicatedTransportMode,
    channelMode: (channelMode as 'relay' | 'native' | null | undefined) ?? null,
    channelOwnership: isNative ? 'runtime_native' : 'lucid_relay',
  })
  const migration =
    (metadata?.runtimeBootstrapConfig?.migration as RuntimeMigrationConfig | null | undefined) ??
    null

  const envSpec: RuntimeEnvSpec = {
    // ── Runtime identity + control plane ──────────────────────────────────────
    LUCID_RUNTIME_ID: runtimeId,
    LUCID_CONTROL_PLANE_URL: trimRuntimeEnvValue(process.env.NEXT_PUBLIC_APP_URL) || '',
    LUCID_ENGINE: engine,
    LUCID_RUNTIME_FLAVOR: runtimeFlavor,
    LUCID_RUNTIME_PROTOCOL: runtimeProtocol,
    LUCID_DEDICATED_TRANSPORT_MODE: execution.transportMode,
    WORKER_MODE: execution.workerMode,
    ...(engine === 'hermes' && {
      LUCID_BRIDGE_MODE: runtimeFlavor === 'c1_managed' ? 'full' : 'observe',
    }),

    // ── Database ──────────────────────────────────────────────────────────────
    SUPABASE_URL: trimRuntimeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) || '',
    SUPABASE_SERVICE_ROLE_KEY: trimRuntimeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) || '',

    // ── AI inference ──────────────────────────────────────────────────────────
    // Prefer direct TrustGate URL — Cloudflare WAF may block Railway IPs on
    // the public LUCID_API_BASE_URL domain.
    LUCID_API_BASE_URL:
      trimRuntimeEnvValue(lucidProviderConfig.baseUrl) ||
      '',
    LUCID_API_KEY:
      trimRuntimeEnvValue(lucidProviderConfig.apiKey) ||
      '',
    TRUSTGATE_BASE_URL:
      trimRuntimeEnvValue(process.env.TRUSTGATE_BASE_URL) ||
      trimRuntimeEnvValue(lucidProviderConfig.baseUrl),
    TRUSTGATE_API_KEY:
      trimRuntimeEnvValue(process.env.TRUSTGATE_API_KEY) ||
      trimRuntimeEnvValue(lucidProviderConfig.apiKey),
    AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED:
      trimRuntimeEnvValue(process.env.AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED) || false,
    AI_TEXT_DIRECT_OPENAI_FALLBACK_ENABLED:
      trimRuntimeEnvValue(process.env.AI_TEXT_DIRECT_OPENAI_FALLBACK_ENABLED) || false,
    AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED:
      trimRuntimeEnvValue(process.env.AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED) || false,

    // ── Encryption ────────────────────────────────────────────────────────────
    // MESSAGE_ENCRYPTION_MASTER_KEY: HKDF root key for message + memory encryption
    // ENCRYPTION_KEY: 32-byte hex key for channel credential decryption (needed
    //   in direct/native mode where the runtime decrypts secrets itself; in C1
    //   relay mode the control plane handles this, but include for safety)
    MESSAGE_ENCRYPTION_MASTER_KEY:
      trimRuntimeEnvValue(process.env.MESSAGE_ENCRYPTION_MASTER_KEY) || '',
    ENCRYPTION_KEY: trimRuntimeEnvValue(process.env.ENCRYPTION_KEY),

    // ── Worker trigger auth ───────────────────────────────────────────────────
    WORKER_TRIGGER_SECRET: trimRuntimeEnvValue(process.env.WORKER_TRIGGER_SECRET) || '',

    // ── Model routing ─────────────────────────────────────────────────────────
    // Always forward model names alongside the routing flag so the runtime
    // uses the same fast/strong models as the control plane.
    FEATURE_MODEL_ROUTING: trimRuntimeEnvValue(process.env.FEATURE_MODEL_ROUTING) || false,
    FAST_MODEL: trimRuntimeEnvValue(process.env.FAST_MODEL) || 'openai/gpt-4.1-mini',
    STRONG_MODEL: trimRuntimeEnvValue(process.env.STRONG_MODEL) || 'openai/gpt-4.1',

    // ── Agent runtime feature flags ───────────────────────────────────────────
    FEATURE_AGENT_RUNTIME: 'true',
    FEATURE_BROADCAST_WAKE: true,
    FEATURE_CONVERSATION_SUMMARY:
      trimRuntimeEnvValue(process.env.FEATURE_CONVERSATION_SUMMARY) || false,
    FEATURE_TOOL_CACHE: trimRuntimeEnvValue(process.env.FEATURE_TOOL_CACHE) || true,

    // ── Channel mode ──────────────────────────────────────────────────────────
    // C1 relay (default): control plane owns channel delivery + credential decryption
    // C2a native: runtime owns bot tokens + delivers directly (needs ENCRYPTION_KEY)
    FEATURE_REST_MESSAGE_RELAY: execution.featureRestMessageRelay,
    FEATURE_NATIVE_CHANNELS: execution.featureNativeChannels,

    // ── Hosted Telegram (@LucidBot) ───────────────────────────────────────────
    // Required when an agent uses the shared hosted Telegram bot rather than
    // its own BYOB token. Needed in native/direct mode for outbound delivery.
    TELEGRAM_HOSTED_BOT_TOKEN: trimRuntimeEnvValue(process.env.TELEGRAM_HOSTED_BOT_TOKEN),
    TELEGRAM_HOSTED_WEBHOOK_SECRET: trimRuntimeEnvValue(
      process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET,
    ),

    // ── Nango OAuth integrations ──────────────────────────────────────────────
    // Required for any agent using OAuth-backed integration tools
    // (Slack, Google, Notion, HubSpot, Linear, Asana, etc.)
    NANGO_SECRET_KEY: trimRuntimeEnvValue(process.env.NANGO_SECRET_KEY),
    NANGO_HOST: trimRuntimeEnvValue(process.env.NANGO_HOST) || 'https://api.nango.dev',

    // ── Web tools ─────────────────────────────────────────────────────────────
    // BRAVE_API_KEY gates web_search on runtime-native tool layers.
    BRAVE_API_KEY: trimRuntimeEnvValue(process.env.BRAVE_API_KEY),

    // ── Browser QA ───────────────────────────────────────────────────────────
    // Engine-neutral Agent Ops browser evidence endpoint. The endpoint may be
    // OpenClaw-compatible today, but runtimes consume the generic BROWSER_QA_*
    // contract so Hermes/future engines can provide the same capability without
    // changing Agent Ops workflow definitions.
    BROWSER_QA_PROVIDER: trimRuntimeEnvValue(process.env.BROWSER_QA_PROVIDER),
    BROWSER_QA_CONTROL_URL: trimRuntimeEnvValue(process.env.BROWSER_QA_CONTROL_URL),
    BROWSER_QA_CONTROL_TOKEN: trimRuntimeEnvValue(process.env.BROWSER_QA_CONTROL_TOKEN),
    BROWSER_QA_CONTROL_PASSWORD: trimRuntimeEnvValue(process.env.BROWSER_QA_CONTROL_PASSWORD),
    BROWSER_QA_PROFILE: trimRuntimeEnvValue(process.env.BROWSER_QA_PROFILE),
    BROWSER_QA_TIMEOUT_MS: trimRuntimeEnvValue(process.env.BROWSER_QA_TIMEOUT_MS),
    BROWSER_QA_MAX_CONCURRENCY: trimRuntimeEnvValue(process.env.BROWSER_QA_MAX_CONCURRENCY),
    BROWSER_QA_SESSION_TTL_SECONDS: trimRuntimeEnvValue(process.env.BROWSER_QA_SESSION_TTL_SECONDS),
    BROWSER_QA_MAX_SESSIONS_PER_RUN: trimRuntimeEnvValue(process.env.BROWSER_QA_MAX_SESSIONS_PER_RUN),
    BROWSER_QA_MAX_SCREENSHOTS_PER_RUN: trimRuntimeEnvValue(process.env.BROWSER_QA_MAX_SCREENSHOTS_PER_RUN),
    BROWSER_QA_GATEWAY_TOKEN: trimRuntimeEnvValue(process.env.BROWSER_QA_GATEWAY_TOKEN),
    BROWSER_QA_HEADLESS: trimRuntimeEnvValue(process.env.BROWSER_QA_HEADLESS),
    BROWSER_QA_ALLOW_PRIVATE_NETWORK: trimRuntimeEnvValue(process.env.BROWSER_QA_ALLOW_PRIVATE_NETWORK),
    BROWSER_QA_MAX_SCREENSHOT_BYTES: trimRuntimeEnvValue(process.env.BROWSER_QA_MAX_SCREENSHOT_BYTES),
    BROWSER_QA_ARTIFACT_STORE: trimRuntimeEnvValue(process.env.BROWSER_QA_ARTIFACT_STORE),
    BROWSER_QA_ARTIFACT_BUCKET: trimRuntimeEnvValue(process.env.BROWSER_QA_ARTIFACT_BUCKET),
    BROWSER_QA_ARTIFACT_DIR: trimRuntimeEnvValue(process.env.BROWSER_QA_ARTIFACT_DIR),
    BROWSER_QA_ARTIFACT_RETENTION_DAYS: trimRuntimeEnvValue(process.env.BROWSER_QA_ARTIFACT_RETENTION_DAYS),
    BROWSER_QA_PUBLIC_BASE_URL: trimRuntimeEnvValue(process.env.BROWSER_QA_PUBLIC_BASE_URL),
    STEEL_BROWSER_URL: trimRuntimeEnvValue(process.env.STEEL_BROWSER_URL),
    STEEL_API_KEY: trimRuntimeEnvValue(process.env.STEEL_API_KEY),
    BROWSERLESS_WS_URL: trimRuntimeEnvValue(process.env.BROWSERLESS_WS_URL),
    BROWSERLESS_TOKEN: trimRuntimeEnvValue(process.env.BROWSERLESS_TOKEN),
    STAGEHAND_API_KEY: trimRuntimeEnvValue(process.env.STAGEHAND_API_KEY),

    // ── Web3 / Solana tools ───────────────────────────────────────────────────
    MORALIS_API_KEY: trimRuntimeEnvValue(process.env.MORALIS_API_KEY),
    HELIUS_API_KEY: trimRuntimeEnvValue(process.env.HELIUS_API_KEY),
    POLYGON_RPC_URL: trimRuntimeEnvValue(process.env.POLYGON_RPC_URL),
    JUPITER_API_KEY: trimRuntimeEnvValue(process.env.JUPITER_API_KEY),

    // ── L2 Receipt pipeline ───────────────────────────────────────────────────
    RECEIPT_SIGNER_KEY: trimRuntimeEnvValue(process.env.RECEIPT_SIGNER_KEY),
    LUCID_PLATFORM_WALLET: trimRuntimeEnvValue(getPassportOwnerFallback() ?? undefined),

    // ── Observability ─────────────────────────────────────────────────────────
    SENTRY_DSN: trimRuntimeEnvValue(process.env.SENTRY_DSN),
    OTEL_ENABLED: trimRuntimeEnvValue(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) ? true : undefined,
    OTEL_EXPORTER_OTLP_ENDPOINT: trimRuntimeEnvValue(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    OTEL_SERVICE_NAME: trimRuntimeEnvValue(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
      ? `lucid-runtime-${runtimeId.slice(0, 8)}`
      : undefined,

    // ── Redis / Pulse ─────────────────────────────────────────────────────────
    // Relay runtimes claim directly from the control plane DB and should not
    // inherit the shared Pulse queue flags.
    REDIS_URL: execution.featurePulse ? trimRuntimeEnvValue(process.env.REDIS_URL) : undefined,
    FEATURE_PULSE: execution.featurePulse,
    UPSTASH_REDIS_REST_URL: execution.featurePulse
      ? trimRuntimeEnvValue(process.env.UPSTASH_REDIS_REST_URL)
      : undefined,
    UPSTASH_REDIS_REST_TOKEN: execution.featurePulse
      ? trimRuntimeEnvValue(process.env.UPSTASH_REDIS_REST_TOKEN) || ''
      : undefined,
  }

  if (engine === 'hermes' && migration?.source === 'openclaw') {
    const config = migration.hermesOpenClaw ?? {}
    envSpec.HERMES_MIGRATE_OPENCLAW = true
    envSpec.HERMES_MIGRATE_PRESET = config.preset ?? 'user-data'
    envSpec.HERMES_MIGRATE_DRY_RUN = config.dryRun ?? false
    envSpec.HERMES_MIGRATE_OVERWRITE = config.overwrite ?? false
    if (config.sourcePath) envSpec.HERMES_MIGRATE_SOURCE = config.sourcePath
    if (config.workspaceTarget) envSpec.HERMES_MIGRATE_WORKSPACE_TARGET = config.workspaceTarget
    if (config.skillConflict) envSpec.HERMES_MIGRATE_SKILL_CONFLICT = config.skillConflict
  }

  return serializeRuntimeEnvSpec(envSpec)
}

export async function provisionRuntimeKey(
  runtimeId: string,
  orgId: string,
  channelMode?: string | null,
  metadata?: {
    engine?: AgentEngine
    runtimeFlavor?: Exclude<RuntimeFlavor, 'shared'>
    runtimeProtocol?: RuntimeProtocol
    dedicatedTransportMode?: DedicatedTransportMode | null
    runtimeBootstrapConfig?: RuntimeBootstrapConfig | null
  },
): Promise<{ apiKey: string; envVars: Record<string, string> }> {
  const apiKey = generateApiKey(runtimeId)
  const keyHash = hashApiKey(apiKey)
  await updateRuntimeApiKeyHash(runtimeId, orgId, keyHash)

  const envVars: Record<string, string> = {
    // LUCID_RUNTIME_KEY is a one-time secret — included only at provision time.
    LUCID_RUNTIME_KEY: apiKey,
    ...buildDeployEnvVars(runtimeId, channelMode, metadata),
  }

  return { apiKey, envVars }
}

/**
 * Deploy a runtime via L2 Gateway.
 *
 * Returns deployment info on success, null if L2 unavailable or failed.
 * Updates the runtime record with L2 deployment info on success.
 */
export async function deployRuntimeViaL2(params: {
  runtimeId: string
  orgId: string
  provider: string
  displayName: string
  engine?: AgentEngine
  runtimeFlavor?: Exclude<RuntimeFlavor, 'shared'>
  channelOwnership?: ChannelOwnership | null
  dedicatedTransportMode?: DedicatedTransportMode | null
  runtimeProtocol?: RuntimeProtocol
  envVars: Record<string, string>
}): Promise<L2DeployResponse> {
  const launch = await launchRuntimeViaL2(params)
  if (!launch || isL2DeployError(launch)) return launch

  const { result, image } = launch

  // Persist deployment info (including passport_id for status/logs/terminate)
  await updateRuntimeL2Deployment(
    params.runtimeId,
    params.orgId,
    result.deploymentId,
    result.deploymentUrl || null,
    result.passportId,
    {
      passportOwner: result.passportOwner,
      ownerMode: result.ownerMode,
      claimStatus: result.claimStatus,
    },
  )
  await updateRuntimeEnvSnapshot(
    params.runtimeId,
    params.orgId,
    buildRuntimeEnvSnapshot(params.envVars),
  )
  await updateRuntimeImageTracking(params.runtimeId, params.orgId, {
    currentImageRef: image,
    targetImageRef: image,
  })

  return result
}

export async function launchRuntimeViaL2(params: {
  runtimeId: string
  orgId: string
  provider: string
  displayName: string
  engine?: AgentEngine
  runtimeFlavor?: Exclude<RuntimeFlavor, 'shared'>
  channelOwnership?: ChannelOwnership | null
  dedicatedTransportMode?: DedicatedTransportMode | null
  runtimeProtocol?: RuntimeProtocol
  imageOverride?: string | null
  envVars: Record<string, string>
}): Promise<L2RuntimeLaunchResult | L2DeployError | null> {
  if (params.provider === 'manual') return null
  if (!isL2Available()) {
    return {
      error: 'L2 Gateway is disabled for this environment.',
      code: 'l2_disabled',
    }
  }

  const l2Base = getL2BaseUrl()
  if (!l2Base) {
    return {
      error: 'L2 Gateway base URL is not configured.',
      code: 'l2_missing_base_url',
    }
  }

  const ownerAddress = await resolvePassportOwner(params.orgId)
  const ownerMode = ownerAddress ? 'workspace_custody' : 'platform_default'

  try {
    const engine = params.engine ?? 'openclaw'
    const runtimeFlavor = params.runtimeFlavor ?? 'c1_managed'
    const image = resolveRuntimeLaunchImage(engine, runtimeFlavor, params.imageOverride)

    const l2Res = await fetch(`${l2Base}/v1/agents/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getL2AdminAuthHeaders(),
      },
      body: JSON.stringify({
        mode: 'image',
        image,
        target: params.provider,
        ...(ownerAddress ? { owner: ownerAddress } : {}),
        owner_mode: ownerMode,
        name: params.displayName,
        env_vars: params.envVars,
        metadata: {
          runtime_id: params.runtimeId,
          engine,
          runtime_flavor: runtimeFlavor,
          channel_ownership: params.channelOwnership ?? null,
          dedicated_transport_mode: params.dedicatedTransportMode ?? null,
          runtime_protocol: params.runtimeProtocol ?? 'lucid-runtime-v1',
          owner_resolution: ownerAddress ? 'workspace_wallet' : 'l2_default',
          owner_mode: ownerMode,
        },
        ...(process.env.GHCR_USERNAME && process.env.GHCR_TOKEN && {
          registry_auth: {
            username: process.env.GHCR_USERNAME,
            password: process.env.GHCR_TOKEN,
          },
        }),
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!l2Res.ok) {
      const errText = await l2Res.text().catch(() => '')
      console.error(`[_deploy] L2 launch failed (${l2Res.status}): ${errText}`)
      return {
        error: errText.trim() || `L2 launch failed with status ${l2Res.status}.`,
        code: 'launch_failed',
        status: l2Res.status,
      }
    }

    const l2Data = (await l2Res.json()) as {
      deployment_id?: string
      deployment_url?: string
      passport_id?: string
      passport_owner?: string
      owner_mode?: 'user_wallet' | 'workspace_custody' | 'platform_default'
      claim_status?: 'claimed' | 'claimable'
    }

    if (!l2Data.deployment_id) {
      return {
        error: 'L2 launch succeeded but did not return a deployment_id.',
        code: 'invalid_response',
      }
    }

    const responseOwnerMode = l2Data.owner_mode || ownerMode
    const result: L2DeployResult = {
      deploymentId: l2Data.deployment_id,
      deploymentUrl: l2Data.deployment_url || '',
      passportId: l2Data.passport_id || null,
      passportOwner: l2Data.passport_owner || ownerAddress || null,
      ownerMode: responseOwnerMode,
      claimStatus: l2Data.claim_status || (responseOwnerMode === 'user_wallet' ? 'claimed' : 'claimable'),
    }

    return { result, image }
  } catch (err) {
    console.error('[_deploy] L2 Gateway unreachable:', err instanceof Error ? err.message : err)
    return {
      error:
        err instanceof Error
          ? `L2 Gateway unreachable: ${err.message}`
          : 'L2 Gateway unreachable.',
      code: 'unreachable',
    }
  }
}
