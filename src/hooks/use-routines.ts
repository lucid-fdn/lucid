'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CreateRoutineInput, RoutineDefinition, RoutineSimulation, UpdateRoutineInput } from '@/lib/routines/types'

interface UseRoutinesOptions {
  orgId?: string
  assistantId?: string
  teamId?: string
  targetType?: string
  status?: string
}

export function useRoutines(options: UseRoutinesOptions) {
  const [routines, setRoutines] = useState<RoutineDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!options.orgId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ org_id: options.orgId })
      if (options.assistantId) params.set('assistant_id', options.assistantId)
      if (options.teamId) params.set('team_id', options.teamId)
      if (options.targetType) params.set('target_type', options.targetType)
      if (options.status) params.set('status', options.status)
      const res = await fetch(`/api/routines?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load routines')
      setRoutines(json.routines ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routines')
    } finally {
      setLoading(false)
    }
  }, [options.orgId, options.assistantId, options.teamId, options.targetType, options.status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(async (input: CreateRoutineInput): Promise<RoutineDefinition> => {
    const res = await fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to create routine')
    await refresh()
    return json.routine
  }, [refresh])

  const update = useCallback(async (
    routineId: string,
    orgId: string,
    input: UpdateRoutineInput,
  ): Promise<RoutineDefinition> => {
    const res = await fetch(`/api/routines/${routineId}?org_id=${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to update routine')
    await refresh()
    return json.routine
  }, [refresh])

  const cancel = useCallback(async (routineId: string, orgId: string): Promise<void> => {
    const res = await fetch(`/api/routines/${routineId}?org_id=${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to cancel routine')
    await refresh()
  }, [refresh])

  const runNow = useCallback(async (routineId: string, orgId: string): Promise<RoutineDefinition> => {
    const res = await fetch(`/api/routines/${routineId}/run-now?org_id=${orgId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to run routine')
    await refresh()
    return json.routine
  }, [refresh])

  const simulate = useCallback(async (input: CreateRoutineInput): Promise<RoutineSimulation> => {
    const res = await fetch('/api/routines/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to simulate routine')
    return json.simulation
  }, [])

  return { routines, loading, error, refresh, create, update, cancel, runNow, simulate }
}
