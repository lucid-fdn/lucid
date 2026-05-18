'use client'

import * as React from 'react'
import type { AgentTemplateSpec, TeamTemplateSpec, TemplateCatalogEntry } from '@contracts/template'
import type { ProjectBlueprint } from '@contracts/project-blueprint'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { ChevronDown } from 'lucide-react'

import { BuildSummaryRows } from '@/components/assistant/build-summary-rows'
import { AgentRuntimeEnginePanel } from '@/components/assistant/agent-runtime-engine-panel'
import { AssistantChannelsPanel } from '@/components/assistant/assistant-channels-panel'
import { ConfigSectionDialog } from '@/components/assistant/config-section-dialog'
import {
  mapChannelHintsToSummaryItems,
  mapScheduleHintsToSummaryItems,
  mapUnifiedSkillsToSummaryItems,
  type SummarySkillItem,
} from '@/components/assistant/view-models'
import { AgentTasksPanel } from '@/components/mission-control/agents/agent-tasks-panel'
import { ProjectBuilderConfigCodeBlock } from '@/components/projects/project-builder-config-code-block'
import { BuilderStructurePanel } from '@/components/projects/builder-structure-panel'
import { UnifiedSkillManager } from '@/components/skills/unified-skill-manager'
import { TemplateCard } from '@/components/templates/template-card'
import { buildScheduleTaskDraftSeed } from '@/lib/assistants/schedule-task-defaults'
import { validateRuntimeEngineSetup } from '@/lib/agent-builder/runtime-engine-validation'
import { getRuntimeModePresentation } from '@/lib/engines/presentation'
import { resolveRuntimeProviderForMode } from '@/lib/runtimes/runtime-provider-selection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix-tabs'
import { Textarea } from '@/components/ui/textarea'
import { applyTemplateParamsToDraft, generationDraftFromBlueprint } from '@/lib/ai/project-generation/draft'
import {
  getDraftCapabilities,
  setDraftCapabilities,
} from '@/lib/ai/project-generation/structure'
import type { BuilderAsyncStatus } from '@/lib/builder/state/builder-state'
import {
  parseProjectBlueprint,
  serializeProjectBlueprint,
  type BlueprintConfigFormat,
} from '@/lib/projects/blueprint-serialization'
import { buildBuilderConfigBlueprint } from '@/lib/projects/builder-config-blueprint'
import type { DedicatedRuntime, ScheduledTask } from '@/lib/mission-control/types'
import type { RuntimeFeatureAccess } from '@/lib/access-control/types'
import type { GeneratedBlueprintResult, GenerationDraft } from '@/lib/ai/project-generation/schemas'

export interface ProjectBuilderReviewPanelProps {
  workspaceId: string
  blueprint: ProjectBlueprint | null
  result: GeneratedBlueprintResult | null
  progressDraft?: GenerationDraft | null
  progressBlueprint?: ProjectBlueprint | null
  progressStatus?: string | null
  artifactText?: string
  latestSummary: string
  missingRequiredInputsCount: number
  missingRequiredInputLabels?: string[]
  pendingConnectionsCount?: number
  availableUnifiedSkills?: UnifiedSkillItem[]
  availableRuntimes?: DedicatedRuntime[]
  runtimeFeatureAccess?: RuntimeFeatureAccess | null
  previewOverride?: {
    name: string
    spec: AgentTemplateSpec | TeamTemplateSpec
  }
  catalogTemplates?: TemplateCatalogEntry[]
  suggestedTemplate?: TemplateCatalogEntry | null
  templateSuggestionStatus?: BuilderAsyncStatus
  suppressTemplateSuggestion?: boolean
  activeTab?: 'summary' | 'config'
  activeBuilderPanel?: 'skills' | 'channels' | 'tasks' | 'engine' | 'runtime' | null
  isCreating?: boolean
  createDisabled?: boolean
  onCreate: () => void
  onOpenConnectApps?: () => void
  onSkipConnectApps?: () => void
  onActiveTabChange?: (tab: 'summary' | 'config') => void
  onActiveBuilderPanelChange?: (panel: 'skills' | 'channels' | 'tasks' | 'engine' | 'runtime' | null) => void
  onUseTemplate?: (templateSlug: string) => void
  onUpdateDraft: (updater: (draft: GenerationDraft) => GenerationDraft) => void
}

