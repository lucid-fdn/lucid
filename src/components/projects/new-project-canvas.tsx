"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { motion } from "motion/react"
import type { ProjectBlueprint } from "@contracts/project-blueprint"
import type { TemplateCatalogEntry } from "@contracts/template"
import type { UnifiedSkillItem } from "@contracts/unified-skill"
import type { RuntimeFeatureAccess } from "@/lib/access-control/types"
import {
  buildBlankAssistedSessionSeed,
  buildTemplateAssistedSessionSeed,
} from "@/lib/agent-builder/builder-session-seed"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AgentBuilderAnimatedSurface } from "@/components/agent-builder/agent-builder-animated-surface"
import { AgentBuilderFlowProvider } from "@/components/agent-builder/flow/agent-builder-flow-provider"
import { useAgentBuilderStartState } from "@/components/agent-builder/flow/use-agent-builder-start-state"
import { AgentBuilderStartStep } from "@/components/agent-builder/steps/agent-builder-start-step"
import { ProjectCanvasStageShell } from "@/components/projects/project-canvas-stage-shell"
import { parseProjectBlueprint, type BlueprintConfigFormat } from "@/lib/projects/blueprint-serialization"
import { buildProjectAgentsHandoffPath, saveProjectCanvasHandoff } from "@/lib/projects/handoff"
import { logProjectSurfaceTelemetry } from "@/lib/projects/surface-telemetry"
import {
  createAgentFromBuilderDraft,
  type CreateAgentFromBuilderDraftResult,
} from "@/lib/agent-builder/create-agent-from-builder-draft"

const ProjectBuilderSessionPanel = dynamic(
  () => import("@/components/projects/project-builder-session-panel").then((mod) => mod.AgentBuilderSessionPanel),
  { loading: () => <BuilderPanelFallback /> },
)

const TemplateGallery = dynamic(
  () => import("@/components/templates/template-gallery").then((mod) => mod.TemplateGallery),
  { loading: () => <TemplateGalleryFallback /> },
)

const PlatformGuaranteesCard = dynamic(
  () => import("@/components/platform/platform-guarantees-card").then((mod) => mod.PlatformGuaranteesCard),
)

interface NewProjectCanvasProps {
  workspaceId: string
  workspaceSlug: string
  initialTemplateSlug?: string | null
  initialBlank?: boolean
  initialDescribe?: boolean
  initialUpload?: boolean
  initialBrowseAllTemplates?: boolean
  catalogTemplates: TemplateCatalogEntry[]
  initialAvailableUnifiedSkills?: UnifiedSkillItem[]
  runtimeFeatureAccess?: RuntimeFeatureAccess
  targetProjectId?: string | null
  targetProjectSlug?: string | null
  initialPrompt?: string
  embedded?: boolean
  urlBasePath?: string
  onClose?: () => void
  onCreated?: (result: CreateAgentFromBuilderDraftResult) => void
}

