/**
 * Linear Agent Session — Signal Poller.
 *
 * Polls a Linear agent session's signal field via GraphQL every N seconds.
 * When signal === 'stop', calls the provided `onStop` callback and ceases
 * polling. Fire-and-forget — polling failures are logged but never thrown.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 2
 */

import { getNangoClient } from '../../../agent/oauth-tools/nango-client.js'
import { redact } from '../../../utils/pii-redactor.js'

// ─── GraphQL ──────────────────────────────────────────────────────────────

const AGENT_SESSION_SIGNAL_QUERY = `
  query AgentSessionSignal($id: String!) {
    agentSession(id: $id) {
      signal
    }
  }
`

// ─── Poller ───────────────────────────────────────────────────────────────

export interface SignalPollerOptions {
  connectionId: string
  providerConfigKey?: string
}

/**
 * Start polling Linear for the session's signal.
 *
 * Returns a `{ stop }` handle to cease polling (called from outside or
 * on signal detection). The poller self-cleans on 'stop' signal.
 */
export function startSignalPoller(
  linearSessionId: string,
  opts: SignalPollerOptions,
  onStop: () => void,
  intervalMs = 5000,
): { stop: () => void } {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = (): void => {
    if (stopped) return
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const poll = async (): Promise<void> => {
    if (stopped) return

    try {
      const nango = getNangoClient()
      if (!nango) {
        console.warn('[SignalPoller] Nango client not configured, stopping poller')
        stop()
        return
      }

      const response = await nango.post({
        connectionId: opts.connectionId,
        providerConfigKey: opts.providerConfigKey ?? 'linear-agent',
        endpoint: '/graphql',
        data: {
          query: AGENT_SESSION_SIGNAL_QUERY,
          variables: { id: linearSessionId },
        },
        headers: { 'Content-Type': 'application/json' },
        retries: 1,
      })

      const body = response.data as {
        data?: { agentSession?: { signal?: string | null } }
      }
      const signal = body?.data?.agentSession?.signal

      if (signal === 'stop') {
        console.info(
          `[SignalPoller] Stop signal received for session ${redact(linearSessionId)}`,
        )
        stop()
        onStop()
        return
      }
    } catch (err) {
      console.warn(
        `[SignalPoller] Failed to poll signal for session ${redact(linearSessionId)}:`,
        redact((err as Error).message),
      )
    }

    // Schedule next poll
    if (!stopped) {
      timer = setTimeout(poll, intervalMs)
    }
  }

  // Start first poll after one interval
  timer = setTimeout(poll, intervalMs)

  return { stop }
}