export function ProjectBuilderReviewPanel({
  workspaceId,
  blueprint,
  result,
  progressDraft = null,
  progressBlueprint = null,
  progressStatus = null,
  missingRequiredInputsCount,
  missingRequiredInputLabels = [],
  pendingConnectionsCount = 0,
  availableUnifiedSkills = [],
  availableRuntimes = [],
  runtimeFeatureAccess = null,
  catalogTemplates = [],
  suggestedTemplate = null,
  templateSuggestionStatus = 'idle',
  suppressTemplateSuggestion = false,
  activeTab: controlledActiveTab,
  activeBuilderPanel: controlledActiveBuilderPanel,
  isCreating = false,
  createDisabled = false,
  onCreate,
  onOpenConnectApps,
  onSkipConnectApps,
  onActiveTabChange,
  onActiveBuilderPanelChange,
  onUseTemplate,
  onUpdateDraft,
}: ProjectBuilderReviewPanelProps) {
  const hasCanonicalResult = Boolean(result)
  const draft = result?.draft
  const builderEngine = draft?.runtime?.engine ?? 'openclaw'
  const runtimePresentation = getRuntimeModePresentation({
    runtimeFlavor: draft?.runtime?.mode === 'byo'
      ? 'c2a_autonomous'
      : draft?.runtime?.mode === 'dedicated'
        ? 'c1_managed'
        : 'shared',
    runtimeTier: draft?.runtime?.mode === 'byo' ? 'byo' : draft?.runtime?.mode === 'dedicated' ? 'dedicated' : null,
    runtimeProvider: draft?.runtime?.provider ?? null,
  })
  const effectiveBlueprint = result ? blueprint : null
  const configBlueprint = React.useMemo(
    () => buildBuilderConfigBlueprint(effectiveBlueprint, draft),
    [draft, effectiveBlueprint],
  )
  const progressPreviewBlueprint = !result ? progressBlueprint : null
  const isBlocked = missingRequiredInputsCount > 0
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = React.useState<'summary' | 'config'>('summary')
  const [configFormat, setConfigFormat] = React.useState<BlueprintConfigFormat>('yaml')
  const [configError, setConfigError] = React.useState<string | null>(null)
  const [configSaveState, setConfigSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [uncontrolledActiveBuilderPanel, setUncontrolledActiveBuilderPanel] = React.useState<'skills' | 'channels' | 'tasks' | 'engine' | 'runtime' | null>(null)
  const [dismissedTemplateSlug, setDismissedTemplateSlug] = React.useState<string | null>(null)
  const activeTab = controlledActiveTab ?? uncontrolledActiveTab
  const activeBuilderPanel = controlledActiveBuilderPanel ?? uncontrolledActiveBuilderPanel
  const createBuilderScheduleTask = React.useCallback((index: number): ScheduledTask => {
    const now = new Date().toISOString()
    const seed = buildScheduleTaskDraftSeed({
      projectName: draft?.project.name,
      projectDescription: draft?.project.description,
      systemPrompt: draft?.agent?.system_prompt ?? draft?.team?.objective,
      skills: draft ? getDraftCapabilities(draft).skills : [],
      plugins: draft ? getDraftCapabilities(draft).plugins : [],
      channelHints: draft?.agent?.channel_hints ?? draft?.team?.channel_hints ?? [],
    })

    return {
      id: `builder-task:new:${crypto.randomUUID()}`,
      assistant_id: 'builder-draft',
      org_id: 'builder-draft',
      name: seed.name,
      description: seed.description,
      task_prompt: seed.prompt,
      cron_expression: seed.cron,
      timezone: 'UTC',
      run_at: null,
      status: 'pending',
      last_run_at: null,
      last_error: null,
      next_run_at: null,
      run_count: 0,
      retry_count: 0,
      max_retries: 0,
      enabled: true,
      webhook_url: null,
      created_at: now,
      updated_at: now,
    }
  }, [
    draft?.agent?.system_prompt,
    draft?.project.description,
    draft?.project.name,
    draft?.team?.channel_hints,
    draft?.team?.members,
    draft?.team?.objective,
  ])
  const summarySpec = React.useMemo(() => getDraftSummarySpec(draft), [draft])
  const summarySkills = React.useMemo(() => {
    const selected = new Set(summarySpec.skills)
    const selectedPlugins = new Set(summarySpec.plugins)
    const mapped = mapUnifiedSkillsToSummaryItems(availableUnifiedSkills
      .filter((item) => selected.has(item.slug) || selectedPlugins.has(item.slug))
      .map((item) => ({ ...item, installed: true, is_active: true })))
    const mappedSlugs = new Set(mapped.map((item) => item.slug))
    const fallbacks: SummarySkillItem[] = [...summarySpec.skills, ...summarySpec.plugins]
      .filter((slug) => slug && !mappedSlugs.has(slug))
      .map((slug) => ({
        id: `template-capability:${slug}`,
        slug,
        label: humanizeCapabilitySlug(slug),
        installed: true,
        isActive: true,
      }))
    return [...mapped, ...fallbacks]
  }, [availableUnifiedSkills, summarySpec.plugins, summarySpec.skills])
  const summaryChannels = React.useMemo(
    () => mapChannelHintsToSummaryItems(summarySpec.channelHints),
    [summarySpec.channelHints],
  )
  const summaryTasks = React.useMemo(
    () => mapScheduleHintsToSummaryItems(summarySpec.schedules),
    [summarySpec.schedules],
  )
  const configText = React.useMemo(() => {
    if (!hasCanonicalResult) return ''
    if (!configBlueprint) return ''
    return serializeProjectBlueprint(configBlueprint, configFormat)
  }, [configBlueprint, configFormat, hasCanonicalResult])
  const [configDraft, setConfigDraft] = React.useState(configText)
  const controlledSkillItems = React.useMemo<UnifiedSkillItem[]>(() => {
    const selectedCapabilities = draft
      ? getDraftCapabilities(draft)
      : { skills: [], plugins: [] }
    const selectedSkills = new Set(selectedCapabilities.skills)
    const selectedPlugins = new Set(selectedCapabilities.plugins)
    return availableUnifiedSkills.map((item) => ({
      ...item,
      installed: selectedSkills.has(item.slug) || selectedPlugins.has(item.slug),
      is_active: selectedSkills.has(item.slug) || selectedPlugins.has(item.slug),
      removable: true,
    })).sort((a, b) => a.name.localeCompare(b.name))
  }, [availableUnifiedSkills, draft])
  const runtimeValidation = React.useMemo(() => validateRuntimeEngineSetup({
    runtime: draft?.runtime ?? { mode: 'shared', engine: builderEngine },
    runtimes: availableRuntimes,
    selectedSkills: controlledSkillItems.filter((item) => item.installed && item.is_active),
    runtimeFeatureAccess,
  }), [availableRuntimes, builderEngine, controlledSkillItems, draft?.runtime, runtimeFeatureAccess])
  const provisionRuntime = React.useCallback(async (mode: 'dedicated' | 'byo') => {
    if (!draft) return undefined
    const runtime = draft.runtime ?? { mode: 'shared' as const, engine: builderEngine }
    const engine = runtime.engine ?? builderEngine
    const provider = resolveRuntimeProviderForMode(runtime, mode)
    const csrf = typeof document === 'undefined'
      ? null
      : document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? null
    const res = await fetch(`/api/runtimes?org_id=${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify({
        displayName: `${draft.project.name || 'Agent'} ${mode === 'byo' ? 'BYO runtime' : 'runtime'}`,
        description: `Runtime for ${draft.project.name || 'agent builder draft'}`,
        provider,
        engine,
        runtimeTier: mode,
        runtimeFlavor: mode === 'byo' ? 'c2a_autonomous' : 'c1_managed',
        channelOwnership: mode === 'byo'
          ? (runtime.channel_ownership ?? 'runtime_native')
          : (runtime.channel_ownership ?? 'lucid_relay'),
        channelMode: mode === 'byo' && (runtime.channel_ownership ?? 'runtime_native') === 'runtime_native' ? 'native' : 'relay',
        dedicatedTransportMode: mode === 'byo' && (runtime.channel_ownership ?? 'runtime_native') === 'runtime_native' ? 'native_pulse' : 'relay',
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
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.runtime?.id) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to provision runtime')
    }
    const runtimeId = String(data.runtime.id)
    onUpdateDraft((current) => ({
      ...current,
      runtime: {
        ...(current.runtime ?? { mode }),
        mode,
        runtime_id: runtimeId,
        engine,
        provider,
        channel_ownership: mode === 'byo'
            ? (current.runtime?.channel_ownership ?? 'runtime_native')
            : (current.runtime?.channel_ownership ?? 'lucid_relay'),
      },
    }))
    return {
      runtimeId,
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : undefined,
      envVars: data.envVars && typeof data.envVars === 'object'
        ? data.envVars as Record<string, string>
        : undefined,
    }
  }, [builderEngine, draft, onUpdateDraft, workspaceId])
  const appliedTemplate = React.useMemo(() => {
    if (result?.draft.mode !== 'template' || !result.draft.template?.slug) return null
    return catalogTemplates.find((candidate) => candidate.slug === result.draft.template?.slug) ?? null
  }, [catalogTemplates, result?.draft])
  const isTemplateDraft = (draft ?? progressDraft)?.mode === 'template'
  const shouldAllowTemplateSuggestion = !suppressTemplateSuggestion && !isTemplateDraft
  const closestLucidTemplate = shouldAllowTemplateSuggestion ? suggestedTemplate : null
  const shouldShowTemplateSuggestionSkeleton = shouldAllowTemplateSuggestion && templateSuggestionStatus === 'loading'
  const shouldShowTemplateSuggestion = Boolean(
    shouldAllowTemplateSuggestion && closestLucidTemplate && closestLucidTemplate.slug !== dismissedTemplateSlug,
  )
  const requiredTemplateInputs = React.useMemo(() => {
    if (draft?.mode !== 'template' || !draft.template) return []
    const missingByKey = new Map<string, { key: string; label: string; reason: string }>()
    for (const item of result?.missing_required_inputs ?? []) {
      const value = draft.template.params[item.key]
      if (!value?.trim()) missingByKey.set(item.key, item)
    }
    const template = catalogTemplates.find((candidate) => candidate.slug === draft.template?.slug)
    for (const param of template?.params ?? []) {
      if (!param.required) continue
      const value = draft.template.params[param.key]
      if (value?.trim()) continue
      missingByKey.set(param.key, {
        key: param.key,
        label: param.label,
        reason: param.hint ?? param.placeholder ?? `Set ${param.label}.`,
      })
    }
    return Array.from(missingByKey.values())
  }, [catalogTemplates, draft, result?.missing_required_inputs])
  const isConfigDirty = configDraft !== configText
  const validateConfigEditorChange = React.useCallback((nextValue: string) => {
    if (!configBlueprint) return true

    try {
      const nextBlueprint = parseProjectBlueprint(nextValue, configFormat)
      return hasSameConfigShape(configBlueprint, nextBlueprint)
    } catch {
      // Allow transient syntax states while typing values; debounce validation still reports them.
      return true
    }
  }, [configBlueprint, configFormat])

  const handleRejectedConfigStructureChange = React.useCallback(() => {
    setConfigError('Structure is locked. Edit existing values here; use Summary controls or modals to add, remove, or rename fields.')
    setConfigSaveState('error')
  }, [])

  React.useEffect(() => {
    setConfigDraft(configText)
    setConfigError(null)
    setConfigSaveState(configText ? 'saved' : 'idle')
  }, [configText])

  React.useEffect(() => {
    if (!hasCanonicalResult || !configBlueprint) return
    if (!isConfigDirty) {
      setConfigSaveState(configText ? 'saved' : 'idle')
      return
    }

    setConfigSaveState('saving')
    const timeout = window.setTimeout(() => {
      try {
        const nextBlueprint = parseProjectBlueprint(configDraft, configFormat)
        if (!hasSameConfigShape(configBlueprint, nextBlueprint)) {
          throw new Error('Only existing config values can be edited here. Use the Summary panel or modals to change structure.')
        }
        setConfigError(null)
        setConfigSaveState('saved')
        onUpdateDraft(() => generationDraftFromBlueprint(nextBlueprint))
      } catch (error) {
        setConfigError(error instanceof Error ? error.message : `Invalid ${configFormat.toUpperCase()} config`)
        setConfigSaveState('error')
      }
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [
    configDraft,
    configFormat,
    configText,
    configBlueprint,
    hasCanonicalResult,
    isConfigDirty,
    onUpdateDraft,
  ])

  React.useEffect(() => {
    setDismissedTemplateSlug(null)
  }, [suggestedTemplate?.slug])

  return (
    <div className="space-y-4">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = value as 'summary' | 'config'
          onActiveTabChange?.(next)
          if (!controlledActiveTab) {
            setUncontrolledActiveTab(next)
          }
        }}
        className="gap-4"
      >
        <div className="rounded-[24px] border border-border/60 bg-background/55 p-3 shadow-sm backdrop-blur-xl">
          <TabsList className="grid h-9 w-full grid-cols-2 rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4 space-y-3">
            {(shouldShowTemplateSuggestionSkeleton || shouldShowTemplateSuggestion) ? (
              <SuggestedTemplatePanel
                template={shouldShowTemplateSuggestion ? closestLucidTemplate : null}
                loading={shouldShowTemplateSuggestionSkeleton}
                progressStatus={progressStatus}
                availableUnifiedSkills={availableUnifiedSkills}
                onApply={() => {
                  if (!closestLucidTemplate) return
                  onUseTemplate?.(closestLucidTemplate.slug)
                }}
                onDismiss={() => {
                  if (!closestLucidTemplate) return
                  setDismissedTemplateSlug(closestLucidTemplate.slug)
                }}
              />
            ) : null}

            {hasCanonicalResult && draft ? (
              <BuilderDraftDetailsEditor
                draft={draft}
                onUpdateDraft={onUpdateDraft}
              />
            ) : null}

            {draft?.mode === 'template' && requiredTemplateInputs.length > 0 ? (
              <RequiredTemplateInputsEditor
                draft={draft}
                template={appliedTemplate}
                requiredInputs={requiredTemplateInputs}
                onUpdateDraft={onUpdateDraft}
              />
            ) : null}

            {hasCanonicalResult && draft ? (
              <BuilderStructurePanel
                draft={draft}
                lockedKind={draft.mode === 'template' ? draft.template?.kind : undefined}
                onUpdateDraft={onUpdateDraft}
              />
            ) : null}

            {hasCanonicalResult && draft ? (
              <div className="space-y-4">
                <BuildSummaryRows
                  healthData={null}
                  runtimeId={draft.runtime?.mode === 'shared' ? null : draft.runtime?.runtime_id ?? null}
                  runtimes={availableRuntimes}
                  memoriesTotal={0}
                  memoryEnabled={summarySpec.memoryEnabled}
                  tasks={summaryTasks}
                  channels={summaryChannels}
                  skills={summarySkills}
                  showPendingSkillSelections
                  costTodayUsd={0}
                  engine={builderEngine}
                  runtimeLabelOverride={runtimePresentation.title}
                  showEngine
                  showGuardrails={false}
                  showCost={false}
                  onTabChange={(tab) => {
                    if (tab === 'skills' || tab === 'channels' || tab === 'tasks' || tab === 'engine' || tab === 'runtime') {
                      onActiveBuilderPanelChange?.(tab)
                      if (!controlledActiveBuilderPanel) {
                        setUncontrolledActiveBuilderPanel(tab as 'skills' | 'channels' | 'tasks' | 'engine' | 'runtime')
                      }
                    }
                  }}
                  onAddSkill={() => {
                    onActiveBuilderPanelChange?.('skills')
                    if (!controlledActiveBuilderPanel) {
                      setUncontrolledActiveBuilderPanel('skills')
                    }
                  }}
                  onAddChannel={() => {
                    onActiveBuilderPanelChange?.('channels')
                    if (!controlledActiveBuilderPanel) {
                      setUncontrolledActiveBuilderPanel('channels')
                    }
                  }}
                />

              </div>
            ) : (
              <SummarySkeleton />
            )}

          </TabsContent>

          <TabsContent value="config" className="mt-4">
            {!hasCanonicalResult ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                  Live configuration will appear here as soon as Lucid drafts the first version.
                </div>
                {progressStatus || progressPreviewBlueprint ? (
                  <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Preparing configuration</p>
                      {progressStatus ? (
                        <Badge variant="outline" className="rounded-full text-[10px]">{progressStatus}</Badge>
                      ) : null}
                    </div>
                    <ConfigSkeleton />
                  </div>
                ) : null}
              </div>
            ) : !configBlueprint ? (
              <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                Live configuration will appear here as soon as Lucid drafts the setup.
              </div>
            ) : (
              <ProjectBuilderConfigCodeBlock
                format={configFormat}
                value={configDraft}
                saveState={configSaveState}
                error={configError}
                onFormatChange={setConfigFormat}
                onChange={setConfigDraft}
                validateChange={validateConfigEditorChange}
                onRejectedStructureChange={handleRejectedConfigStructureChange}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>

      <BuilderCreateFooter
        result={result}
        progressStatus={progressStatus}
        isBlocked={isBlocked}
        missingRequiredInputLabels={missingRequiredInputLabels}
        runtimeIssueAction={runtimeValidation.blockingIssues[0]?.action}
        hasRuntimeBlockingIssues={runtimeValidation.blockingIssues.length > 0}
        pendingConnectionsCount={pendingConnectionsCount}
        isCreating={isCreating}
        createDisabled={createDisabled}
        onCreate={onCreate}
        onOpenConnectApps={onOpenConnectApps}
        onSkipConnectApps={onSkipConnectApps}
      />

      <ConfigSectionDialog
        open={activeBuilderPanel === 'skills'}
        onOpenChange={(open) => {
          onActiveBuilderPanelChange?.(open ? 'skills' : null)
          if (!controlledActiveBuilderPanel) {
            setUncontrolledActiveBuilderPanel(open ? 'skills' : null)
          }
        }}
        title="Skills"
        sectionId="skills"
      >
        {hasCanonicalResult && draft ? (
          <UnifiedSkillManager
            mode="controlled"
            controlledItems={controlledSkillItems}
            deferConnectionUntilSelected
            onItemsChange={(items) => {
              const nextActiveItems = items
                .filter((item) => item.installed && item.is_active)
              const nextSkills = nextActiveItems
                .filter((item) => item.item_type === 'skill')
                .map((item) => item.slug)
              const nextPlugins = nextActiveItems
                .filter((item) => item.item_type === 'plugin')
                .map((item) => item.slug)
              onUpdateDraft((current) => setDraftCapabilities(current, {
                skills: nextSkills,
                plugins: nextPlugins,
              }))
            }}
          />
        ) : null}
      </ConfigSectionDialog>

      <ConfigSectionDialog
        open={activeBuilderPanel === 'engine' || activeBuilderPanel === 'runtime'}
        onOpenChange={(open) => {
          onActiveBuilderPanelChange?.(open ? 'runtime' : null)
          if (!controlledActiveBuilderPanel) {
            setUncontrolledActiveBuilderPanel(open ? 'runtime' : null)
          }
        }}
        title="Runtime & Engine"
        sectionId="runtime-engine"
        widthClassName="max-w-[680px] w-[92vw]"
      >
        {hasCanonicalResult && draft ? (
          <AgentRuntimeEnginePanel
            runtime={draft.runtime ?? { mode: 'shared', engine: builderEngine }}
            runtimes={availableRuntimes}
            selectedSkills={controlledSkillItems.filter((item) => item.installed && item.is_active)}
            runtimeFeatureAccess={runtimeFeatureAccess}
            modelHint={draft.agent?.model_hint ?? null}
            mode="builder"
            onChange={(runtime) => onUpdateDraft((current) => ({
              ...current,
              runtime,
            }))}
            onModelChange={(modelHint) => onUpdateDraft((current) => ({
              ...current,
              agent: current.agent
                ? {
                    ...current.agent,
                    model_hint: modelHint,
                  }
                : current.agent,
            }))}
            onCreateDedicatedRuntime={() => provisionRuntime('dedicated')}
            onConnectByoRuntime={() => provisionRuntime('byo')}
          />
        ) : null}
      </ConfigSectionDialog>

      <ConfigSectionDialog
        open={activeBuilderPanel === 'channels'}
        onOpenChange={(open) => {
          onActiveBuilderPanelChange?.(open ? 'channels' : null)
          if (!controlledActiveBuilderPanel) {
            setUncontrolledActiveBuilderPanel(open ? 'channels' : null)
          }
        }}
        title="Channels"
        sectionId="channels"
        widthClassName="max-w-[720px] w-[90vw] max-h-[85vh]"
      >
        {hasCanonicalResult && draft ? (
          <AssistantChannelsPanel
            mode="builder"
            channelHints={draft.agent?.channel_hints ?? draft.team?.channel_hints ?? []}
            onChannelHintsChange={(channels) => onUpdateDraft((current) => ({
              ...current,
              agent: current.agent
                ? {
                    ...current.agent,
                    channel_hints: channels.length ? channels : undefined,
                  }
                : current.agent,
              team: current.team
                ? {
                    ...current.team,
                    channel_hints: channels.length ? channels : undefined,
                  }
                : current.team,
            }))}
          />
        ) : null}
      </ConfigSectionDialog>

      <ConfigSectionDialog
        open={activeBuilderPanel === 'tasks'}
        onOpenChange={(open) => {
          onActiveBuilderPanelChange?.(open ? 'tasks' : null)
          if (!controlledActiveBuilderPanel) {
            setUncontrolledActiveBuilderPanel(open ? 'tasks' : null)
          }
        }}
        title="Routines"
        sectionId="tasks"
        widthClassName="max-w-[720px] w-[90vw] max-h-[85vh]"
      >
        {hasCanonicalResult && draft && (draft.agent || draft.team) ? (
          <AgentTasksPanel
            mode="controlled"
            controlledSchedules={draft.agent?.default_schedules ?? draft.team?.members.find((member) => member.is_coordinator)?.default_schedules ?? draft.team?.members[0]?.default_schedules ?? []}
            createControlledTask={createBuilderScheduleTask}
            onControlledSchedulesChange={(tasks) => onUpdateDraft((current) => ({
              ...current,
              agent: current.agent
                ? {
                    ...current.agent,
                    default_schedules: tasks,
                  }
                : current.agent,
              team: current.team
                ? {
                    ...current.team,
                    members: current.team.members.map((member, index) => (
                      member.is_coordinator || (!current.team?.members.some((candidate) => candidate.is_coordinator) && index === 0)
                        ? {
                            ...member,
                            default_schedules: tasks,
                          }
                        : member
                    )),
                  }
                : current.team,
            }))}
          />
        ) : null}
      </ConfigSectionDialog>
    </div>
  )
}

export const AgentBuilderReviewPanel = ProjectBuilderReviewPanel
export type AgentBuilderReviewPanelProps = ProjectBuilderReviewPanelProps

function getDraftSummarySpec(draft: GenerationDraft | undefined) {
  if (!draft) {
    return {
      skills: [] as string[],
      plugins: [] as string[],
      channelHints: [] as NonNullable<AgentTemplateSpec['channel_hints']>,
      schedules: [] as NonNullable<AgentTemplateSpec['default_schedules']>,
      memoryEnabled: false,
    }
  }

  if (draft.agent) {
    return {
      skills: draft.agent.skills ?? [],
      plugins: draft.agent.plugins ?? [],
      channelHints: draft.agent.channel_hints ?? [],
      schedules: draft.agent.default_schedules ?? [],
      memoryEnabled: draft.agent.memory_enabled ?? Boolean(draft.agent.memory_schema?.length),
    }
  }

  const team = draft.team
  if (!team) {
    return {
      skills: [] as string[],
      plugins: [] as string[],
      channelHints: [] as NonNullable<AgentTemplateSpec['channel_hints']>,
      schedules: [] as NonNullable<AgentTemplateSpec['default_schedules']>,
      memoryEnabled: false,
    }
  }

  return {
    skills: dedupeStrings(team.members.flatMap((member) => member.skills ?? [])),
    plugins: dedupeStrings(team.members.flatMap((member) => member.plugins ?? [])),
    channelHints: team.channel_hints ?? [],
    schedules: team.members.flatMap((member) => member.default_schedules ?? []),
    memoryEnabled: team.members.some((member) => (member.memory_schema?.length ?? 0) > 0),
  }
}

function RequiredTemplateInputsEditor({
  draft,
  template,
  requiredInputs,
  onUpdateDraft,
}: {
  draft: GenerationDraft
  template: TemplateCatalogEntry | null
  requiredInputs: Array<{ key: string; label: string; reason: string }>
  onUpdateDraft: (updater: (draft: GenerationDraft) => GenerationDraft) => void
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Template details</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            Complete required values before creating.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-300">
          {requiredInputs.length}
        </Badge>
      </div>
      {requiredInputs.map((param) => (
        <div key={param.key} className="space-y-2">
          <Label htmlFor={`generated-param-${param.key}`}>{param.label}</Label>
          <Input
            id={`generated-param-${param.key}`}
            value={draft.template?.params?.[param.key] ?? ''}
            onChange={(event) => {
              const value = event.target.value
              onUpdateDraft((current) => {
                const nextParams = {
                  ...(current.template?.params ?? {}),
                  [param.key]: value,
                }
                if (template && current.mode === 'template') {
                  return applyTemplateParamsToDraft(current, template, nextParams)
                }
                return {
                  ...current,
                  template: current.template
                    ? {
                        ...current.template,
                        params: nextParams,
                      }
                    : current.template,
                }
              })
            }}
            placeholder={param.reason}
          />
        </div>
      ))}
    </div>
  )
}

function BuilderDraftDetailsEditor({
  draft,
  onUpdateDraft,
}: {
  draft: GenerationDraft
  onUpdateDraft: (updater: (draft: GenerationDraft) => GenerationDraft) => void
}) {
  const promptLabel = draft.agent ? 'System prompt' : draft.team ? 'Team objective' : 'Prompt'
  const promptValue = draft.agent?.system_prompt ?? draft.team?.objective ?? draft.sourcePrompt ?? ''
  const isNameMissing = !draft.project.name.trim()
  const isPromptMissing = !promptValue.trim()
  const structureLabel = draft.team ? 'Team' : 'Agent'
  const [isPromptOpen, setIsPromptOpen] = React.useState(isPromptMissing)

  React.useEffect(() => {
    if (isPromptMissing) setIsPromptOpen(true)
  }, [isPromptMissing])

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Basics</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            Name, description, and operating brief.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full text-[10px]">{structureLabel}</Badge>
      </div>

      <div className="grid gap-3">
        <div className="space-y-2">
          <Label htmlFor="builder-project-name">Name</Label>
          <Input
            id="builder-project-name"
            value={draft.project.name}
            onChange={(event) => {
              const nextName = event.target.value
              onUpdateDraft((current) => {
                const previousName = current.project.name
                return {
                  ...current,
                  project: {
                    ...current.project,
                    name: nextName,
                  },
                  starterName: !current.starterName || current.starterName === previousName
                    ? nextName
                    : current.starterName,
                }
              })
            }}
            aria-invalid={isNameMissing}
          />
          {isNameMissing ? (
            <p className="text-xs text-destructive">Required before creating.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="builder-project-description">Description</Label>
          <Input
            id="builder-project-description"
            value={draft.project.description ?? ''}
            onChange={(event) => {
              const nextDescription = event.target.value
              onUpdateDraft((current) => ({
                ...current,
                project: {
                  ...current.project,
                  description: nextDescription.trim() ? nextDescription : undefined,
                },
              }))
            }}
          />
        </div>
      </div>

      <details
        className="group rounded-2xl border border-border/50 bg-muted/10"
        open={isPromptOpen}
        onToggle={(event) => setIsPromptOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{promptLabel}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {isPromptMissing ? 'Required before creating.' : 'Advanced operating context.'}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Badge variant={isPromptMissing ? 'destructive' : 'outline'} className="rounded-full text-[10px]">
              {isPromptMissing ? 'Required' : 'Ready'}
            </Badge>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t border-border/50 p-3">
          <Textarea
            id="builder-project-prompt"
            value={promptValue}
            onChange={(event) => {
              const nextPrompt = event.target.value
              onUpdateDraft((current) => {
                if (current.agent) {
                  return {
                    ...current,
                    agent: {
                      ...current.agent,
                      system_prompt: nextPrompt,
                    },
                  }
                }
                if (current.team) {
                  return {
                    ...current,
                    team: {
                      ...current.team,
                      objective: nextPrompt,
                    },
                  }
                }
                return {
                  ...current,
                  sourcePrompt: nextPrompt,
                }
              })
            }}
            className="min-h-[112px] resize-y"
            aria-invalid={isPromptMissing}
          />
        </div>
      </details>
    </div>
  )
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function humanizeCapabilitySlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function describeMode(mode: GeneratedBlueprintResult['mode']): string {
  switch (mode) {
    case 'blank-team':
      return 'team setup'
    case 'blank-agent':
      return 'single-agent setup'
    default:
      return 'template-based setup'
  }
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return 'a few details'
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

function hasSameConfigShape(base: unknown, next: unknown): boolean {
  if (Array.isArray(base) || Array.isArray(next)) {
    if (!Array.isArray(base) || !Array.isArray(next)) return false
    if (base.length !== next.length) return false
    return base.every((item, index) => hasSameConfigShape(item, next[index]))
  }

  if (isPlainObject(base) || isPlainObject(next)) {
    if (!isPlainObject(base) || !isPlainObject(next)) return false
    const baseKeys = Object.keys(base).sort()
    const nextKeys = Object.keys(next).sort()
    if (baseKeys.length !== nextKeys.length) return false
    if (!baseKeys.every((key, index) => key === nextKeys[index])) return false
    return baseKeys.every((key) => hasSameConfigShape(base[key], next[key]))
  }

  return true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function SuggestedTemplatePanel({
  template,
  loading,
  progressStatus,
  availableUnifiedSkills,
  onApply,
  onDismiss,
}: {
  template: TemplateCatalogEntry | null
  loading: boolean
  progressStatus?: string | null
  availableUnifiedSkills: UnifiedSkillItem[]
  onApply: () => void
  onDismiss: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/70 p-3 transition-all duration-300 ease-out">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Suggested template</p>
        {loading && progressStatus ? (
          <Badge variant="outline" className="rounded-full text-[10px]">{progressStatus}</Badge>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3 transition-opacity duration-300 ease-out">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1.5">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>
      ) : template ? (
        <div className="space-y-3 transition-opacity duration-300 ease-out">
          <TemplateCard
            template={template}
            variant="compact"
            hideDescription
            availableUnifiedSkills={availableUnifiedSkills}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
              Keep current
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onApply}>
              Apply template
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BuilderCreateFooter({
  result,
  progressStatus,
  isBlocked,
  missingRequiredInputLabels,
  runtimeIssueAction,
  hasRuntimeBlockingIssues,
  pendingConnectionsCount,
  isCreating,
  createDisabled,
  onCreate,
  onOpenConnectApps,
  onSkipConnectApps,
}: {
  result: GeneratedBlueprintResult | null
  progressStatus?: string | null
  isBlocked: boolean
  missingRequiredInputLabels: string[]
  runtimeIssueAction?: string
  hasRuntimeBlockingIssues: boolean
  pendingConnectionsCount: number
  isCreating: boolean
  createDisabled: boolean
  onCreate: () => void
  onOpenConnectApps?: () => void
  onSkipConnectApps?: () => void
}) {
  const title = !result
    ? progressStatus ?? 'Waiting for draft'
    : isBlocked
      ? 'Required details missing'
      : hasRuntimeBlockingIssues
        ? 'Runtime setup needs attention'
        : pendingConnectionsCount > 0
          ? 'Selected apps need setup'
          : 'Ready to create'

  const description = !result
    ? 'The review panel will unlock once Lucid drafts the setup.'
    : isBlocked
      ? `Complete ${joinLabels(missingRequiredInputLabels)}.`
      : hasRuntimeBlockingIssues
        ? runtimeIssueAction ?? 'Open Runtime & Engine to resolve the setup.'
        : pendingConnectionsCount > 0
          ? 'Connect selected apps now, or skip and connect later.'
          : 'Review anything above, then create.'

  return (
    <div className="sticky bottom-0 z-20 -mx-1 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-[0_-18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pendingConnectionsCount > 0 ? (
            <>
              <Button type="button" size="sm" onClick={onOpenConnectApps}>
                Connect apps
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onSkipConnectApps}>
                Skip
              </Button>
            </>
          ) : (
            <Button onClick={onCreate} disabled={createDisabled}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((column) => (
        <div key={column} className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded-xl bg-muted/70" />
            <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ConfigSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-9 w-48 animate-pulse rounded-xl bg-muted/60" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted/30" />
    </div>
  )
}
