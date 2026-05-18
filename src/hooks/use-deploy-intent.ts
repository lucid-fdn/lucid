'use client'

/**
 * useDeployIntent — Track server-side deploy intent via Supabase Realtime.
 *
 * Subscribes to dedicated_runtimes row changes for a specific runtime ID.
 * Derives deploy phase from runtime status + intent_status + created_assistant_id.
 * Also polls L2 status during the deploying phase for real progress milestones.
 *
 * Pattern mirrors use-runtimes.ts: memoized queryFn, memoized subscriptions,
 * useRealtimeQuery for Realtime + polling fallback.
 */

import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import { setVisibleInterval } from '@/lib/utils/visible-interval'
import type { DedicatedRuntime, L2DeployStatus } from '@/lib/mission-control/types'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

export type DeployPhase = 'deploying' | 'creating' | 'done' | 'failed' | 'idle'

interface UseDeployIntentResult {
  phase: DeployPhase
  assistantId: string | null
  runtimeStatus: string | null
  intentError: string | null
  /** Real L2 deploy status (null if no l2_passport_id or L2 unavailable) */
  l2Status: L2DeployStatus | null
}

function derivePhase(runtime: DedicatedRuntime | null, l2Status: L2DeployStatus | null): DeployPhase {
  if (!runtime) return 'idle'

  if (
    l2Status &&
    (l2Status.status === 'failed' ||
      l2Status.status === 'terminated' ||
      l2Status.health === 'unhealthy')
  ) {
    return 'failed'
  }

  // Failed states
  if (runtime.status === 'failed' || runtime.status === 'revoked' || runtime.intentStatus === 'failed') {
    return 'failed'
  }

  // Done — assistant created
  if (runtime.intentStatus === 'fulfilled' && runtime.createdAssistantId) {
    return 'done'
  }

  // Creating — runtime connected, intent being fulfilled
  if (runtime.status === 'connected' && (runtime.intentStatus === 'pending' || runtime.intentStatus === 'fulfilling')) {
    return 'creating'
  }

  // Deploying — runtime not yet connected
  if (runtime.status === 'pending' || runtime.status === 'deploying') {
    return 'deploying'
  }

  // Connected but no intent — shouldn't happen in this flow
  if (runtime.status === 'connected' && !runtime.intentStatus) {
    return 'idle'
  }

  return 'deploying'
}

/** L2 terminal states — stop polling once reached */
const L2_TERMINAL_STATES = new Set(['running', 'failed', 'terminated'])

/** Active deploys need tighter observation than the default app RT cadence. */
const DEPLOY_POLL_INTERVAL = 1_000

/** L2 status poll interval during deploying phase */
const L2_STATUS_POLL_INTERVAL = 1_500

export function useDeployIntent(
  runtimeId: string | null,
  orgId: string,
): UseDeployIntentResult {
  const enabled = !!runtimeId

  const subscriptions: RealtimeSubscription[] = useMemo(
    () => [
      {
        table: 'dedicated_runtimes',
        events: ['UPDATE'] as const,
        filter: runtimeId ? `id=eq.${runtimeId}` : `id=eq.none`,
      },
    ],
    [runtimeId],
  )

  const queryFn = useMemo(() => {
    return async (): Promise<DedicatedRuntime | null> => {
      if (!runtimeId) return null
      const res = await fetch(`/api/runtimes/${runtimeId}?org_id=${orgId}`)
      if (!res.ok) return null
      const json = await res.json()
      return json.runtime ?? null
    }
  }, [runtimeId, orgId])

  const { data: runtime } = useRealtimeQuery<DedicatedRuntime | null>({
    queryFn,
    realtimeConfig: {
      channelName: `deploy-intent-${runtimeId ?? 'none'}`,
      subscriptions,
      orgId,
    },
    initialData: null,
    enabled,
    pollInterval: DEPLOY_POLL_INTERVAL,
  })

  // ─── L2 Status Polling ───
  const [l2Status, setL2Status] = useState<L2DeployStatus | null>(null)
  const l2StatusRef = useRef(l2Status)
  l2StatusRef.current = l2Status
  const phase = derivePhase(runtime, l2Status)

  const fetchL2Status = useCallback(async () => {
    if (!runtimeId) return
    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/l2-status?org_id=${orgId}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.l2Status && typeof json.l2Status.status === 'string') {
        setL2Status({
          status: json.l2Status.status,
          health: json.l2Status.health,
          url: json.l2Status.url,
          error: typeof json.l2Status.error === 'string' ? json.l2Status.error : undefined,
        })
      }
    } catch {
      // Non-fatal — UI falls back to phase-only display
    }
  }, [runtimeId, orgId])

  useEffect(() => {
    // Only poll during active deploy phases and before L2 reaches a terminal state
    const isActivePhase = phase === 'deploying' || phase === 'creating'
    const isTerminal = l2StatusRef.current && L2_TERMINAL_STATES.has(l2StatusRef.current.status)

    if (!isActivePhase || !runtimeId || isTerminal) return

    // Fetch immediately, then poll (pauses when tab hidden)
    fetchL2Status()
    const cleanup = setVisibleInterval(() => {
      // Check terminal state inside interval to self-stop
      if (l2StatusRef.current && L2_TERMINAL_STATES.has(l2StatusRef.current.status)) return
      fetchL2Status()
    }, L2_STATUS_POLL_INTERVAL)

    return cleanup
  }, [phase, runtimeId, fetchL2Status])

  return useMemo(() => ({
    phase,
    assistantId: runtime?.createdAssistantId ?? null,
    runtimeStatus: runtime?.status ?? null,
    intentError: runtime?.intentError ?? null,
    l2Status,
  }), [runtime, phase, l2Status])
}
