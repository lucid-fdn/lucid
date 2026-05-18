'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import type { OperatorArtifactSummary } from '@/lib/app-service/operator-visibility-core'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

interface RollbackActionsProps {
  appId: string
  currentArtifactId?: string | null
  artifacts: OperatorArtifactSummary[]
}

function artifactLabel(artifact: OperatorArtifactSummary) {
  const checksum = artifact.checksum.slice(0, 10)
  return `${artifact.kind.replace(/_/g, ' ')} v${artifact.version} (${checksum})`
}

export function RollbackActions({
  appId,
  currentArtifactId,
  artifacts,
}: RollbackActionsProps) {
  const router = useRouter()
  const rollbackTargets = useMemo(
    () => artifacts.filter((artifact) =>
      (artifact.kind === 'manifest' || artifact.kind === 'source_archive')
      && artifact.id !== currentArtifactId,
    ),
    [artifacts, currentArtifactId],
  )
  const [artifactId, setArtifactId] = useState(rollbackTargets[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitRollback() {
    if (!artifactId || isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => undefined)
      const csrf = getCSRFTokenFromCookie()
      const response = await fetch(`/api/app-services/${appId}/rollback`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          artifactId,
          note: note.trim() || undefined,
        }),
      })

      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Rollback failed.')
      }

      setNote('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (rollbackTargets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No previous manifest or source archive artifacts are available for rollback yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">Rollback target</span>
        <select
          value={artifactId}
          onChange={(event) => setArtifactId(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
        >
          {rollbackTargets.map((artifact) => (
            <option key={artifact.id} value={artifact.id}>
              {artifactLabel(artifact)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">Rollback note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={2000}
          className="resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          placeholder="What changed, why this artifact is the safe target, and what follow-up is needed."
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={() => void submitRollback()}
        disabled={!artifactId || isSubmitting}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCcw className="h-4 w-4" />
        {isSubmitting ? 'Rolling back...' : 'Rollback app'}
      </button>
    </div>
  )
}
