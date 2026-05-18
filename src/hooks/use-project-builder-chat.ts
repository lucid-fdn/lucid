'use client'

import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import type { TemplateCatalogEntry } from '@contracts/template'

import { useAuth } from '@/contexts/auth-context'
import { toast } from '@/hooks/use-toast'
import { projectBlueprintFromDraft } from '@/lib/ai/project-generation/draft'
import { buildOptimisticBuilderDraft } from '@/lib/ai/project-generation/optimistic-draft'
import { suggestBuilderTemplate } from '@/lib/ai/project-generation/template-suggestion'
import { classifyBuilderTurn } from '@/lib/ai/project-generation/turn-routing'
import {
  buildClientMutationHeaders,
  fetchWithSessionRecovery,
} from '@/lib/auth/client-request'
import type {
  BuilderDecisionCard,
  BuilderStage,
  GeneratedBlueprintResult,
  GenerationDraft,
} from '@/lib/ai/project-generation/schemas'
import type {
  ProjectBuilderArtifact,
  ProjectBuilderProgress,
  ProjectBuilderStreamData,
  ProjectBuilderUIMessage,
} from '@/lib/ai/project-generation/chat'
import {
  deriveBuilderDecisionCards,
  projectBuilderArtifactSchema,
  projectBuilderProgressSchema,
  projectBuilderStreamDataSchema,
} from '@/lib/ai/project-generation/chat'
import {
  initialBuilderTemplateEnrichment,
  type BuilderTemplateEnrichment,
} from '@/lib/builder/state/builder-state'
import { logBuilderTelemetry } from '@/lib/builder/state/builder-telemetry'

export interface UseProjectBuilderChatOptions {
  workspaceId: string
  initialMessages?: ProjectBuilderUIMessage[]
  initialResult?: GeneratedBlueprintResult | null
  catalogTemplates?: TemplateCatalogEntry[]
  initialAvailableUnifiedSkills?: UnifiedSkillItem[]
}

