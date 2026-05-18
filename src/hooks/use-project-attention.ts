'use client'

import { useEffect, useMemo, useState } from 'react'

export interface ProjectAttentionSummary {
  approvals: number
  failedRuns: number
  activeRuns: number
  openWorkItems: number
  criticalEvents: number
}

const EMPTY_SUMMARY: ProjectAttentionSummary = {
  approvals: 0,
  failedRuns: 0,
  activeRuns: 0,
  openWorkItems: 0,
  criticalEvents: 0,
}

export async function fetchProjectAttentionSummary(orgId: string, projectId: string): Promise<ProjectAttentionSummary> {
  const res = await fetch(`/api/workspaces/${orgId}/projects/${projectId}/attention`)
  if (!res.ok) {
    throw new Error('Failed to load project attention summary')
  }

  const data = (await res.json()) as { summary?: ProjectAttentionSummary }
  return data.summary ?? EMPTY_SUMMARY
}

export function getProjectAttentionCount(summary: ProjectAttentionSummary): number {
  return (
    summary.approvals
    + summary.failedRuns
    + summary.openWorkItems
    + summary.criticalEvents
  )
}

export function useProjectAttention(orgId?: string | null, projectId?: string | null) {
  const [summary, setSummary] = useState<ProjectAttentionSummary>(EMPTY_SUMMARY)
  const [isLoadingAttention, setIsLoadingAttention] = useState(false)

  useEffect(() => {
    if (!orgId || !projectId) {
      setSummary(EMPTY_SUMMARY)
      setIsLoadingAttention(false)
      return
    }

    let cancelled = false
    setIsLoadingAttention(true)

    fetchProjectAttentionSummary(orgId, projectId)
      .then((nextSummary) => {
        if (!cancelled) {
          setSummary(nextSummary)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(EMPTY_SUMMARY)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAttention(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [orgId, projectId])

  const attentionCount = useMemo(
    () => getProjectAttentionCount(summary),
    [summary],
  )

  return {
    summary,
    attentionCount,
    isLoadingAttention,
  }
}
