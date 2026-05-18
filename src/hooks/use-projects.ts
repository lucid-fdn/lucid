'use client'

import { useEffect, useState } from 'react'

export interface ProjectOption {
  id: string
  name: string
  slug: string
  is_default: boolean
  counts?: {
    assistants: number
    crews: number
    workflows: number
    templates: number
  }
}

export async function fetchWorkspaceProjects(orgId: string): Promise<ProjectOption[]> {
  const res = await fetch(`/api/workspaces/${orgId}/projects`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error('Failed to load projects')
  }

  const data = (await res.json()) as { projects?: ProjectOption[] }
  return data.projects ?? []
}

export function useProjects(orgId?: string | null) {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)

  useEffect(() => {
    if (!orgId) {
      setProjects([])
      setIsLoadingProjects(false)
      return
    }

    let cancelled = false
    setIsLoadingProjects(true)

    fetchWorkspaceProjects(orgId)
      .then((items) => {
        if (!cancelled) {
          setProjects(items)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProjects(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [orgId])

  return { projects, isLoadingProjects }
}
