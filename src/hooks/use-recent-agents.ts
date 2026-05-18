'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { createRecentListStore } from '@/hooks/recent-storage'

const STORAGE_KEY = 'lucid:recent-agents'
const MAX_RECENT = 5

interface StoredRecentAgentV1 {
  id: string
  name: string
  slug: string
  visitedAt: number
}

export interface RecentAgent {
  id: string
  name: string
  slug: string // workspace slug for URL building
  projectSlug: string
  /** Timestamp of last visit */
  visitedAt: number
}

const EMPTY: RecentAgent[] = []

export function normalizeRecentAgents(value: unknown): RecentAgent[] {
  if (!Array.isArray(value)) return EMPTY

  return value
    .map((entry) => normalizeRecentAgent(entry))
    .filter((entry): entry is RecentAgent => entry !== null)
}

function normalizeRecentAgent(value: unknown): RecentAgent | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<RecentAgent> & Partial<StoredRecentAgentV1>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.slug !== 'string' ||
    typeof candidate.visitedAt !== 'number'
  ) {
    return null
  }

  if (typeof candidate.projectSlug !== 'string' || candidate.projectSlug.length === 0) {
    return null
  }

  return {
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    projectSlug: candidate.projectSlug,
    visitedAt: candidate.visitedAt,
  }
}

const recentAgentsStore = createRecentListStore<RecentAgent>({
  storageKey: STORAGE_KEY,
  normalize: normalizeRecentAgents,
})

export function useRecentAgents() {
  const agents = useSyncExternalStore(
    recentAgentsStore.subscribe,
    recentAgentsStore.getSnapshot,
    recentAgentsStore.getServerSnapshot,
  )

  const visit = useCallback((agent: Omit<RecentAgent, 'visitedAt'>) => {
    const current = recentAgentsStore.getSnapshot()
    if (
      current.length > 0 &&
      current[0].id === agent.id &&
      current[0].name === agent.name &&
      current[0].slug === agent.slug &&
      current[0].projectSlug === agent.projectSlug
    ) {
      return
    }

    const filtered = current.filter((entry) => entry.id !== agent.id)
    const updated: RecentAgent[] = [{ ...agent, visitedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT)

    recentAgentsStore.setItems(updated)
  }, [])

  const remove = useCallback((agentId: string) => {
    const current = recentAgentsStore.getSnapshot()
    const updated = current.filter((entry) => entry.id !== agentId)
    recentAgentsStore.setItems(updated)
  }, [])

  return { recentAgents: agents, visit, remove }
}
