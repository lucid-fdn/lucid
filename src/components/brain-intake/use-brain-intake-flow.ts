'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import type {
  BrainIntakeClassifyResponse,
  BrainIntakeCommitResponse,
  BrainIntakeDraftItem,
  BrainIntakeFile,
} from '@/lib/brain-intake/schema'

export function useBrainIntakeFlow({
  orgId,
  scopeId,
  onRecall,
}: {
  orgId: string
  scopeId: string
  onRecall?: (query: string) => void
}) {
  const router = useRouter()
  const [items, setItems] = useState<BrainIntakeDraftItem[]>([])
  const [summary, setSummary] = useState('')
  const [isClassifying, setIsClassifying] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const classify = useCallback(async (text: string, files: BrainIntakeFile[]) => {
    setIsClassifying(true)
    setError(null)
    try {
      const response = await fetch('/api/brain/intake/classify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, scopeId, text, files }),
      })
      const payload = await response.json().catch(() => null) as BrainIntakeClassifyResponse | { error?: string } | null
      if (!response.ok) throw new Error(payload && 'error' in payload ? payload.error : 'Classification failed')
      const next = payload as BrainIntakeClassifyResponse
      setItems(next.items)
      setSummary(next.summary)
      return next.items
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Classification failed'
      setError(message)
      return []
    } finally {
      setIsClassifying(false)
    }
  }, [orgId, scopeId])

  const commit = useCallback(async () => {
    setIsCommitting(true)
    setError(null)
    try {
      let csrfToken = getCSRFTokenFromCookie()
      if (!csrfToken) {
        await fetch('/api/auth/csrf', { credentials: 'include' }).catch(() => {})
        csrfToken = getCSRFTokenFromCookie()
      }

      const response = await fetch('/api/brain/intake/commit', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ orgId, scopeId, items }),
      })
      const payload = await response.json().catch(() => null) as BrainIntakeCommitResponse | { error?: string } | null
      if (!response.ok) throw new Error(payload && 'error' in payload ? payload.error : 'Save failed')

      const result = payload as BrainIntakeCommitResponse
      result.results.forEach((item) => {
        if (item.recallQuery) onRecall?.(item.recallQuery)
      })
      router.refresh()
      return result
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Save failed'
      setError(message)
      return null
    } finally {
      setIsCommitting(false)
    }
  }, [items, onRecall, orgId, router, scopeId])

  return {
    items,
    setItems,
    summary,
    isClassifying,
    isCommitting,
    error,
    setError,
    classify,
    commit,
  }
}
