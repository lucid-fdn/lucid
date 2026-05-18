'use client'

import { useCallback, useEffect, useState } from 'react'
import type { WorkItemStatus } from '@/lib/db/human-work-items'
import type { WorkItemWithSignal } from '@/lib/work-items/signals'

export type WorkItemsFilter = 'mine' | 'all' | 'open' | 'done'

interface UseWorkItemsOptions {
  orgId: string
  filter: WorkItemsFilter
  agentIds?: string[]
  refreshMs?: number
}

const STATUS_BY_FILTER: Partial<Record<WorkItemsFilter, WorkItemStatus[]>> = {
  open: ['open', 'in_progress', 'waiting'],
  done: ['done', 'cancelled', 'rejected'],
}

export function useWorkItems({
  orgId,
  filter,
  agentIds,
  refreshMs = 15_000,
}: UseWorkItemsOptions) {
  const [items, setItems] = useState<WorkItemWithSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filter === 'mine') params.set('assignee', 'me')
      const statuses = STATUS_BY_FILTER[filter]
      if (statuses) params.set('status', statuses.join(','))
      if (agentIds && agentIds.length > 0) params.set('agent_id', agentIds.join(','))
      params.set('limit', '100')

      const res = await fetch(`/api/orgs/${orgId}/work-items?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        let message = 'Failed to load work items'
        try {
          const payload = (await res.json()) as { error?: string }
          message = payload.error || message
        } catch {
          // Keep the generic fallback when the server did not return JSON.
        }
        setError(message)
        setItems([])
        return
      }
      const payload = (await res.json()) as { items: WorkItemWithSignal[] }
      setItems(payload.items ?? [])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [agentIds, filter, orgId])

  useEffect(() => {
    setLoading(true)
    void fetchItems()
    if (!refreshMs) return
    const timer = setInterval(() => {
      void fetchItems()
    }, refreshMs)
    return () => clearInterval(timer)
  }, [fetchItems, refreshMs])

  return { items, loading, error, refetch: fetchItems }
}
