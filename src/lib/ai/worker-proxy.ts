import 'server-only'

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'
import { buildPluginRuntimePayloads } from '@/lib/plugins/host-services'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'
import { getWorkerUrl } from '@/lib/worker/config'

// In dev, bypass Next.js patched fetch to avoid ConnectTimeoutError
// in long-running Turbopack processes on Windows
const nativeFetch =
  process.env.NODE_ENV === 'development'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('undici').fetch as typeof globalThis.fetch)
    : globalThis.fetch

/**
 * Worker proxy for agent-mode streaming.
 *
 * Routes to the agent's dedicated runtime when available, otherwise
 * falls back to the shared worker (WORKER_URL).
 *
 * Sends a request to the worker's /stream endpoint and pipes the
 * AI SDK Data Stream Protocol response back to the browser.
 * Used by both /api/assistants/[id]/chat and /api/ai/chat (when assistantId is set).
 */

interface AssistantConfig {
  id: string
  name: string
  engine?: 'openclaw' | 'hermes' | null
  runtime_flavor?: 'shared' | 'c1_managed' | 'c2a_autonomous' | null
  system_prompt: string | null
  lucid_model: string | null
  temperature: number | null
  max_tokens: number | null
  memory_enabled: boolean
  memory_window_size: number | null
  org_id: string
  policy_config: unknown
  updated_at: string
  wallet_enabled?: boolean
  agent_wallets?: Array<{
    chain_type: string
    address: string
    privy_wallet_id: string
    status: string
  }>
}

interface PluginPayload {
  slug: unknown
  name: unknown
  tools: Array<{ name: string }>
  config: Record<string, unknown>
  // UCA fields
  kind: string
  transport: string
  trustLevel: string
  executionMode: string
  authType: string
  authProvider: string | null
  endpointUrl?: string
  fallbackMode?: string | null
  mcpgateServerId?: string
  // Connection data (for integrations with auth)
  connectionId?: string
  /** @deprecated Use trustLevel + transport. */
  source: unknown
}

interface ImagePayload {
  data: string
  mimeType: string
}

interface ProxyOpts {
  assistantId: string
  assistantConfig: AssistantConfig
  plugins: PluginPayload[]
  message: string
  userId: string
  conversationId: string
  runId: string
  runtimeId?: string | null
  images?: ImagePayload[]
  signal?: AbortSignal
}

interface WorkerRouteResolution {
  url: string
  isDedicated: boolean
  fallbackUrl?: string
}

/**
 * Resolve the worker URL for an assistant.
 *
 * If the assistant has a dedicated runtime with a deployment_url and status=connected,
 * route to that. Otherwise fall back to the shared WORKER_URL.
 */
async function resolveWorkerUrl(runtimeId: string | null | undefined): Promise<WorkerRouteResolution | null> {
  const sharedUrl = getWorkerUrl()
  if (!runtimeId) return sharedUrl ? { url: sharedUrl, isDedicated: false } : null

  // Lightweight query only fetches what routing needs.
  const { data } = await supabase
    .from('dedicated_runtimes')
    .select('deployment_url, status')
    .eq('id', runtimeId)
    .single()

  if (data?.deployment_url) {
    const status = String(data.status ?? '').toLowerCase()
    const isTerminal = status === 'failed' || status === 'revoked' || status === 'terminated'
    if (!isTerminal) {
      return {
        url: data.deployment_url,
        isDedicated: true,
        fallbackUrl: sharedUrl || undefined,
      }
    }
  }

  // Dedicated runtime exists but not connected, so use the shared worker.
  if (sharedUrl) {
    console.warn(`[worker-proxy] Runtime ${runtimeId} has no usable dedicated route (status=${data?.status}), falling back to shared worker`)
    return { url: sharedUrl, isDedicated: false }
  }

  return null
}

function validateWorkerRoute(
  assistantConfig: AssistantConfig,
  isDedicated: boolean,
): string | null {
  const engine = assistantConfig.engine ?? 'openclaw'
  const runtimeFlavor = isDedicated
    ? assistantConfig.runtime_flavor === 'c1_managed' || assistantConfig.runtime_flavor === 'c2a_autonomous'
      ? assistantConfig.runtime_flavor
      : 'c1_managed'
    : 'shared'
  const channelOwnership = 'lucid_relay'

  if (!supportsRuntimeFlavor(engine, runtimeFlavor)) {
    return `${engine} does not support ${runtimeFlavor}`
  }

  if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
    return `${engine} does not support ${channelOwnership} for ${runtimeFlavor}`
  }

  return null
}