export function NewProjectCanvas({
  workspaceId,
  workspaceSlug,
  initialTemplateSlug = null,
  initialBlank = false,
  initialDescribe = false,
  initialUpload = false,
  initialBrowseAllTemplates = false,
  catalogTemplates,
  initialAvailableUnifiedSkills = [],
  runtimeFeatureAccess,
  targetProjectId = null,
  targetProjectSlug = null,
  initialPrompt = "",
  embedded = false,
  urlBasePath,
  onClose,
  onCreated,
}: NewProjectCanvasProps) {
  const navbarOffset = "calc(56px + var(--status-banner-height, 0px))"
  const canvasInset = 20
  const canvasHeight = `calc(100dvh - ${navbarOffset})`
  const cardMaxHeight = `calc(${canvasHeight} - ${canvasInset * 2}px)`

  const [isCreating, setIsCreating] = React.useState(false)
  const [uploadFormat, setUploadFormat] = React.useState<BlueprintConfigFormat>("yaml")
  const [uploadValue, setUploadValue] = React.useState("")
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [uploadedBlueprint, setUploadedBlueprint] = React.useState<ProjectBlueprint | null>(null)
  const {
    activeTemplateSlug,
    activeView,
    isBrowseAllTemplates,
    generationPrompt,
    submittedDescribePrompt,
    setGenerationPrompt,
    pushBrowse,
    pushBrowseAllTemplates,
    pushBlank,
    pushUpload,
    pushTemplate,
    submitDescribePrompt,
  } = useAgentBuilderStartState({
    workspaceSlug,
    initialTemplateSlug,
    initialBlank,
    initialDescribe,
    initialUpload,
    initialBrowseAllTemplates,
    initialPrompt,
    urlBasePath,
  })

  const selectedTemplate = React.useMemo(
    () => (activeTemplateSlug ? catalogTemplates.find((template) => template.slug === activeTemplateSlug) ?? null : null),
    [activeTemplateSlug, catalogTemplates],
  )
  const assistedSessionSeed = React.useMemo(() => {
    if (activeView === "blank") {
      return buildBlankAssistedSessionSeed()
    }

    if (activeView === "template" && selectedTemplate) {
      return buildTemplateAssistedSessionSeed(selectedTemplate)
    }

    return null
  }, [activeView, selectedTemplate])
  const isAssistedSession = activeView === "describe" || activeView === "blank" || Boolean(assistedSessionSeed)
  const assistedSessionInitialPrompt = activeView === "describe" ? submittedDescribePrompt : ""
  const assistedSessionMessages = assistedSessionSeed?.messages ?? []
  const assistedSessionResult = assistedSessionSeed?.result ?? null
  const assistedSessionDraftName = assistedSessionResult?.draft.project.name ?? submittedDescribePrompt
  const assistedSessionKey = activeView === "template"
    ? `template:${activeTemplateSlug ?? "missing"}`
    : activeView === "blank"
      ? "blank"
      : activeView === "describe"
        ? `describe:${submittedDescribePrompt}`
        : activeView
  const flowConfig = React.useMemo(() => ({
    mode: targetProjectId && targetProjectSlug ? "agent" as const : "project-with-agent" as const,
    workspaceId,
    workspaceSlug,
    targetProjectId,
    targetProjectSlug,
    initialPrompt: assistedSessionInitialPrompt || initialPrompt,
    initialTemplateSlug,
    initialDraft: assistedSessionResult?.draft ?? null,
    catalogTemplates,
    availableUnifiedSkills: initialAvailableUnifiedSkills,
    surface: "page" as const,
    onCreated,
    onClose,
  }), [
    catalogTemplates,
    assistedSessionInitialPrompt,
    assistedSessionResult,
    initialAvailableUnifiedSkills,
    initialPrompt,
    initialTemplateSlug,
    onClose,
    onCreated,
    targetProjectId,
    targetProjectSlug,
    workspaceId,
    workspaceSlug,
  ])
  const featuredTemplates = React.useMemo(
    () => [...catalogTemplates].sort((a, b) => b.install_count - a.install_count).slice(0, 4),
    [catalogTemplates],
  )
  const selectedAppBindings = React.useMemo(() => ({}), [])

  const handleCreateProject = React.useCallback(async () => {
    if (!uploadedBlueprint) return

    try {
      setIsCreating(true)
      const result = await createAgentFromBuilderDraft({
        workspaceId,
        blueprint: uploadedBlueprint,
        targetProjectId,
        targetProjectSlug,
        appBindings: selectedAppBindings,
      })
      if (onCreated) {
        onCreated(result)
        return
      }
      if (result.agentId || result.crewId) {
        saveProjectCanvasHandoff({
          projectSlug: result.projectSlug,
          agentId: result.agentId,
          crewId: result.crewId,
          createdAt: Date.now(),
        })
      }
      const nextPath = buildProjectAgentsHandoffPath({
        workspaceSlug,
        projectSlug: result.projectSlug,
        agentId: result.agentId,
        crewId: result.crewId,
      })
      logProjectSurfaceTelemetry('project:builder:create-handoff', {
        workspaceId,
        projectSlug: result.projectSlug,
        agentId: result.agentId,
        crewId: result.crewId,
        assistantIds: result.assistantIds,
        destination: 'canvas',
      })
      window.location.href = nextPath
    } catch (error) {
      toast.error("Could not create project", error instanceof Error ? error.message : "Something went wrong.")
    } finally {
      setIsCreating(false)
    }
  }, [onCreated, selectedAppBindings, targetProjectId, targetProjectSlug, uploadedBlueprint, workspaceId, workspaceSlug])

  const createDisabled = isCreating
    || !uploadedBlueprint

  const applyUploadedBlueprint = React.useCallback(() => {
    try {
      const parsed = parseProjectBlueprint(uploadValue, uploadFormat)
      setUploadedBlueprint(parsed)
      setUploadError(null)
      toast.success("Blueprint loaded")
    } catch (error) {
      setUploadedBlueprint(null)
      setUploadError(error instanceof Error ? error.message : "Invalid blueprint config")
    }
  }, [uploadFormat, uploadValue])

  const handleBrowsePromptGenerate = React.useCallback(async () => {
    submitDescribePrompt(generationPrompt)
  }, [generationPrompt, submitDescribePrompt])

  const builderCanvas = (
    <ProjectCanvasStageShell
      className="flex w-full items-center justify-center"
      draftName={assistedSessionDraftName}
      showDraftGhost={isAssistedSession}
      style={{
        height: canvasHeight,
        marginTop: embedded ? 0 : navbarOffset,
        paddingInline: `${canvasInset}px`,
      }}
    >
      <motion.div
        layout
        drag
        dragMomentum={false}
        dragElastic={0.08}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          opacity: { duration: 0.2, ease: "easeOut" },
          scale: { duration: 0.2, ease: "easeOut" },
          y: { duration: 0.2, ease: "easeOut" },
          layout: { type: "spring", stiffness: 220, damping: 24 },
        }}
        className={cn(
          "relative z-10 w-full px-6",
          activeView === "browse" ? "max-w-[1280px]" : "max-w-[1120px]",
          isAssistedSession && "overflow-hidden",
        )}
        style={{ maxHeight: cardMaxHeight }}
      >
        <AgentBuilderAnimatedSurface
          style={isAssistedSession ? { height: cardMaxHeight } : undefined}
        >
          {isAssistedSession ? (
            <ProjectBuilderSessionPanel
              key={assistedSessionKey}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              catalogTemplates={catalogTemplates}
              initialAvailableUnifiedSkills={initialAvailableUnifiedSkills}
              runtimeFeatureAccess={runtimeFeatureAccess}
              initialPrompt={assistedSessionInitialPrompt}
              initialMessages={assistedSessionMessages}
              initialResult={assistedSessionResult}
              targetProjectId={targetProjectId}
              targetProjectSlug={targetProjectSlug}
              suppressTemplateSuggestion={activeView === "blank" || activeView === "template"}
              onBack={pushBrowse}
              onClose={onClose}
              onCreated={(result) => {
                if (onCreated) {
                  onCreated(result)
                  return
                }
                if (result.agentId || result.crewId) {
                  saveProjectCanvasHandoff({
                    projectSlug: result.projectSlug,
                    agentId: result.agentId,
                    crewId: result.crewId,
                    createdAt: Date.now(),
                  })
                }
                const nextPath = buildProjectAgentsHandoffPath({
                  workspaceSlug,
                  projectSlug: result.projectSlug,
                  agentId: result.agentId,
                  crewId: result.crewId,
                })
                logProjectSurfaceTelemetry('project:builder:create-handoff', {
                  workspaceId,
                  projectSlug: result.projectSlug,
                  agentId: result.agentId,
                  crewId: result.crewId,
                  assistantIds: result.assistantIds,
                  destination: 'canvas',
                })
                window.location.href = nextPath
              }}
            />
          ) : (
          <ScrollArea style={{ maxHeight: cardMaxHeight }}>
            {activeView === "browse" ? (
              <>
                {isBrowseAllTemplates ? (
                  <TemplateGallery
                    initialTemplates={catalogTemplates}
                    title=""
                    description=""
                    cardVariant="full"
                    onSelect={(template) => pushTemplate(template.slug)}
                  />
                ) : (
                  <AgentBuilderStartStep
                    prompt={generationPrompt}
                    onPromptChange={setGenerationPrompt}
                    onPromptSubmit={() => { void handleBrowsePromptGenerate() }}
                    featuredTemplates={featuredTemplates}
                    availableUnifiedSkills={initialAvailableUnifiedSkills}
                    onStartFresh={pushBlank}
                    onUploadSpec={pushUpload}
                    onSelectTemplate={(template) => pushTemplate(template.slug)}
                    onBrowseAllTemplates={pushBrowseAllTemplates}
                  />
                )}
              </>
                ) : activeView === "upload" ? (
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
                    <div className="border-b border-border p-6 lg:border-b-0 lg:border-r">
                      <Button type="button" variant="ghost" size="sm" onClick={pushBrowse} className="text-muted-foreground hover:text-foreground">
                        Back
                      </Button>

                      <div className="mt-5 space-y-1">
                        <h1 className="text-2xl font-semibold text-foreground">Upload a spec</h1>
                        <p className="text-sm text-muted-foreground">
                          Advanced path: paste JSON or YAML, validate it against the canonical blueprint contract, then create it.
                        </p>
                      </div>

                      <div className="mt-6 space-y-4">
                        <div className="space-y-2">
                          <Label>Format</Label>
                          <div className="flex gap-2">
                            {(["yaml", "json"] as BlueprintConfigFormat[]).map((format) => (
                              <Button
                                key={format}
                                type="button"
                                size="sm"
                                variant={uploadFormat === format ? "default" : "outline"}
                                onClick={() => setUploadFormat(format)}
                              >
                                {format.toUpperCase()}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="upload-blueprint">Blueprint config</Label>
                          <Textarea
                            id="upload-blueprint"
                            value={uploadValue}
                            onChange={(event) => setUploadValue(event.target.value)}
                            rows={14}
                            placeholder={uploadFormat === "yaml"
                              ? "version: \"1.0\"\nproject:\n  name: Support Ops\nitems:\n  - kind: agent\n    source: blank\n    spec:\n      system_prompt: ..."
                              : '{\n  "version": "1.0",\n  "project": { "name": "Support Ops" },\n  "items": []\n}'}
                          />
                          {uploadError ? (
                            <p className="text-xs text-destructive">{uploadError}</p>
                          ) : null}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={applyUploadedBlueprint} disabled={!uploadValue.trim()}>
                            Validate and load
                          </Button>
                          <Button
                            onClick={() => { void handleCreateProject() }}
                            disabled={createDisabled}
                          >
                            {isCreating ? "Creating..." : "Create project"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
                          {uploadedBlueprint
                            ? `Blueprint loaded for "${uploadedBlueprint.project.name}". Create it when ready.`
                            : "Load a canonical JSON or YAML blueprint to use the same deploy path without AI assistance."}
                        </div>
                        <PlatformGuaranteesCard context="create-agent" compact />
                      </div>
                    </div>
                  </div>
                ) : null}
          </ScrollArea>
          )}
        </AgentBuilderAnimatedSurface>
      </motion.div>
    </ProjectCanvasStageShell>
  )

  return (
    <AgentBuilderFlowProvider key={assistedSessionKey} config={flowConfig}>
      {builderCanvas}
    </AgentBuilderFlowProvider>
  )
}

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
function TemplateGalleryFallback() {
  return (
    <div className="grid grid-cols-1 gap-3 px-6 pb-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-2xl border border-border/60 bg-muted/50" />
      ))}
    </div>
  )
}