export function useProjectBuilderChat({
  workspaceId,
  initialMessages = [],
  initialResult = null,
  catalogTemplates = [],
  initialAvailableUnifiedSkills = [],
}: UseProjectBuilderChatOptions) {
  const logBuilderEvent = React.useCallback((event: string, payload?: Record<string, unknown>) => {
    logBuilderTelemetry(event as Parameters<typeof logBuilderTelemetry>[0], payload)
  }, [])
  const { refreshSession } = useAuth()
  const [input, setInput] = React.useState('')
  const [result, setResult] = React.useState<GeneratedBlueprintResult | null>(initialResult)
  const [draft, setDraft] = React.useState<GenerationDraft | null>(initialResult?.draft ?? null)
  const [decisionCards, setDecisionCards] = React.useState<BuilderDecisionCard[]>(() => (
    initialResult ? deriveBuilderDecisionCards(initialResult, initialAvailableUnifiedSkills) : []
  ))
  const [stageHint, setStageHint] = React.useState<BuilderStage>('create-agent')
  const [progress, setProgress] = React.useState<ProjectBuilderProgress | null>(null)
  const [artifactText, setArtifactText] = React.useState('')
  const [statusLabel, setStatusLabel] = React.useState<string | null>(null)
  const [availableUnifiedSkills, setAvailableUnifiedSkills] = React.useState<UnifiedSkillItem[]>(initialAvailableUnifiedSkills)
  const [templateSuggestion, setTemplateSuggestion] = React.useState<BuilderTemplateEnrichment>(initialBuilderTemplateEnrichment)
  const [dismissedDecisionCardKeys, setDismissedDecisionCardKeys] = React.useState<string[]>([])
  const [decisionAnchorMessageId, setDecisionAnchorMessageId] = React.useState<string | null>(null)
  const draftRef = React.useRef<GenerationDraft | undefined>(initialResult?.draft)
  const activeSubmitStartedAtRef = React.useRef<number | null>(null)
  const templateSuggestionRequestIdRef = React.useRef<string | null>(null)
  const capabilitiesFetchedAtRef = React.useRef<number | null>(initialAvailableUnifiedSkills.length > 0 ? Date.now() : null)

  React.useEffect(() => {
    draftRef.current = result?.draft
  }, [result])

  React.useEffect(() => {
    if (result?.draft) {
      setDraft(result.draft)
    }
  }, [result])

  const refreshAvailableUnifiedSkills = React.useCallback(async (options?: { force?: boolean }) => {
    const fetchedAt = capabilitiesFetchedAtRef.current
    if (!options?.force && fetchedAt && Date.now() - fetchedAt < 30_000) {
      logBuilderEvent('capability-metadata:ready', {
        count: availableUnifiedSkills.length,
        cached: true,
      })
      return
    }

    logBuilderEvent('capability-metadata:start')
    const url = options?.force
      ? `/api/orgs/${workspaceId}/blueprints/capability-metadata?refresh=1`
      : `/api/orgs/${workspaceId}/blueprints/capability-metadata`

    return fetchWithSessionRecovery(url, { credentials: 'same-origin' }, refreshSession)
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ items?: UnifiedSkillItem[] }>
      })
      .then((payload) => {
        if (!payload) return
        setAvailableUnifiedSkills(payload.items ?? [])
        capabilitiesFetchedAtRef.current = Date.now()
        logBuilderEvent('capability-metadata:ready', {
          count: payload.items?.length ?? 0,
        })
      })
      .catch((error) => {
        logBuilderEvent('capability-metadata:error', {
          message: error instanceof Error ? error.message : String(error),
        })
      })
  }, [availableUnifiedSkills.length, logBuilderEvent, refreshSession, workspaceId])

  const startTemplateSuggestion = React.useCallback(async (prompt: string) => {
    const requestId = crypto.randomUUID()
    const startedAt = performance.now()
    templateSuggestionRequestIdRef.current = requestId
    setTemplateSuggestion({
      ...initialBuilderTemplateEnrichment,
      status: 'loading',
      prompt,
      updatedAt: Date.now(),
    })
    logBuilderEvent('template-suggestion:start', { prompt })

    try {
      if (catalogTemplates.length > 0) {
        const suggestion = suggestBuilderTemplate({
          prompt,
          templates: catalogTemplates,
        })
        if (templateSuggestionRequestIdRef.current !== requestId) return
        setTemplateSuggestion({
          status: suggestion?.match ? 'ready' : 'empty',
          prompt,
          match: suggestion?.match ?? null,
          error: null,
          updatedAt: Date.now(),
        })
        logBuilderEvent(suggestion?.match ? 'template-suggestion:ready' : 'template-suggestion:empty', {
          templateSlug: suggestion?.match.slug ?? null,
          elapsed_ms: Math.round(performance.now() - startedAt),
          source: 'client-catalog',
        })
        return
      }

      const response = await fetchWithSessionRecovery(
        `/api/orgs/${workspaceId}/blueprints/suggest-template`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: buildClientMutationHeaders(),
          body: JSON.stringify({ prompt }),
        },
        refreshSession,
      )
      if (templateSuggestionRequestIdRef.current !== requestId) return
      if (!response.ok) {
        throw new Error(`Template suggestion failed with ${response.status}`)
      }

      const payload = await response.json() as {
        suggestion?: {
          match: BuilderTemplateEnrichment['match']
          reason: string
          confidence: number
        } | null
      }
      const match = payload.suggestion?.match ?? null
      setTemplateSuggestion({
        status: match ? 'ready' : 'empty',
        prompt,
        match,
        error: null,
        updatedAt: Date.now(),
      })
      logBuilderEvent(match ? 'template-suggestion:ready' : 'template-suggestion:empty', {
        templateSlug: match?.slug ?? null,
        elapsed_ms: Math.round(performance.now() - startedAt),
      })
    } catch (error) {
      if (templateSuggestionRequestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setTemplateSuggestion({
        status: 'error',
        prompt,
        match: null,
        error: message,
        updatedAt: Date.now(),
      })
      logBuilderEvent('template-suggestion:error', {
        message,
        elapsed_ms: Math.round(performance.now() - startedAt),
      })
    }
  }, [catalogTemplates, logBuilderEvent, refreshSession, workspaceId])

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<ProjectBuilderUIMessage>({
        api: `/api/orgs/${workspaceId}/blueprints/chat`,
        credentials: 'same-origin',
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) =>
          fetchWithSessionRecovery(input, init, refreshSession)) as typeof globalThis.fetch,
        prepareSendMessagesRequest: async ({ messages, body }) => {
          await refreshSession().catch(() => false)
          return {
            body: {
              ...body,
              messages,
              ...(draftRef.current ? { draft: draftRef.current } : {}),
              ...(availableUnifiedSkills.length > 0 ? { available_unified_skills: availableUnifiedSkills } : {}),
            },
            headers: buildClientMutationHeaders(undefined, { includeIdempotencyKey: true }),
            credentials: 'same-origin',
          }
        },
      }),
    [availableUnifiedSkills, refreshSession, workspaceId],
  )

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
  } = useChat<ProjectBuilderUIMessage>({
    transport,
    dataPartSchemas: {
      'builder-progress': projectBuilderProgressSchema,
      'builder-artifact': projectBuilderArtifactSchema,
      'builder-result': projectBuilderStreamDataSchema,
    },
    onData: (part) => {
      if (part.type === 'data-builder-progress') {
        const data = part.data as ProjectBuilderProgress
        setProgress(data)
        setStatusLabel(data.status)
        logBuilderEvent('progress', {
          status: data.status,
          projectName: data.draft.project.name,
          elapsed_ms: activeSubmitStartedAtRef.current == null
            ? undefined
            : Math.round(performance.now() - activeSubmitStartedAtRef.current),
        })
        return
      }
      if (part.type === 'data-builder-artifact') {
        const data = part.data as ProjectBuilderArtifact
        setArtifactText((current) => data.reset ? data.chunk : `${current}${data.chunk}`)
        return
      }
      if (part.type !== 'data-builder-result') return
      const data = part.data as ProjectBuilderStreamData
      setProgress(null)
      setStatusLabel(null)
      setDraft(data.result.draft)
      setResult(data.result)
      setDecisionCards(data.decision_cards ?? [])
      setDismissedDecisionCardKeys([])
      setStageHint(data.stage_hint ?? 'create-agent')
      logBuilderEvent('result', {
        stageHint: data.stage_hint ?? 'create-agent',
        decisionCardKinds: (data.decision_cards ?? []).map((card) => card.kind),
        projectName: data.result.draft.project.name,
        suggestedIntegrations: data.result.suggested_integrations,
        elapsed_ms: activeSubmitStartedAtRef.current == null
          ? undefined
          : Math.round(performance.now() - activeSubmitStartedAtRef.current),
      })
      activeSubmitStartedAtRef.current = null
    },
    onError: (chatError) => {
      setStatusLabel(null)
      logBuilderEvent('error', {
        message: chatError instanceof Error ? chatError.message : String(chatError),
        elapsed_ms: activeSubmitStartedAtRef.current == null
          ? undefined
          : Math.round(performance.now() - activeSubmitStartedAtRef.current),
      })
      activeSubmitStartedAtRef.current = null
      toast.error(
        'Could not update setup',
        chatError instanceof Error ? chatError.message : 'Something went wrong.',
      )
    },
  })

  React.useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages)
    }
  }, [initialMessages, messages.length, setMessages])

  React.useEffect(() => {
    if (decisionCards.length === 0) {
      setDecisionAnchorMessageId(null)
      return
    }

    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant')
    const nextAnchorId = lastAssistantMessage?.id ?? null
    if (!nextAnchorId || nextAnchorId === decisionAnchorMessageId) return
    setDecisionAnchorMessageId(nextAnchorId)
  }, [decisionAnchorMessageId, decisionCards, messages])

  const submit = React.useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim()
    if (!text || status === 'submitted' || status === 'streaming') return null

    const submitStartedAt = performance.now()
    activeSubmitStartedAtRef.current = submitStartedAt
    setInput('')
    setStatusLabel(draftRef.current ? 'Updating setup...' : 'Creating agent...')
    const deterministicPreflight = classifyBuilderTurn({
      prompt: text,
      draft: draftRef.current,
    })
    if (!draftRef.current && (
      deterministicPreflight.type === 'config_change'
      || deterministicPreflight.type === 'clarification_answer'
    )) {
      void startTemplateSuggestion(text)
      const optimisticDraft = buildOptimisticBuilderDraft(text)
      setProgress({
        draft: optimisticDraft,
        blueprint: projectBlueprintFromDraft(optimisticDraft),
        status: 'Creating the first draft...',
      })
      logBuilderEvent('optimistic-draft', {
        projectName: optimisticDraft.project.name,
        elapsed_ms: Math.round(performance.now() - submitStartedAt),
      })
    }
    logBuilderEvent('submit:start', {
      text,
      hasDraft: Boolean(draftRef.current),
      status,
    })
    try {
      await sendMessage({ text })
      logBuilderEvent('submit:queued', {
        text,
        elapsed_ms: Math.round(performance.now() - submitStartedAt),
      })
      return true
    } catch (error) {
      setStatusLabel(null)
      activeSubmitStartedAtRef.current = null
      logBuilderEvent('submit:failed', {
        text,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      toast.error(
        'Could not update setup',
        error instanceof Error ? error.message : 'Something went wrong.',
      )
      return null
    }
  }, [input, logBuilderEvent, sendMessage, startTemplateSuggestion, status])

  const dismissDecisionCard = React.useCallback((card: BuilderDecisionCard) => {
    const key = getDecisionCardKey(card)
    setDismissedDecisionCardKeys((current) => current.includes(key) ? current : [...current, key])
    logBuilderEvent('decision-card:dismiss', {
      key,
      kind: card.kind,
    })
  }, [logBuilderEvent])

  const appendLocalAssistantMessage = React.useCallback((text: string, kind: 'generic' | 'step-bridge' = 'generic') => {
    const trimmed = text.trim()
    if (!trimmed) return
    setMessages((current) => [
      ...current,
      {
        id: `local-assistant-${kind}-${crypto.randomUUID()}`,
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: trimmed,
          },
        ],
      } as ProjectBuilderUIMessage,
    ])
    logBuilderEvent('assistant:local-message', {
      kind,
      text: trimmed,
    })
  }, [logBuilderEvent, setMessages])

  const removeLastLocalAssistantMessage = React.useCallback((kind?: 'generic' | 'step-bridge') => {
    setMessages((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const message = current[index]
        if (!isLocalBuilderAssistantMessage(message, kind)) continue
        const next = [...current]
        next.splice(index, 1)
        return next
      }
      return current
    })
    logBuilderEvent('assistant:local-message:removed', kind ? { kind } : {})
  }, [logBuilderEvent, setMessages])

  const reset = React.useCallback(() => {
    setMessages([])
    setInput('')
    setDraft(null)
    setResult(null)
    setDecisionCards([])
    setDismissedDecisionCardKeys([])
    setStageHint('create-agent')
    setProgress(null)
    setArtifactText('')
    setStatusLabel(null)
    setTemplateSuggestion(initialBuilderTemplateEnrichment)
    templateSuggestionRequestIdRef.current = null
    draftRef.current = undefined
  }, [setMessages])

  const updateDraft = React.useCallback((updater: (draft: GenerationDraft) => GenerationDraft) => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft
      const nextDraft = updater(currentDraft)
      draftRef.current = nextDraft
      setResult((currentResult) => currentResult ? {
        ...currentResult,
        draft: nextDraft,
        blueprint: projectBlueprintFromDraft(nextDraft),
      } : currentResult)
      return nextDraft
    })
  }, [])

  const visibleDecisionCards = React.useMemo(
    () => decisionCards.filter((card) => !dismissedDecisionCardKeys.includes(getDecisionCardKey(card))),
    [decisionCards, dismissedDecisionCardKeys],
  )

  return {
    messages,
    setMessages,
    input,
    setInput,
    draft,
    result,
    setResult,
    progress,
    statusLabel,
    artifactText,
    decisionCards: visibleDecisionCards,
    availableUnifiedSkills,
    templateSuggestion,
    refreshAvailableUnifiedSkills,
    stageHint,
    decisionAnchorMessageId,
    status,
    isLoading: status === 'submitted' || status === 'streaming',
    sendMessage: submit,
    dismissDecisionCard,
    appendLocalAssistantMessage,
    removeLastLocalAssistantMessage,
    reset,
    stop,
    error,
    updateDraft,
  }
}

function isLocalBuilderAssistantMessage(
  message: ProjectBuilderUIMessage,
  kind?: 'generic' | 'step-bridge',
): boolean {
  if (typeof message.id !== 'string' || !message.id.startsWith('local-assistant-')) {
    return false
  }
  return kind ? message.id.startsWith(`local-assistant-${kind}-`) : true
}

function getDecisionCardKey(card: BuilderDecisionCard): string {
  switch (card.kind) {
    case 'template_param':
      return `${card.kind}:${card.key}`
    case 'runtime_mode':
    case 'team_mode':
    case 'capability_multi_select':
    case 'configuration_panel':
    case 'clarification_select':
      return `${card.kind}:${card.title}`
  }
}
