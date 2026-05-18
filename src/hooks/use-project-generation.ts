'use client'

import * as React from 'react'

import type { GeneratedBlueprintResult, GenerationDraft } from '@/lib/ai/project-generation/schemas'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/auth-context'
import {
  buildClientMutationHeaders,
  fetchWithSessionRecovery,
} from '@/lib/auth/client-request'

export interface UseProjectGenerationOptions {
  workspaceId: string
  initialPrompt?: string
  initialResult?: GeneratedBlueprintResult | null
}

export function useProjectGeneration({
  workspaceId,
  initialPrompt = '',
  initialResult = null,
}: UseProjectGenerationOptions) {
  const { refreshSession } = useAuth()
  const [prompt, setPrompt] = React.useState(initialPrompt)
  const [result, setResult] = React.useState<GeneratedBlueprintResult | null>(initialResult)
  const [isGenerating, setIsGenerating] = React.useState(false)

  const generate = React.useCallback(async (options?: { draft?: GenerationDraft }) => {
    if (!prompt.trim()) return null

    try {
      setIsGenerating(true)
      await refreshSession().catch(() => false)

      const response = await fetchWithSessionRecovery(`/api/orgs/${workspaceId}/blueprints/generate`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildClientMutationHeaders(undefined, { includeIdempotencyKey: true }),
        body: JSON.stringify({
          prompt: prompt.trim(),
          ...((options?.draft ?? result?.draft) ? { draft: options?.draft ?? result?.draft } : {}),
        }),
      }, refreshSession)

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const details = Array.isArray(body?.issues)
          ? body.issues.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          : Array.isArray(body?.details)
            ? body.details
                .map((detail: unknown) => {
                  if (typeof detail === 'string') return detail
                  if (detail && typeof detail === 'object' && 'message' in detail && typeof (detail as { message?: unknown }).message === 'string') {
                    return (detail as { message: string }).message
                  }
                  return null
                })
                .filter((value: string | null): value is string => Boolean(value))
            : []
        const message = details[0] || body?.error || 'Failed to generate project setup'
        throw new Error(message)
      }

      const next = await response.json() as GeneratedBlueprintResult
      setResult(next)
      return next
    } catch (error) {
      toast.error(
        'Could not generate setup',
        error instanceof Error ? error.message : 'Something went wrong.',
      )
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, refreshSession, result, workspaceId])

  const reset = React.useCallback(() => {
    setPrompt('')
    setResult(null)
  }, [])

  return {
    prompt,
    setPrompt,
    result,
    setResult,
    isGenerating,
    generate,
    reset,
  }
}
