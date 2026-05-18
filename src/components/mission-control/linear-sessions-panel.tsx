'use client'

/**
 * Linear Sessions Panel — Active Linear agent sessions table.
 *
 * Displays agent sessions triggered via Linear's Agents API with
 * issue identifier, agent name, status badge, duration, and run link.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 4
 */

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/mission-control/constants'
import type {
  LinearAgentSession,
  LinearAgentSessionStatus,
} from '@/lib/mission-control/types'
import { ExternalLink, RefreshCw } from 'lucide-react'

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_BADGE_STYLES: Record<LinearAgentSessionStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  awaiting_input: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  complete: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  error: 'bg-red-500/10 text-red-500 border-red-500/20',
  stale: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

const STATUS_LABELS: Record<LinearAgentSessionStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  awaiting_input: 'Awaiting input',
  complete: 'Complete',
  error: 'Error',
  stale: 'Stale',
  cancelled: 'Cancelled',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LinearSessionsPanelProps {
  orgId: string
}

export function LinearSessionsPanel({ orgId }: LinearSessionsPanelProps) {
  const [sessions, setSessions] = useState<LinearAgentSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/orgs/${orgId}/linear-agent/sessions`)
      if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.status}`)
      }
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 10_000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-black p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading sessions...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-white/10 bg-black p-6">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black p-6">
        <p className="text-sm text-muted-foreground">
          No Linear agent sessions yet. Assign an issue to your agent or @mention
          it in Linear to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-medium">Linear agent sessions</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Issue</th>
              <th className="px-4 py-2 font-medium">Trigger</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: LinearAgentSession }) {
  const issueLabel = session.linearIssueIdentifier ?? session.linearIssueId
  const issueUrl = session.linearIssueUrl

  return (
    <tr className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
      {/* Issue */}
      <td className="px-4 py-2.5">
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:underline"
          >
            {issueLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="font-mono text-xs">{issueLabel}</span>
        )}
        {session.linearActorName && (
          <span className="ml-2 text-xs text-muted-foreground">
            by {session.linearActorName}
          </span>
        )}
      </td>

      {/* Trigger */}
      <td className="px-4 py-2.5">
        <span className="text-xs capitalize text-muted-foreground">
          {session.triggerType}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-2.5">
        <span
          className={cn(
            'inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium',
            STATUS_BADGE_STYLES[session.status],
          )}
        >
          {STATUS_LABELS[session.status]}
        </span>
      </td>

      {/* Duration */}
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {formatRelativeTime(session.webhookReceivedAt)}
      </td>

      {/* Actions */}
      <td className="px-4 py-2.5">
        {session.runId ? (
          <a
            href={`?run=${session.runId}`}
            className="text-xs text-blue-400 hover:underline"
          >
            View run
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  )
}
