import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { claimInboundForRuntime, buildRunPacketById } from '@/lib/db/mission-control'
import { claimInboundSchema } from '@/lib/mission-control/schemas'
import { claimForRuntime, isPulseAvailable } from '@/lib/pulse'
import { ErrorService } from '@/lib/errors/error-service'
import { getEngineDefinition } from '@/lib/engines/registry'
import { shouldUsePulseClaimProxy } from '@/lib/runtimes/execution-contract'
import {
  RUNTIME_DB_CLAIM_POLL_INTERVAL_MS,
  RUNTIME_LEGACY_CLAIM_MAX_PER_WINDOW,
  RUNTIME_RATE_LIMIT_RETRY_AFTER_MS,
  RUNTIME_RATE_LIMIT_MAX_TRACKED,
  RUNTIME_RATE_LIMIT_WINDOW_MS,
} from '@/lib/runtimes/policy'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'
import { summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'

// Legacy-path-only in-memory rate limiter: max 60 claims/minute per runtime.
// Applied ONLY when Pulse is unavailable and we fall back to direct DB claims.
// The Pulse path uses the Redis-backed sliding-window limiter in
// `src/lib/pulse/claim-proxy.ts` (fleet-wide, instance-count-independent), so
// layering an in-memory counter on top of it would cause per-instance false
// 429s on horizontally scaled Vercel lambdas.
const legacyClaimCounts = new Map<string, { count: number; resetAt: number }>()

function checkLegacyRateLimit(runtimeId: string): boolean {
  const now = Date.now()
  const entry = legacyClaimCounts.get(runtimeId)
  if (!entry || entry.resetAt < now) {
    // Evict stale entries if map is getting large
    if (legacyClaimCounts.size >= RUNTIME_RATE_LIMIT_MAX_TRACKED) {
      for (const [id, e] of legacyClaimCounts) {
        if (e.resetAt < now) legacyClaimCounts.delete(id)
      }
    }
    legacyClaimCounts.set(runtimeId, { count: 1, resetAt: now + RUNTIME_RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RUNTIME_LEGACY_CLAIM_MAX_PER_WINDOW) return false
  entry.count++
  return true
}

async function claimViaDbLongPoll(
  runtimeId: string,
  orgId: string,
  batchSize: number,
  waitMs: number,
) {
  const deadline = Date.now() + waitMs

  while (true) {
    const packets = await claimInboundForRuntime(runtimeId, orgId, batchSize)
    if (packets.length > 0 || waitMs === 0) {
      return packets
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      return packets
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(RUNTIME_DB_CLAIM_POLL_INTERVAL_MS, remainingMs)),
    )
  }
}

// POST /api/runtimes/messages/claim-inbound — Claim inbound events for relay
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (runtime.dedicatedTransportMode === 'native_pulse') {
      return NextResponse.json(
        { error: 'This runtime uses native Pulse and cannot claim work through relay APIs' },
        { status: 409 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = claimInboundSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const engine = runtime.engine ?? 'openclaw'
    const runtimeFlavor =
      runtime.runtimeFlavor === 'c1_managed' || runtime.runtimeFlavor === 'c2a_autonomous'
        ? runtime.runtimeFlavor
        : 'c1_managed'
    const channelOwnership = runtimeFlavor === 'c2a_autonomous' ? 'runtime_native' : 'lucid_relay'
    const engineDefinition = getEngineDefinition(engine)

    if (!supportsRuntimeFlavor(engine, runtimeFlavor)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${runtimeFlavor}` },
        { status: 409 },
      )
    }

    if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
      return NextResponse.json(
        { error: `${engineDefinition.label} does not support ${channelOwnership} for ${runtimeFlavor}` },
        { status: 409 },
      )
    }

    // Dedicated relay runtimes claim directly from Postgres. Sending them
    // through the shared Pulse Redis proxy can starve work when the relay
    // event exists in DB but was not mirrored into the shared queue.
    const shouldUsePulseProxy =
      shouldUsePulseClaimProxy(runtime.dedicatedTransportMode) && isPulseAvailable()

    // Pulse path: claim from Redis queue, then build RunPackets from event IDs.
    // Rate limiting on this path is handled fleet-wide by the Redis-backed
    // sliding-window limiter inside claimForRuntime() (see src/lib/pulse/claim-proxy.ts).
    if (shouldUsePulseProxy) {
      try {
        const packets = await ErrorService.startSpan(
          'pulse.claim_proxy.pulse',
          'queue.claim',
          () => claimViaPulse(runtime.id, runtime.orgId, parsed.data.batchSize, parsed.data.waitMs),
        )
        return NextResponse.json({ packets, source: 'pulse', degradedMode: false })
      } catch (pulseError) {
        console.warn(
          '[pulse:proxy] claimViaPulse failed, falling back to DB claim:',
          pulseError instanceof Error ? pulseError.message : pulseError,
        )
      }
    }

    // Fallback: direct DB claim (legacy path). Redis is unavailable here, so
    // use the in-memory per-instance limiter as a bounded safety net.
    if (!checkLegacyRateLimit(runtime.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterMs: RUNTIME_RATE_LIMIT_RETRY_AFTER_MS },
        { status: 429 }
      )
    }

    const packets = await ErrorService.startSpan(
      'pulse.claim_proxy.db',
      'db.claim',
      () => claimViaDbLongPoll(runtime.id, runtime.orgId, parsed.data.batchSize, parsed.data.waitMs),
    )

    return NextResponse.json({ packets, source: 'db', degradedMode: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/messages/claim-inbound' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * Claim inbound events via Pulse Redis, then build RunPackets.
 * Claims up to batchSize jobs from Pulse, builds packets for each.
 * If packet building fails (event deleted, etc.), releases the Pulse claim.
 */
async function claimViaPulse(
  runtimeId: string,
  orgId: string,
  batchSize: number,
  waitMs: number,
): Promise<unknown[]> {
  const { completeForRuntime, failForRuntime } = await import('@/lib/pulse')
  const packets: unknown[] = []

  for (let i = 0; i < batchSize; i++) {
    const result = await claimForRuntime('inbound', runtimeId, { waitMs: i === 0 ? waitMs : 0 })
    if (!result) break // No more jobs in queue

    try {
      // Build RunPacket from the claimed event ID
      const packet = await buildRunPacketById(
        result.job.eventId,
        runtimeId,
        orgId,
      )

      if (!packet) {
        // Event no longer exists or already processed — release Pulse claim
        await failForRuntime(result.job, result.leaseToken)
        continue
      }

      // Attach Pulse metadata so complete/fail endpoints can release resources
      packets.push({
        ...packet,
        _pulse: {
          runId: result.job.runId,
          leaseToken: result.leaseToken,
          agentId: result.job.agentId,
        },
      })
    } catch (err) {
      // Failed to build packet — release Pulse claim
      console.error('[pulse:proxy] Failed to build RunPacket:', summarizeError(err))
      await failForRuntime(result.job, result.leaseToken).catch(() => {})
    }
  }

  return packets
}