export async function proxyToWorkerStream(opts: ProxyOpts): Promise<Response> {
  const resolved = await resolveWorkerUrl(opts.runtimeId)
  if (!resolved) {
    return NextResponse.json(
      { error: 'Agent runtime unavailable (no WORKER_URL and no dedicated runtime)' },
      { status: 503 },
    )
  }

  let workerUrl = resolved.url
  let isDedicated = resolved.isDedicated
  const routeValidationError = validateWorkerRoute(opts.assistantConfig, isDedicated)
  if (routeValidationError) {
    return NextResponse.json({ error: routeValidationError }, { status: 409 })
  }

  const makeWorkerRequest = async (targetUrl: string) => nativeFetch(`${targetUrl}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.WORKER_TRIGGER_SECRET && {
        Authorization: `Bearer ${process.env.WORKER_TRIGGER_SECRET}`,
      }),
    },
    body: JSON.stringify({
      mode: 'agent',
      assistantId: opts.assistantId,
      conversationId: opts.conversationId,
      message: opts.message,
      userId: opts.userId,
      runId: opts.runId,
      assistantConfig: opts.assistantConfig,
      plugins: opts.plugins,
      ...(opts.images?.length && { images: opts.images }),
    }),
    signal: opts.signal,
  })

  let routeTarget = isDedicated ? 'dedicated' : 'shared'
  let routeReason = isDedicated ? 'dedicated-runtime' : 'shared-worker'
  let t0 = Date.now()
  console.log(`[worker-proxy] POST ${workerUrl}/stream for assistant=${opts.assistantId} (${routeTarget})`)

  let workerRes: Response
  try {
    workerRes = await makeWorkerRequest(workerUrl)
  } catch (error) {
    if (isDedicated && resolved.fallbackUrl) {
      console.warn(`[worker-proxy] Dedicated fetch failed for runtime ${opts.runtimeId}, retrying shared worker: ${error instanceof Error ? error.message : String(error)}`)
      workerUrl = resolved.fallbackUrl
      isDedicated = false
      routeTarget = 'shared'
      routeReason = 'shared-fallback-after-dedicated-failure'
      t0 = Date.now()
      workerRes = await makeWorkerRequest(workerUrl)
    } else {
      throw error
    }
  }

  console.log(`[worker-proxy] Response: ${workerRes.status} in ${Date.now() - t0}ms (${routeTarget})`)
  if ((!workerRes.ok || !workerRes.body) && isDedicated && resolved.fallbackUrl) {
    const text = await workerRes.text().catch(() => '')
    console.warn(`[worker-proxy] Dedicated worker failed (${workerRes.status}), retrying shared worker: ${text.slice(0, 200)}`)
    workerUrl = resolved.fallbackUrl
    routeTarget = 'shared'
    routeReason = 'shared-fallback-after-dedicated-error'
    t0 = Date.now()
    workerRes = await makeWorkerRequest(workerUrl)
    console.log(`[worker-proxy] Fallback response: ${workerRes.status} in ${Date.now() - t0}ms (${routeTarget})`)
  }

  if (!workerRes.ok || !workerRes.body) {
    const text = await workerRes.text().catch(() => '')
    console.error(`[worker-proxy] Worker failed: ${workerRes.status} ${text.slice(0, 200)}`)
    return NextResponse.json({ error: 'Worker stream failed' }, { status: 502 })
  }

  return new Response(workerRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'x-vercel-ai-ui-message-stream': 'v1',
      'x-run-id': opts.runId,
      'x-lucid-route': routeTarget,
      'x-lucid-route-reason': routeReason,
    },
  })
}

/**
 * Transform raw plugin rows from get_assistant_active_plugins RPC
 * into the payload shape the worker expects.
 *
 * This delegates to the centralized host-services layer so install-time
 * manifest preparation and runtime payload shaping stay aligned.
 */
export function transformPluginRows(
  rows: Array<Record<string, unknown>>,
): PluginPayload[] {
  return buildPluginRuntimePayloads(rows)
}
