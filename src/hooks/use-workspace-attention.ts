'use client'

import { useEffect, useMemo, useState } from 'react'

export interface WorkspaceAttentionSummary {
  projects: number
  approvals: number
  failedRuns: number
  activeRuns: number
  readyWorkItems: number
  blockedWorkItems: number
  livenessIncidents: number
  criticalEvents: number
}

const EMPTY_SUMMARY: WorkspaceAttentionSummary = {
  projects: 0,
  approvals: 0,
  failedRuns: 0,
  activeRuns: 0,
  readyWorkItems: 0,
  blockedWorkItems: 0,
  livenessIncidents: 0,
  criticalEvents: 0,
}

export async function fetchWorkspaceAttentionSummary(orgId: string): Promise<WorkspaceAttentionSummary> {
  const res = await fetch(`/api/workspaces/${orgId}/attention`)
  if (!res.ok) {
    throw new Error('Failed to load workspace attention summary')
  }

  const data = (await res.json()) as { summary?: WorkspaceAttentionSummary }
  return data.summary ?? EMPTY_SUMMARY
}

export function getWorkspaceAttentionCount(summary: WorkspaceAttentionSummary): number {
  return (
    summary.approvals
    + summary.failedRuns
    + summary.readyWorkItems
    + summary.livenessIncidents
    + summary.criticalEvents
  )
}

export function useWorkspaceAttention(orgId?: string | null) {
  const [summary, setSummary] = useState<WorkspaceAttentionSummary>(EMPTY_SUMMARY)
  const [isLoadingAttention, setIsLoadingAttention] = useState(false)

  useEffect(() => {
    if (!orgId) {
      setSummary(EMPTY_SUMMARY)
      setIsLoadingAttention(false)
      return
    }

    let cancelled = false
    setIsLoadingAttention(true)

    fetchWorkspaceAttentionSummary(orgId)
      .then((nextSummary) => {
        if (!cancelled) setSummary(nextSummary)
      })
      .catch(() => {
        if (!cancelled) setSummary(EMPTY_SUMMARY)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAttention(false)
      })

    return () => {
      cancelled = true
    }
  }, [orgId])

  const attentionCount = useMemo(() => getWorkspaceAttentionCount(summary), [summary])

  return {
    summary,
    attentionCount,
    isLoadingAttention,
  }
}
