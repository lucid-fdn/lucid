'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import type { RuntimeFeatureAccess } from '@/lib/access-control/types'

import { Button } from '@/components/ui/button'
import { AgentBuilderChat } from '@/components/projects/project-builder-chat-panel'
import { AgentBuilderFlowProvider, useAgentBuilderFlow, useOptionalAgentBuilderFlow } from '@/components/agent-builder/flow'
import { ProjectBuilderStageRail } from '@/components/projects/project-builder-stage-rail'
import { toast } from '@/hooks/use-toast'
import { useProjectBuilderChat } from '@/hooks/use-project-builder-chat'
import { useBuilderStage } from '@/hooks/use-builder-stage'
import { useRuntimes } from '@/hooks/use-runtimes'
import { createAgentFromBuilderDraft } from '@/lib/agent-builder/create-agent-from-builder-draft'
import type { CreateAgentFromBuilderDraftResult } from '@/lib/agent-builder/create-agent-from-builder-draft'
import {
  buildSelectedBuilderAppBindings,
  mapPendingConnectionsToBuilderRequirements,
} from '@/lib/agent-builder/connect-agent-apps'
import { runtimeModeToFlavor, validateRuntimeEngineSetup } from '@/lib/agent-builder/runtime-engine-validation'
import { applyTemplateParamsToDraft, projectBlueprintFromDraft, buildDraftFromTemplate } from '@/lib/ai/project-generation/draft'
import {
  convertDraftToAgent,
  convertDraftToTeam,
  getDraftCapabilities,
  setDraftCapabilities,
} from '@/lib/ai/project-generation/structure'
import { getMissingDraftRequiredInputs } from '@/lib/ai/project-generation/builder-requirements'
import type { BuilderDecisionCard, GeneratedBlueprintResult, GenerationDraft } from '@/lib/ai/project-generation/schemas'
import { getPendingBuilderConnections } from '@/lib/ai/project-generation/builder-step-utils'
import {
  buildBuilderAppliedStepMessage,
  buildBuilderSkipTransitionMessage,
  describeNextBuilderStep,
  describeSkippedBuilderStep,
  getBuilderConnectAppsMessage,
  getBuilderReadyMessage,
} from '@/lib/builder/state/builder-step-presenter'
import { isUserVisibleChannelType } from '@/lib/channels/types'
import type { ProjectBuilderUIMessage } from '@/lib/ai/project-generation/chat'

const AgentBuilderReviewPanel = dynamic(
  () => import('@/components/projects/project-builder-review-panel').then((mod) => mod.AgentBuilderReviewPanel),
  { loading: () => <BuilderPanelFallback /> },
)

const AgentBuilderConnectAppsDialog = dynamic(
  () => import('@/components/projects/project-builder-connect-apps-dialog').then((mod) => mod.AgentBuilderConnectAppsDialog),
)

export interface ProjectBuilderSessionPanelProps {
  workspaceId: string
  workspaceSlug: string
  catalogTemplates: TemplateCatalogEntry[]
  initialAvailableUnifiedSkills?: UnifiedSkillItem[]
  runtimeFeatureAccess?: RuntimeFeatureAccess
  initialPrompt?: string
  initialMessages?: ProjectBuilderUIMessage[]
  initialResult?: GeneratedBlueprintResult | null
  targetProjectId?: string | null
  targetProjectSlug?: string | null
  suppressTemplateSuggestion?: boolean
  onBack?: () => void
  onClose?: () => void
  onCreated?: (result: CreateAgentFromBuilderDraftResult) => void
  onCreateStart?: (context: { label: string; blueprint: unknown }) => void | Promise<void>
  onCreateConnecting?: () => void | Promise<void>
  onCreateCreating?: (raw: unknown) => void | Promise<void>
  onCreateFailed?: (error: unknown) => void
  createLabel?: string
}

export function ProjectBuilderSessionPanel(props: ProjectBuilderSessionPanelProps) {
  const existingFlow = useOptionalAgentBuilderFlow()
  const {
    workspaceId,
    workspaceSlug,
    targetProjectId = null,
    targetProjectSlug = null,
    initialPrompt = '',
    initialMessages = [],
    initialResult = null,
    catalogTemplates,
    initialAvailableUnifiedSkills = [],
    onCreated,
    onClose,
  } = props
  const flowConfig = React.useMemo(() => ({
    mode: targetProjectId && targetProjectSlug ? 'agent' as const : 'project-with-agent' as const,
    workspaceId,
    workspaceSlug,
    targetProjectId,
    targetProjectSlug,
    initialPrompt,
    initialDraft: initialResult?.draft ?? null,
    catalogTemplates,
    availableUnifiedSkills: initialAvailableUnifiedSkills,
    surface: targetProjectId && targetProjectSlug ? 'canvas_overlay' as const : 'page' as const,
    onCreated,
    onClose,
  }), [
    catalogTemplates,
    initialAvailableUnifiedSkills,
    initialPrompt,
    initialResult,
    onClose,
    onCreated,
    targetProjectId,
    targetProjectSlug,
    workspaceId,
    workspaceSlug,
  ])

  if (existingFlow) return <ProjectBuilderSessionPanelContent {...props} />

  return (
    <AgentBuilderFlowProvider config={flowConfig}>
      <ProjectBuilderSessionPanelContent {...props} />
    </AgentBuilderFlowProvider>
  )
}

