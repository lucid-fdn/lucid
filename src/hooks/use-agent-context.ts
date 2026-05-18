'use client'

/**
 * Lazy-loads MCAgentContext for a given agent.
 *
 * Fetches on mount / when agentId changes. Aborts in-flight requests
 * on cleanup. No polling — context is a snapshot fetched once per
 * panel open (spec Point 7: "one API call on open").
 */

import { useState, useEffect } from 'react'
import type { MCAgentContext } from '@/lib/mission-control/types'

interface UseAgentContextOptions {
  agentId: string | null
  orgId: string | null
}

interface UseAgentContextResult {
  context: MCAgentContext | null
  isLoading: boolean
}

export function useAgentContext({ agentId, orgId }: UseAgentContextOptions): UseAgentContextResult {
  const [context, setContext] = useState<MCAgentContext | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!agentId || !orgId) {
      setContext(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)

    fetch(`/api/mission-control/agents/${agentId}?org_id=${orgId}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setContext(data)
        setIsLoading(false)
      })
      .catch((err) => {
        // AbortError is expected on cleanup — don't update state
        if (err instanceof DOMException && err.name === 'AbortError') return
        setContext(null)
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [agentId, orgId])

  return { context, isLoading }
}
