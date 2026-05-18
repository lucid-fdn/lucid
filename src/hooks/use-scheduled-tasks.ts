'use client'

/**
 * Scheduled Tasks Hook — Reusable across MC agent detail, tasks panel, etc.
 *
 * Fetches agent_scheduled_tasks through the canonical /api/routines surface.
 * Subscribes to Realtime INSERT/UPDATE for instant refresh.
 * Supports org-wide or per-agent filtering.
 */

import { useCallback, useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import type { ScheduledTask, ScheduledTaskVersion } from '@/lib/mission-control/types'

interface UseScheduledTasksOptions {
  orgId: string
  agentId?: string
  enabled?: boolean
  /** Server-prefetched tasks — renders instantly, then Realtime takes over */
  initialTasks?: ScheduledTask[]
}

export interface RestoreTaskVersionResult {
  ok: boolean
  conflict: boolean
  currentSnapshotHash?: string | null
  error?: string | null
}

async function taskAction(
  url: string,
  method: 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(url, {
    method,
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return res.ok
}

export function useScheduledTasks({
  orgId,
  agentId,
  enabled = true,
  initialTasks,
}: UseScheduledTasksOptions) {
  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    {
      table: 'agent_scheduled_tasks',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      filter: agentId ? `assistant_id=eq.${agentId}` : `org_id=eq.${orgId}`,
    },
  ], [orgId, agentId])

  const queryFn = useMemo(() => {
    return async (): Promise<ScheduledTask[]> => {
      const params = new URLSearchParams({ org_id: orgId })
      if (agentId) params.set('assistant_id', agentId)
      const res = await fetch(`/api/routines?${params}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.routines ?? []
    }
  }, [orgId, agentId])

  const { data: allTasks, isLoading, refetch } = useRealtimeQuery<ScheduledTask[]>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-tasks-${agentId ?? orgId}`,
      subscriptions,
      orgId,
    },
    initialData: initialTasks ?? [],
    enabled,
    pollInterval: 5_000,
  })

  // Filter out cancelled (soft-deleted) tasks — they stay in the feed as history
  const tasks = useMemo(() => allTasks.filter(t => t.status !== 'cancelled'), [allTasks])

  const cancelTask = useCallback(async (taskId: string) => {
    const ok = await taskAction(`/api/routines/${taskId}?org_id=${orgId}`, 'PATCH', { action: 'cancel' })
    if (ok) refetch()
    return ok
  }, [orgId, refetch])

  const toggleTask = useCallback(async (taskId: string, enabled: boolean) => {
    const ok = await taskAction(`/api/routines/${taskId}?org_id=${orgId}`, 'PATCH', { enabled })
    if (ok) refetch()
    return ok
  }, [orgId, refetch])

  const updateTask = useCallback(async (taskId: string, updates: {
    name?: string
    task_prompt?: string
    cron_expression?: string | null
  }) => {
    const ok = await taskAction(`/api/routines/${taskId}?org_id=${orgId}`, 'PATCH', updates)
    if (ok) refetch()
    return ok
  }, [orgId, refetch])

  const deleteTask = useCallback(async (taskId: string) => {
    const ok = await taskAction(
      `/api/routines/${taskId}?org_id=${orgId}`,
      'DELETE',
    )
    if (ok) refetch()
    return ok
  }, [orgId, refetch])

  const listTaskVersions = useCallback(async (taskId: string): Promise<ScheduledTaskVersion[]> => {
    const params = new URLSearchParams({ org_id: orgId })
    const res = await fetch(`/api/routines/${taskId}/versions?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.versions ?? []
  }, [orgId])

  const restoreTaskVersion = useCallback(async (
    taskId: string,
    versionId: string,
    expectedCurrentSnapshotHash?: string | null,
  ): Promise<RestoreTaskVersionResult> => {
    const res = await fetch(`/api/routines/${taskId}/versions/${versionId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        expected_current_snapshot_hash: expectedCurrentSnapshotHash ?? null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      refetch()
      return { ok: true, conflict: false }
    }
    if (res.status === 409) {
      return {
        ok: false,
        conflict: true,
        currentSnapshotHash: data.current_snapshot_hash ?? null,
      }
    }
    return {
      ok: false,
      conflict: false,
      error: typeof data.error === 'string' ? data.error : 'Unable to restore this routine version.',
    }
  }, [orgId, refetch])

  return {
    tasks,
    isLoading,
    cancelTask,
    toggleTask,
    updateTask,
    deleteTask,
    listTaskVersions,
    restoreTaskVersion,
    refetch,
  }
}
