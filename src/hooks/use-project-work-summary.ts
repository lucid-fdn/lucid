'use client'

import { useEffect, useState } from 'react'

export interface ProjectWorkSummaryItem {
  id: string
  title: string
  status: string
  kind: string
}

export interface ProjectWorkSummaryPayload {
  summary: {
    open: number
    inProgress: number
    waiting: number
    overdue: number
    approvals: number
  }
  items: ProjectWorkSummaryItem[]
}

const EMPTY_PAYLOAD: ProjectWorkSummaryPayload = {
  summary: {
    open: 0,
    inProgress: 0,
    waiting: 0,
    overdue: 0,
    approvals: 0,
  },
  items: [],
}

export function useProjectWorkSummary(orgId?: string | null, projectId?: string | null, limit = 5) {
  const [payload, setPayload] = useState<ProjectWorkSummaryPayload>(EMPTY_PAYLOAD)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orgId || !projectId) {
      setPayload(EMPTY_PAYLOAD)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/workspaces/${orgId}/projects/${projectId}/work?limit=${limit}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load project work summary')
        return (await res.json()) as Partial<ProjectWorkSummaryPayload>
      })
      .then((data) => {
        if (cancelled) return
        setPayload({
          summary: {
            ...EMPTY_PAYLOAD.summary,
            ...(data.summary ?? {}),
          },
          items: data.items ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setPayload(EMPTY_PAYLOAD)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [limit, orgId, projectId])

  return {
    summary: payload.summary,
    items: payload.items,
    loading,
  }
}