function ProjectBuilderSessionPanelContent({
  workspaceId,
  workspaceSlug: _workspaceSlug,
  catalogTemplates,
  initialAvailableUnifiedSkills = [],
  runtimeFeatureAccess,
  initialPrompt = '',
  initialMessages = [],
  initialResult = null,
  targetProjectId = null,
  targetProjectSlug = null,
  suppressTemplateSuggestion = false,
  onBack,
  onClose,
  onCreated,
  onCreateStart,
  onCreateConnecting,
  onCreateCreating,
  onCreateFailed,
  createLabel = 'Create agent',
}: ProjectBuilderSessionPanelProps) {
  const [builderReviewTab, setBuilderReviewTab] = React.useState<'summary' | 'config'>('summary')
  const [activeBuilderPanel, setActiveBuilderPanel] = React.useState<'skills' | 'channels' | 'tasks' | 'engine' | 'runtime' | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [isConnectAppsDialogOpen, setIsConnectAppsDialogOpen] = React.useState(false)
  const [decisionSelectionBaselines, setDecisionSelectionBaselines] = React.useState<Record<string, {
    skills: string[]
    plugins: string[]
  }>>({})
  const [hasPostedBuilderReadyMessage, setHasPostedBuilderReadyMessage] = React.useState(false)
  const [hasPostedBuilderConnectAppsMessage, setHasPostedBuilderConnectAppsMessage] = React.useState(false)
  const [skippedBuilderConnectionKey, setSkippedBuilderConnectionKey] = React.useState<string | null>(null)
  const [optimisticConnectedProviderIds, setOptimisticConnectedProviderIds] = React.useState<Set<string>>(() => new Set())
  const [builderSelectedConnectionIdsByProvider, setBuilderSelectedConnectionIdsByProvider] = React.useState<Record<string, string>>({})
  const hasSubmittedInitialPromptRef = React.useRef(false)
  const builderFlow = useAgentBuilderFlow()
  const { runtimes: availableRuntimes } = useRuntimes(workspaceId, { live: false })

  const {
    messages: builderMessages,
    input: generationPrompt,
    setInput: setGenerationPrompt,
    draft: builderDraft,
    result: generatedResult,
    progress: builderProgress,
    statusLabel: builderStatusLabel,
    artifactText: builderArtifactText,
    decisionCards,
    availableUnifiedSkills,
    templateSuggestion,
    refreshAvailableUnifiedSkills,
    stageHint,
    decisionAnchorMessageId,
    status: builderStatus,
    isLoading: isGenerating,
    sendMessage: sendBuilderMessage,
    dismissDecisionCard,
    appendLocalAssistantMessage,
    stop: stopBuilderStream,
    updateDraft: updateGeneratedDraft,
  } = useProjectBuilderChat({
    workspaceId,
    catalogTemplates,
    initialMessages,
    initialResult,
    initialAvailableUnifiedSkills,
  })

  React.useEffect(() => {
    if (!initialPrompt.trim()) return
    setGenerationPrompt((current) => current || initialPrompt)
  }, [initialPrompt, setGenerationPrompt])

  React.useEffect(() => {
    if (!initialPrompt.trim() || hasSubmittedInitialPromptRef.current) return
    hasSubmittedInitialPromptRef.current = true
    void sendBuilderMessage(initialPrompt)
  }, [initialPrompt, sendBuilderMessage])

  const generatedBlueprint = React.useMemo(() => {
    if (!builderDraft) return null
    return projectBlueprintFromDraft(builderDraft)
  }, [builderDraft])
  const activeBlueprint = generatedBlueprint ?? builderProgress?.blueprint ?? null
  const currentBuilderDraft = builderDraft ?? builderProgress?.draft ?? null
  React.useEffect(() => {
    if (!currentBuilderDraft) return
    builderFlow.actions.patchDraft(currentBuilderDraft, activeBlueprint)
  }, [activeBlueprint, builderFlow.actions, currentBuilderDraft])
  const latestBuilderSummary = React.useMemo(
    () => generatedResult?.patch?.summary || generatedResult?.reasoning_summary || '',
    [generatedResult],
  )
  const suggestedBuilderTemplate = React.useMemo(() => {
    if (templateSuggestion.status !== 'ready' || !templateSuggestion.match?.slug) return null
    return catalogTemplates.find((template) => template.slug === templateSuggestion.match?.slug) ?? null
  }, [catalogTemplates, templateSuggestion.match?.slug, templateSuggestion.status])

  const generatedPreviewOverride = React.useMemo(() => {
    if (!generatedResult?.preview_spec) return undefined
    return {
      name: generatedResult.blueprint.items[0]?.name || generatedResult.selected_template?.name || generatedResult.draft.starterName || generatedResult.draft.project.name,
      spec: generatedResult.preview_spec,
    }
  }, [generatedResult])

  const generatedMissingRequiredInputs = React.useMemo(() => {
    const missingByKey = new Map<string, { key: string; label: string; reason: string }>()
    for (const item of generatedResult?.missing_required_inputs ?? []) {
      const value = builderDraft?.template?.params?.[item.key]
      if (!value?.trim()) missingByKey.set(item.key, item)
    }

    if (builderDraft?.mode === 'template' && builderDraft.template) {
      const template = catalogTemplates.find((candidate) => candidate.slug === builderDraft.template?.slug)
      for (const param of template?.params ?? []) {
        if (!param.required) continue
        const value = builderDraft.template.params[param.key]
        if (value?.trim()) continue
        missingByKey.set(param.key, {
          key: param.key,
          label: param.label,
          reason: param.hint ?? param.placeholder ?? `Set ${param.label}.`,
        })
      }
    }

    return Array.from(missingByKey.values())
  }, [builderDraft, catalogTemplates, generatedResult])
  const missingDraftRequiredInputs = React.useMemo(
    () => getMissingDraftRequiredInputs(currentBuilderDraft),
    [currentBuilderDraft],
  )
  const missingBuilderRequiredInputs = React.useMemo(
    () => [...generatedMissingRequiredInputs, ...missingDraftRequiredInputs],
    [generatedMissingRequiredInputs, missingDraftRequiredInputs],
  )

  const builderStage = useBuilderStage({
    result: generatedResult,
    decisionCards,
    activeTab: builderReviewTab,
    initialStage: stageHint,
    isCreating,
  })

  const rawPendingBuilderConnections = React.useMemo(
    () => getPendingBuilderConnections(currentBuilderDraft, availableUnifiedSkills),
    [availableUnifiedSkills, currentBuilderDraft],
  )
  const pendingBuilderConnections = React.useMemo(
    () => rawPendingBuilderConnections.filter((connection) => !optimisticConnectedProviderIds.has(connection.providerId)),
    [optimisticConnectedProviderIds, rawPendingBuilderConnections],
  )
  const pendingBuilderConnectionKey = React.useMemo(
    () => pendingBuilderConnections.map((connection) => `${connection.providerId}:${connection.slug}`).join('|'),
    [pendingBuilderConnections],
  )
  const hasSkippedBuilderConnectionStep = Boolean(
    pendingBuilderConnectionKey && skippedBuilderConnectionKey === pendingBuilderConnectionKey,
  )
  React.useEffect(() => {
    builderFlow.actions.setConnectionRequirements(mapPendingConnectionsToBuilderRequirements(pendingBuilderConnections))
  }, [builderFlow.actions, pendingBuilderConnections])
  const selectedAppBindings = React.useMemo(() => {
    return buildSelectedBuilderAppBindings({
      draft: currentBuilderDraft,
      availableUnifiedSkills,
      selectedConnectionIdsByProvider: builderSelectedConnectionIdsByProvider,
    })
  }, [availableUnifiedSkills, builderSelectedConnectionIdsByProvider, currentBuilderDraft])
  const runtimeValidation = React.useMemo(() => validateRuntimeEngineSetup({
    runtime: currentBuilderDraft?.runtime ?? { mode: 'shared', engine: 'openclaw' },
    runtimes: availableRuntimes,
    selectedSkills: availableUnifiedSkills.filter((item) => {
      const selectedCapabilities = currentBuilderDraft
        ? getDraftCapabilities(currentBuilderDraft)
        : { skills: [], plugins: [] }
      const selectedSkills = new Set(selectedCapabilities.skills)
      const selectedPlugins = new Set(selectedCapabilities.plugins)
      return selectedSkills.has(item.slug) || selectedPlugins.has(item.slug)
    }),
    runtimeFeatureAccess,
  }), [availableRuntimes, availableUnifiedSkills, currentBuilderDraft, runtimeFeatureAccess])

  React.useEffect(() => {
    if (!currentBuilderDraft) return
    const selectedCapabilities = getDraftCapabilities(currentBuilderDraft)

    setDecisionSelectionBaselines((current) => {
      const next: Record<string, { skills: string[]; plugins: string[] }> = {}
      let changed = false
      for (const card of decisionCards) {
        if (card.kind !== 'capability_multi_select') continue
        const key = getDecisionCardKey(card)
        if (current[key]) {
          next[key] = current[key]
          continue
        }

        const skillOptions = card.options.filter((option) => option.item_type === 'skill').map((option) => option.slug)
        const pluginOptions = card.options.filter((option) => option.item_type === 'plugin').map((option) => option.slug)
        next[key] = {
          skills: selectedCapabilities.skills.filter((slug) => skillOptions.includes(slug)),
          plugins: selectedCapabilities.plugins.filter((slug) => pluginOptions.includes(slug)),
        }
        changed = true
      }
      return changed || Object.keys(current).length !== Object.keys(next).length ? next : current
    })
  }, [currentBuilderDraft, decisionCards])

  React.useEffect(() => {
    setHasPostedBuilderConnectAppsMessage(false)
  }, [pendingBuilderConnectionKey])

  React.useEffect(() => {
    if (isGenerating || builderProgress || !generatedResult || !builderDraft?.agent) return

    if (decisionCards.length === 0) {
      if (pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep) {
        if (!hasPostedBuilderConnectAppsMessage) {
          appendLocalAssistantMessage(getBuilderConnectAppsMessage())
          setHasPostedBuilderConnectAppsMessage(true)
        }
        if (hasPostedBuilderReadyMessage) setHasPostedBuilderReadyMessage(false)
        return
      }

      if (isConnectAppsDialogOpen) return

      if (!hasPostedBuilderReadyMessage) {
        appendLocalAssistantMessage(getBuilderReadyMessage())
        setHasPostedBuilderReadyMessage(true)
      }
      return
    }

    if (hasPostedBuilderReadyMessage) setHasPostedBuilderReadyMessage(false)

    for (const card of decisionCards) {
      if (!isBuilderDecisionResolved(card, builderDraft)) continue
      dismissDecisionCard(card)
      return
    }
  }, [
    appendLocalAssistantMessage,
    builderDraft,
    builderProgress,
    decisionCards,
    dismissDecisionCard,
    generatedResult,
    hasPostedBuilderConnectAppsMessage,
    hasPostedBuilderReadyMessage,
    hasSkippedBuilderConnectionStep,
    isConnectAppsDialogOpen,
    isGenerating,
    pendingBuilderConnections.length,
  ])

  const handleBuilderDecisionSelect = React.useCallback((card: BuilderDecisionCard, optionId: string) => {
    if (card.kind === 'clarification_select') {
      const option = card.options.find((candidate) => candidate.id === optionId)
      if (!option) return
      dismissDecisionCard(card)
      void sendBuilderMessage(option.submit_message)
      return
    }

    if (card.kind === 'configuration_panel') {
      if (card.panel === 'tasks' && optionId === 'apply-suggested' && card.suggested_schedule) {
        const currentIndex = decisionCards.findIndex((candidate) => getDecisionCardKey(candidate) === getDecisionCardKey(card))
        const nextCard = currentIndex >= 0 ? decisionCards[currentIndex + 1] : undefined
        updateGeneratedDraft((current) => {
          if (!current.agent) return current
          const normalizedSuggestedSchedule = {
            cron: card.suggested_schedule?.cron ?? '0 9 * * 1-5',
            prompt: card.suggested_schedule?.prompt ?? 'Run the scheduled task and return a concise update.',
            description: card.suggested_schedule?.description ?? 'Scheduled review',
            optional: false,
          }
          const existingSchedules = current.agent.default_schedules ?? []
          return {
            ...current,
            agent: {
              ...current.agent,
              default_schedules: [...existingSchedules, normalizedSuggestedSchedule],
            },
          }
        })
        if (!nextCard && (pendingBuilderConnections.length === 0 || hasSkippedBuilderConnectionStep)) setHasPostedBuilderReadyMessage(true)
        if (!nextCard && pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep) setHasPostedBuilderConnectAppsMessage(true)
        dismissDecisionCard(card)
        appendLocalAssistantMessage(
          nextCard
            ? buildBuilderAppliedStepMessage('suggested-schedule', nextCard)
            : pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep
              ? `I added the suggested schedule. ${getBuilderConnectAppsMessage()}`
              : buildBuilderAppliedStepMessage('suggested-schedule', nextCard),
          'step-bridge',
        )
        return
      }

      setActiveBuilderPanel(optionId as 'channels' | 'tasks' | 'engine')
      return
    }

    if (card.kind === 'runtime_mode') {
      updateGeneratedDraft((current) => ({
        ...current,
        runtime: {
          ...(current.runtime ?? {}),
          mode: optionId as 'shared' | 'dedicated' | 'byo',
        },
      }))
      void sendBuilderMessage(`Use ${optionId} runtime.`)
      return
    }

    if (card.kind === 'team_mode') {
      updateGeneratedDraft((current) => (
        optionId === 'team' ? convertDraftToTeam(current) : convertDraftToAgent(current)
      ))
      return
    }

    if (card.kind === 'capability_multi_select') {
      const option = card.options.find((candidate) => candidate.id === optionId)
      if (!option) return
      updateGeneratedDraft((current) => ({
        ...setDraftCapabilities(current, {
          skills: option.item_type === 'skill'
            ? toggleValue(getDraftCapabilities(current).skills, option.slug) ?? []
            : getDraftCapabilities(current).skills,
          plugins: option.item_type === 'plugin'
            ? toggleValue(getDraftCapabilities(current).plugins, option.slug) ?? []
            : getDraftCapabilities(current).plugins,
        }),
      }))
    }
  }, [
    appendLocalAssistantMessage,
    decisionCards,
    dismissDecisionCard,
    hasSkippedBuilderConnectionStep,
    pendingBuilderConnections.length,
    sendBuilderMessage,
    updateGeneratedDraft,
  ])

  const handleBuilderDecisionContinue = React.useCallback((card: BuilderDecisionCard) => {
    const currentIndex = decisionCards.findIndex((candidate) => getDecisionCardKey(candidate) === getDecisionCardKey(card))
    const nextCard = currentIndex >= 0 ? decisionCards[currentIndex + 1] : undefined
    if (!nextCard && (pendingBuilderConnections.length === 0 || hasSkippedBuilderConnectionStep)) setHasPostedBuilderReadyMessage(true)
    if (!nextCard && pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep) setHasPostedBuilderConnectAppsMessage(true)
    appendLocalAssistantMessage(
      nextCard
        ? `${describeCompletedBuilderStep(card)} ${describeNextBuilderStep(nextCard)}`
        : pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep
          ? `${describeCompletedBuilderStep(card)} ${getBuilderConnectAppsMessage()}`
          : getBuilderReadyMessage(),
      'step-bridge',
    )
    dismissDecisionCard(card)
  }, [
    appendLocalAssistantMessage,
    decisionCards,
    dismissDecisionCard,
    hasSkippedBuilderConnectionStep,
    pendingBuilderConnections.length,
  ])

  const handleBuilderDecisionApplyInput = React.useCallback((card: BuilderDecisionCard, value: string) => {
    if (card.kind !== 'template_param') {
      void sendBuilderMessage(value)
      return
    }

    const currentIndex = decisionCards.findIndex((candidate) => getDecisionCardKey(candidate) === getDecisionCardKey(card))
    const nextCard = currentIndex >= 0 ? decisionCards[currentIndex + 1] : undefined

    updateGeneratedDraft((current) => {
      if (current.mode !== 'template' || !current.template) return current
      const template = catalogTemplates.find((candidate) => candidate.slug === current.template?.slug)
      const params = {
        ...current.template.params,
        [card.key]: value,
      }
      return template
        ? applyTemplateParamsToDraft(current, template, params)
        : {
            ...current,
            template: {
              ...current.template,
              params,
            },
          }
    })

    dismissDecisionCard(card)
    if (!nextCard && (pendingBuilderConnections.length === 0 || hasSkippedBuilderConnectionStep)) setHasPostedBuilderReadyMessage(true)
    if (!nextCard && pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep) setHasPostedBuilderConnectAppsMessage(true)
    appendLocalAssistantMessage(
      nextCard
        ? `I set ${card.label.toLowerCase()}. ${describeNextBuilderStep(nextCard)}`
        : pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep
          ? `I set ${card.label.toLowerCase()}. ${getBuilderConnectAppsMessage()}`
          : getBuilderReadyMessage(),
      'step-bridge',
    )
  }, [
    appendLocalAssistantMessage,
    catalogTemplates,
    decisionCards,
    dismissDecisionCard,
    hasSkippedBuilderConnectionStep,
    pendingBuilderConnections.length,
    sendBuilderMessage,
    updateGeneratedDraft,
  ])

  const handleBuilderDecisionSkip = React.useCallback((card: BuilderDecisionCard) => {
    const currentIndex = decisionCards.findIndex((candidate) => getDecisionCardKey(candidate) === getDecisionCardKey(card))
    const nextCard = currentIndex >= 0 ? decisionCards[currentIndex + 1] : undefined

    if (card.kind === 'capability_multi_select') {
      const baseline = decisionSelectionBaselines[getDecisionCardKey(card)]
      updateGeneratedDraft((current) => {
        const skillOptions = new Set(card.options.filter((option) => option.item_type === 'skill').map((option) => option.slug))
        const pluginOptions = new Set(card.options.filter((option) => option.item_type === 'plugin').map((option) => option.slug))
        const capabilities = getDraftCapabilities(current)
        return setDraftCapabilities(current, {
          skills: [
            ...capabilities.skills.filter((slug) => !skillOptions.has(slug)),
            ...((baseline?.skills ?? []).filter((slug) => skillOptions.has(slug))),
          ],
          plugins: [
            ...capabilities.plugins.filter((slug) => !pluginOptions.has(slug)),
            ...((baseline?.plugins ?? []).filter((slug) => pluginOptions.has(slug))),
          ],
        })
      })
    }

    if (!nextCard && (pendingBuilderConnections.length === 0 || hasSkippedBuilderConnectionStep)) setHasPostedBuilderReadyMessage(true)
    if (!nextCard && pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep) setHasPostedBuilderConnectAppsMessage(true)
    appendLocalAssistantMessage(
      nextCard
        ? buildBuilderSkipTransitionMessage(card, nextCard)
        : pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep
          ? `${describeSkippedBuilderStep(card)} ${getBuilderConnectAppsMessage()}`
          : buildBuilderSkipTransitionMessage(card, nextCard),
      'step-bridge',
    )
    dismissDecisionCard(card)
  }, [
    appendLocalAssistantMessage,
    decisionCards,
    decisionSelectionBaselines,
    dismissDecisionCard,
    hasSkippedBuilderConnectionStep,
    pendingBuilderConnections.length,
    updateGeneratedDraft,
  ])

  const handleSkipConnectApps = React.useCallback(() => {
    if (!pendingBuilderConnectionKey) return
    for (const connection of pendingBuilderConnections) {
      builderFlow.actions.skipConnection(connection.providerId)
    }
    setSkippedBuilderConnectionKey(pendingBuilderConnectionKey)
    setHasPostedBuilderConnectAppsMessage(true)
    setHasPostedBuilderReadyMessage(true)
    appendLocalAssistantMessage(getBuilderReadyMessage(), 'step-bridge')
  }, [appendLocalAssistantMessage, builderFlow.actions, pendingBuilderConnectionKey, pendingBuilderConnections])

  const handleConnectAppsComplete = React.useCallback(() => {
    setOptimisticConnectedProviderIds((current) => {
      const next = new Set(current)
      for (const connection of pendingBuilderConnections) next.add(connection.providerId)
      return next
    })
    setHasPostedBuilderConnectAppsMessage(true)
    if (hasPostedBuilderReadyMessage) return
    setHasPostedBuilderReadyMessage(true)
    appendLocalAssistantMessage(getBuilderReadyMessage(), 'step-bridge')
  }, [appendLocalAssistantMessage, hasPostedBuilderReadyMessage, pendingBuilderConnections])

  const handleBuilderAppConnected = React.useCallback((providerId: string) => {
    builderFlow.actions.markConnectionCompleted(providerId)
    setOptimisticConnectedProviderIds((current) => {
      const next = new Set(current)
      next.add(providerId)
      return next
    })
    return refreshAvailableUnifiedSkills({ force: true })
  }, [builderFlow.actions, refreshAvailableUnifiedSkills])

  const handleCreate = React.useCallback(async () => {
    if (!activeBlueprint) return
    if (missingBuilderRequiredInputs.length > 0) {
      toast.error('Complete required details', `Add ${missingBuilderRequiredInputs.map((input) => input.label).join(', ')} before creating.`)
      return
    }

    try {
      setIsCreating(true)
      builderFlow.actions.markDeployStarted(currentBuilderDraft?.starterName || currentBuilderDraft?.project.name || 'Agent')
      const result = await createAgentFromBuilderDraft({
        workspaceId,
        blueprint: activeBlueprint,
        targetProjectId,
        targetProjectSlug,
        appBindings: selectedAppBindings,
        beforeDeploy: async () => {
          const runtime = currentBuilderDraft?.runtime
          if (runtime?.runtime_id) {
            const csrf = typeof document === 'undefined'
              ? null
              : document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? null
            const runtimeFlavor = runtimeModeToFlavor(runtime.mode)
            const res = await fetch(`/api/runtimes/${runtime.runtime_id}?org_id=${encodeURIComponent(workspaceId)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'x-csrf-token': csrf } : {}),
              },
              body: JSON.stringify({
                engine: runtime.engine,
                runtimeFlavor: runtimeFlavor === 'shared' ? undefined : runtimeFlavor,
                channelOwnership: runtime.channel_ownership,
                autoUpdatePolicy: runtime.maintenance?.auto_update_policy,
                runtimeBootstrapConfig: {
                  advanced: {
                    ...(runtime.network ? { network: runtime.network } : {}),
                    ...(runtime.limits ? { limits: runtime.limits } : {}),
                    ...(runtime.maintenance ? { maintenance: runtime.maintenance } : {}),
                    ...(runtime.model ? { model: runtime.model } : {}),
                  },
                },
              }),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to update runtime configuration')
            }
          }
          await onCreateStart?.({
              label: currentBuilderDraft?.starterName || currentBuilderDraft?.project.name || 'Agent',
              blueprint: activeBlueprint,
            })
        },
        onConnecting: async () => {
          builderFlow.actions.markDeployProgress('connecting')
          await onCreateConnecting?.()
        },
        onCreating: async (raw) => {
          builderFlow.actions.markDeployProgress('creating')
          await onCreateCreating?.(raw)
        },
      })
      builderFlow.actions.markDeployCreated(result)
      onCreated?.(result)
    } catch (error) {
      builderFlow.actions.markDeployFailed(error)
      onCreateFailed?.(error)
      toast.error('Could not create project', error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setIsCreating(false)
    }
  }, [
    activeBlueprint,
    builderFlow.actions,
    currentBuilderDraft?.project.name,
    currentBuilderDraft?.runtime,
    currentBuilderDraft?.starterName,
    missingBuilderRequiredInputs,
    onCreateConnecting,
    onCreateCreating,
    onCreateFailed,
    onCreateStart,
    onCreated,
    selectedAppBindings,
    targetProjectId,
    targetProjectSlug,
    workspaceId,
  ])

  const handleBuilderSuggestedTemplateApply = React.useCallback((templateSlug: string) => {
    const template = catalogTemplates.find((candidate) => candidate.slug === templateSlug)
    if (!template) return
    updateGeneratedDraft((current) => {
      const params = Object.fromEntries(template.params.map((param) => [param.key, param.default ?? '']))
      return buildDraftFromTemplate(template, {
        prompt: current.sourcePrompt,
        projectName: current.project.name,
        projectDescription: current.project.description,
        runtime: current.runtime,
        params,
      })
    })
    setBuilderReviewTab('summary')
    appendLocalAssistantMessage(`I applied the ${template.name} template. Review the setup on the right before creating.`, 'step-bridge')
  }, [appendLocalAssistantMessage, catalogTemplates, updateGeneratedDraft])

  const createDisabled = isCreating
    || !activeBlueprint
    || missingBuilderRequiredInputs.length > 0
    || (pendingBuilderConnections.length > 0 && !hasSkippedBuilderConnectionStep)
    || runtimeValidation.blockingIssues.length > 0
  const isBuilderReadyForCreate = Boolean(currentBuilderDraft)
    && decisionCards.length === 0
    && missingBuilderRequiredInputs.length === 0
    && (pendingBuilderConnections.length === 0 || hasSkippedBuilderConnectionStep)
    && runtimeValidation.blockingIssues.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card/95 text-card-foreground">
      <div className="flex shrink-0 items-center gap-3 px-6 pt-6">
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
            Back
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <ProjectBuilderStageRail stage={builderStage} />
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Close
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden gap-0 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="h-full min-h-0 overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
          <AgentBuilderChat
            messages={builderMessages}
            input={generationPrompt}
            onInputChange={setGenerationPrompt}
            onSubmit={(message) => { void sendBuilderMessage(message) }}
            onStop={stopBuilderStream}
            onDecisionSubmit={(message) => { void sendBuilderMessage(message) }}
            onDecisionSelect={handleBuilderDecisionSelect}
            onDecisionContinue={handleBuilderDecisionContinue}
            onDecisionSkip={handleBuilderDecisionSkip}
            onDecisionApplyInput={handleBuilderDecisionApplyInput}
            onDecisionBrowse={(card) => {
              if (card.kind === 'capability_multi_select') setActiveBuilderPanel('skills')
            }}
            decisionCards={decisionCards}
            draft={currentBuilderDraft}
            availableUnifiedSkills={availableUnifiedSkills}
            pendingConnectionsCount={pendingBuilderConnections.length}
            hasSkippedPendingConnections={hasSkippedBuilderConnectionStep}
            decisionAnchorMessageId={decisionAnchorMessageId}
            status={builderStatus}
            isLoading={isGenerating}
            progressStatus={builderStatusLabel ?? builderProgress?.status ?? null}
            onOpenConnectApps={() => setIsConnectAppsDialogOpen(true)}
            onSkipConnectApps={handleSkipConnectApps}
            isReadyToCreate={isBuilderReadyForCreate}
            onCreate={() => { void handleCreate() }}
            createLabel={createLabel}
            createDisabled={createDisabled}
          />
        </div>

        <div className="h-full min-h-0 overflow-y-auto p-6">
          <AgentBuilderReviewPanel
            workspaceId={workspaceId}
            blueprint={activeBlueprint}
            result={generatedResult}
            progressDraft={builderProgress?.draft ?? null}
            progressBlueprint={builderProgress?.blueprint ?? null}
            progressStatus={builderProgress?.status ?? null}
            artifactText={builderArtifactText}
            latestSummary={latestBuilderSummary}
            missingRequiredInputsCount={missingBuilderRequiredInputs.length}
            missingRequiredInputLabels={missingBuilderRequiredInputs.map((input) => input.label)}
            pendingConnectionsCount={pendingBuilderConnections.length}
            availableUnifiedSkills={availableUnifiedSkills}
            availableRuntimes={availableRuntimes}
            runtimeFeatureAccess={runtimeFeatureAccess}
            catalogTemplates={catalogTemplates}
            suggestedTemplate={suggestedBuilderTemplate}
            templateSuggestionStatus={templateSuggestion.status}
            suppressTemplateSuggestion={suppressTemplateSuggestion}
            previewOverride={generatedPreviewOverride}
            activeTab={builderReviewTab}
            activeBuilderPanel={activeBuilderPanel}
            isCreating={isCreating}
            createDisabled={createDisabled}
            onCreate={() => { void handleCreate() }}
            onOpenConnectApps={() => setIsConnectAppsDialogOpen(true)}
            onSkipConnectApps={handleSkipConnectApps}
            onActiveTabChange={setBuilderReviewTab}
            onActiveBuilderPanelChange={setActiveBuilderPanel}
            onUseTemplate={handleBuilderSuggestedTemplateApply}
            onUpdateDraft={updateGeneratedDraft}
          />
        </div>
      </div>

      <AgentBuilderConnectAppsDialog
        open={isConnectAppsDialogOpen}
        onOpenChange={setIsConnectAppsDialogOpen}
        orgId={workspaceId}
        pendingConnections={pendingBuilderConnections}
        onConnected={handleBuilderAppConnected}
        onConnectionSelected={(providerId, connectionRowId) => {
          setBuilderSelectedConnectionIdsByProvider((current) => ({
            ...current,
            [providerId]: connectionRowId,
          }))
        }}
        onAllConnected={handleConnectAppsComplete}
      />
    </div>
  )
}

export const AgentBuilderSessionPanel = ProjectBuilderSessionPanel
export type AgentBuilderSessionPanelProps = ProjectBuilderSessionPanelProps

function BuilderPanelFallback() {
  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-background/40 p-4">
      <div className="h-5 w-36 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-10 animate-pulse rounded bg-muted/70" />
        <div className="h-10 animate-pulse rounded bg-muted/70" />
        <div className="h-10 animate-pulse rounded bg-muted/70" />
      </div>
    </div>
  )
}

function toggleValue(values: string[] | undefined, value: string): string[] | undefined {
  const next = new Set(values ?? [])
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next.size > 0 ? Array.from(next) : undefined
}

function getDecisionCardKey(card: BuilderDecisionCard): string {
  if (card.kind === 'template_param') return `${card.kind}:${card.key}`
  return `${card.kind}:${card.title}`
}

function isBuilderDecisionResolved(card: BuilderDecisionCard, draft: GenerationDraft): boolean {
  const agent = draft.agent
  switch (card.kind) {
    case 'capability_multi_select':
      return false
    case 'configuration_panel':
      if (card.panel === 'tasks') {
        return [
          ...(agent?.default_schedules ?? []),
          ...(draft.team?.members.flatMap((member) => member.default_schedules ?? []) ?? []),
        ].some((schedule) => !schedule.optional)
      }
      if (card.panel === 'channels') {
        return [
          ...(agent?.channel_hints ?? []),
          ...(draft.team?.channel_hints ?? []),
        ].some((channel) => channel.required && isUserVisibleChannelType(channel.channel_type))
      }
      return false
    case 'runtime_mode':
      return Boolean(draft.runtime?.mode)
    case 'team_mode':
      return draft.mode === 'blank-agent' || draft.mode === 'blank-team'
    case 'clarification_select':
    case 'template_param':
      return false
  }
}

function describeCompletedBuilderStep(card: BuilderDecisionCard): string {
  if (card.kind === 'capability_multi_select') return 'I kept the selected tools in the setup.'
  if (card.kind === 'configuration_panel') {
    if (card.panel === 'channels') return 'I kept the selected channels in the setup.'
    if (card.panel === 'tasks') return 'I kept the schedule setup.'
  }
  return 'I kept the current selection.'
}
