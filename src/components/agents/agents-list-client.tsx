'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  Power,
  X,
  Users,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
// Tooltips removed from header — using direct labels
import { Card } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLiveFeed } from '@/hooks/use-live-feed'
import { useApprovals } from '@/hooks/use-approvals'
import type { Agent as Assistant } from '@/types/agent'
import type { FeedEvent, PendingApproval, ControlAction, CanvasTopologyData } from '@/lib/mission-control/types'
import {
  AssistantsEmptyState,
  AssistantsNoResults,
} from '@/components/assistants/assistants-empty-states'
import {
  AssistantsGridView,
  AssistantsListView,
} from '@/components/assistants/assistants-views'
import { useCrews } from '@/hooks/use-crews'
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context'
import { buildProjectAgentBuilderPath, buildProjectAgentDetailPath, buildProjectTeamDetailPath } from '@/lib/projects/urls'
import { buildProjectAgentsHandoffPath, consumeProjectCanvasHandoff, PROJECT_CREATION_FOCUS, saveProjectCanvasHandoff } from '@/lib/projects/handoff'
import { logProjectSurfaceTelemetry } from '@/lib/projects/surface-telemetry'
import {
  buildBlankAssistedSessionSeed,
  buildTemplateAssistedSessionSeed,
  type BuilderSessionSeed,
} from '@/lib/agent-builder/builder-session-seed'
import dynamic from 'next/dynamic'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import type { EngineDeployReadiness } from '@/lib/engines/deploy-readiness'
import { notificationCopy } from '@/lib/notifications/copy'
import { useIsMobile } from '@/hooks/use-mobile'
import type { CreateAgentFromBuilderDraftResult } from '@/lib/agent-builder/create-agent-from-builder-draft'
import { AgentsFloatingToolbar } from './agents-floating-toolbar'
import { useAgentListFilters } from './use-agent-list-filters'
import type { AgentsStatusFilter, AgentsViewMode, ProjectStartSurface } from './agents-list-types'

const AgentsCanvasLazy = dynamic(() => import('@/components/agents/agents-canvas').then((m) => ({ default: m.AgentsCanvas })), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-4">
      <img src="/lucid_w.gif" alt="Loading" className="h-10 w-10 opacity-60 dark:invert-0 invert" />
      <p className="text-base font-medium text-muted-foreground/60 animate-pulse">Assembling the crew...</p>
    </div>
  ),
})

const AgentBuilderSessionPanelLazy = dynamic(() => import('@/components/projects/project-builder-session-panel').then((m) => ({ default: m.AgentBuilderSessionPanel })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-lg backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        Loading builder...
      </div>
    </div>
  ),
})

const AssistantPreviewPanelLazy = dynamic(() => import('@/components/assistants/assistant-preview-panel').then((m) => ({ default: m.AssistantPreviewPanel })), {
  ssr: false,
  loading: () => <div className="h-full border-l bg-background/95" />,
})

const TeamPreviewPanelLazy = dynamic(() => import('@/components/assistants/team-preview-panel').then((m) => ({ default: m.TeamPreviewPanel })), {
  ssr: false,
  loading: () => <div className="h-full border-l bg-background/95" />,
})

const OperationsConsoleLazy = dynamic(() => import('@/components/assistants/operations-console').then((m) => ({ default: m.OperationsConsole })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading live feed...
    </div>
  ),
})

const CopilotTriggerLazy = dynamic(() => import('@/components/mission-control/copilot/copilot-trigger').then((m) => ({ default: m.CopilotTrigger })), {
  ssr: false,
})

const CreateCrewDialogLazy = dynamic(() => import('@/components/crews/create-crew-dialog').then((m) => ({ default: m.CreateCrewDialog })), {
  ssr: false,
})

const AgentBuilderCanvasOverlayShellLazy = dynamic(() => import('@/components/agent-builder/shells').then((m) => ({ default: m.AgentBuilderCanvasOverlayShell })), {
  ssr: false,
})

const AgentBuilderModalShellLazy = dynamic(() => import('@/components/agent-builder/shells').then((m) => ({ default: m.AgentBuilderModalShell })), {
  ssr: false,
})

const NewProjectCanvasLazy = dynamic(() => import('@/components/projects/new-project-canvas').then((m) => ({ default: m.NewProjectCanvas })), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-4">
      <img src="/lucid_w.gif" alt="Loading" className="h-10 w-10 opacity-60 dark:invert-0 invert" />
      <p className="text-base font-medium text-muted-foreground/60 animate-pulse">Loading builder...</p>
    </div>
  ),
})

// ── Types ───────────────────────────────────────────────────────────

interface AssistantsListClientProps {
  assistants: Assistant[]
  workspaceSlug: string
  workspaceId: string
  projectId?: string
  projectSlug?: string
  initialOnboardingMode?: 'create-agent' | 'create-project'
  dismissHref?: string
  inlineProjectStartPage?: boolean
  initialProjectStartSurface?: ProjectStartSurface
  hermesManagedReadiness?: EngineDeployReadiness
  hermesByoReadiness?: EngineDeployReadiness
  initialViewMode?: AgentsViewMode
  title?: string
  emptyTitle?: string
  emptyDescription?: string
  initialFeedEvents?: FeedEvent[]
  initialApprovals?: PendingApproval[]
  catalogTemplates?: TemplateCatalogEntry[]
  initialAvailableUnifiedSkills?: UnifiedSkillItem[]
  isInternal?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────

function getCsrfToken(): string | null {
  return document.cookie.match(/(^| )csrf-token=([^;]+)/)?.[2] ?? null
}

// ── Main Component ──────────────────────────────────────────────────

export function AssistantsListClient({
  assistants,
  workspaceSlug,
  workspaceId,
  projectId,
  projectSlug,
  initialOnboardingMode,
  initialViewMode = 'canvas',
  title = 'Agents',
  emptyTitle = 'Your agent fleet starts here',
  emptyDescription = 'Build your first agent and connect it to Telegram, Discord, Slack, or the web.',
  initialFeedEvents,
  initialApprovals,
  catalogTemplates = [],
  initialAvailableUnifiedSkills = [],
}: AssistantsListClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()
  const onboardingMode = searchParams?.get('onboarding') ?? initialOnboardingMode ?? null
  const focusedAgentIdFromUrl = searchParams?.get('agent') ?? searchParams?.get('createdAgent') ?? null
  const focusedTeamIdFromUrl = searchParams?.get('team') ?? searchParams?.get('crew') ?? searchParams?.get('createdTeam') ?? null
  const focusModeFromUrl = searchParams?.get('focus') ?? null
  const viewModeFromUrl = searchParams?.get('view')
  const builderModeFromUrl = searchParams?.get('builder')
  const isAgentOnboarding = onboardingMode === 'create-agent'
  const isProjectOnboarding = onboardingMode === 'create-project'
  const hasCreatedAgentHandoff = focusModeFromUrl === PROJECT_CREATION_FOCUS && Boolean(focusedAgentIdFromUrl)
  const hasCreatedTeamHandoff = focusModeFromUrl === PROJECT_CREATION_FOCUS && Boolean(focusedTeamIdFromUrl)
  const [agentBuilderOpen, setAgentBuilderOpen] = useState(false)
  const [draftAgentNodeState, setDraftAgentNodeState] = useState<{
    id: string
    label: string
    status?: string
    lifecycleState?: 'draft' | 'reviewing' | 'building' | 'deploying' | 'created' | 'failed'
    createdAgentId?: string | null
    createdCrewId?: string | null
    startedAt?: number
    prompt?: string
    focusVersion: number
  } | null>(() => focusedAgentIdFromUrl && focusModeFromUrl === PROJECT_CREATION_FOCUS
    ? {
        id: `created-agent-${focusedAgentIdFromUrl}`,
        label: 'New agent',
        status: 'Finalizing agent...',
        lifecycleState: 'deploying',
        createdAgentId: focusedAgentIdFromUrl,
        startedAt: Date.now(),
        focusVersion: 1,
      }
    : null)
  const [draftAgentPrompt, setDraftAgentPrompt] = useState('')
  const [submittedBuilderPrompt, setSubmittedBuilderPrompt] = useState('')
  const [agentBuilderSeed, setAgentBuilderSeed] = useState<BuilderSessionSeed | null>(null)
  const [agentBuilderSessionNonce, setAgentBuilderSessionNonce] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<AgentsStatusFilter>('all')
  const [viewMode, setViewMode] = useState<AgentsViewMode>(
    viewModeFromUrl === 'canvas' || viewModeFromUrl === 'grid' || viewModeFromUrl === 'list'
      ? viewModeFromUrl
      : initialViewMode,
  )
  const [feedOpen, setFeedOpen] = useState(false)
  const [isCanvasReady, setIsCanvasReady] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string; memberIds: string[] } | null>(null)
  const [promotionSourceGroup, setPromotionSourceGroup] = useState<{ id: string; name: string } | null>(null)
  const [replaceGroupAfterCreate, setReplaceGroupAfterCreate] = useState(false)
  const [replaceGroupRequest, setReplaceGroupRequest] = useState<{ groupId: string; nonce: number } | null>(null)
  const [promotionNotice, setPromotionNotice] = useState<{ title: string; description: string } | null>(null)
  const [isCrewDialogOpen, setIsCrewDialogOpen] = useState(false)
  const hasShownCreatedFocusToastRef = useRef(false)
  const hasLoggedCanvasViewRef = useRef(false)
  const appliedCreatedAgentFocusRef = useRef<string | null>(null)
  const appliedCreatedTeamFocusRef = useRef<string | null>(null)

  // ── Feature flags ────────────────────────────────────────────────
  const featureFlags = useResolvedFeatureFlags()
  const crewsEnabled = featureFlags.crewAIGeneration

  // ── Crews ──────────────────────────────────────────────────────────
  const { crews, crewMembers, crewEdges, refetch: refetchCrews } = useCrews(workspaceId, projectId)

  const selectedAgent = useMemo(
    () => (selectedAgentId ? assistants.find((a) => a.id === selectedAgentId) ?? null : null),
    [assistants, selectedAgentId],
  )
  const hasAgents = assistants.length > 0
  const hasAgentsOrTeams = assistants.length > 0 || crews.length > 0

  useEffect(() => {
    if (!focusedAgentIdFromUrl || !projectSlug) return
    const focusedAgentExists = assistants.some((assistant) => assistant.id === focusedAgentIdFromUrl)

    if (!focusedAgentExists) {
      if (focusModeFromUrl === PROJECT_CREATION_FOCUS) {
        setViewMode('canvas')
        setSelectedAgentId(null)
        setSelectedTeamId(null)
        setSelectedGroup(null)
        setDraftAgentNodeState((current) => current?.createdAgentId === focusedAgentIdFromUrl
          ? current
          : {
              id: current?.id ?? `created-agent-${focusedAgentIdFromUrl}`,
              label: current?.label ?? 'New agent',
              status: current?.status ?? 'Finalizing agent...',
              lifecycleState: current?.lifecycleState ?? 'deploying',
              createdAgentId: focusedAgentIdFromUrl,
              startedAt: current?.startedAt ?? Date.now(),
              prompt: current?.prompt,
              focusVersion: current?.focusVersion ?? 1,
            })
      }
      return
    }

    if (
      focusModeFromUrl === PROJECT_CREATION_FOCUS
      && draftAgentNodeState?.createdAgentId === focusedAgentIdFromUrl
    ) {
      return
    }

    if (appliedCreatedAgentFocusRef.current === focusedAgentIdFromUrl) return
    appliedCreatedAgentFocusRef.current = focusedAgentIdFromUrl

    const handoff = focusModeFromUrl === PROJECT_CREATION_FOCUS
      ? consumeProjectCanvasHandoff(projectSlug, focusedAgentIdFromUrl)
      : null

    setViewMode('canvas')
    setSelectedTeamId(null)
    setSelectedGroup(null)
    setDraftAgentNodeState((current) => current?.createdAgentId === focusedAgentIdFromUrl ? null : current)
    setSelectedAgentId(focusedAgentIdFromUrl)

    logProjectSurfaceTelemetry(
      focusModeFromUrl === PROJECT_CREATION_FOCUS
        ? 'project:canvas:handoff-focus'
        : 'project:canvas:view',
      {
        workspaceId,
        projectId,
        projectSlug,
        agentId: focusedAgentIdFromUrl,
        hasSessionHandoff: Boolean(handoff),
      },
    )

    if (focusModeFromUrl === PROJECT_CREATION_FOCUS && !hasShownCreatedFocusToastRef.current) {
      hasShownCreatedFocusToastRef.current = true
      toast.success('Agent created', {
        description: 'The new agent is selected on the canvas.',
      })
    }
  }, [assistants, draftAgentNodeState?.createdAgentId, focusModeFromUrl, focusedAgentIdFromUrl, projectId, projectSlug, workspaceId])
  const selectedTeam = useMemo(
    () => (selectedTeamId ? crews.find((crew) => crew.id === selectedTeamId) ?? null : null),
    [crews, selectedTeamId],
  )

  useEffect(() => {
    if (!focusedTeamIdFromUrl || !projectSlug) return
    const focusedTeamExists = crews.some((crew) => crew.id === focusedTeamIdFromUrl)

    if (!focusedTeamExists) {
      if (focusModeFromUrl === PROJECT_CREATION_FOCUS) {
        setViewMode('canvas')
        setSelectedAgentId(null)
        setSelectedTeamId(null)
        setSelectedGroup(null)
        setDraftAgentNodeState((current) => current?.createdCrewId === focusedTeamIdFromUrl
          ? current
          : {
              id: current?.id ?? `created-team-${focusedTeamIdFromUrl}`,
              label: current?.label ?? 'New team',
              status: current?.status ?? 'Finalizing team...',
              lifecycleState: current?.lifecycleState ?? 'deploying',
              createdCrewId: focusedTeamIdFromUrl,
              startedAt: current?.startedAt ?? Date.now(),
              prompt: current?.prompt,
              focusVersion: current?.focusVersion ?? 1,
            })
      }
      return
    }

    if (
      focusModeFromUrl === PROJECT_CREATION_FOCUS
      && draftAgentNodeState?.createdCrewId === focusedTeamIdFromUrl
    ) {
      return
    }

    if (appliedCreatedTeamFocusRef.current === focusedTeamIdFromUrl) return
    appliedCreatedTeamFocusRef.current = focusedTeamIdFromUrl

    const handoff = focusModeFromUrl === PROJECT_CREATION_FOCUS
      ? consumeProjectCanvasHandoff(projectSlug, focusedTeamIdFromUrl)
      : null

    setViewMode('canvas')
    setSelectedAgentId(null)
    setSelectedGroup(null)
    setDraftAgentNodeState((current) => current?.createdCrewId === focusedTeamIdFromUrl ? null : current)
    setSelectedTeamId(focusedTeamIdFromUrl)

    logProjectSurfaceTelemetry(
      focusModeFromUrl === PROJECT_CREATION_FOCUS
        ? 'project:canvas:handoff-focus'
        : 'project:canvas:view',
      {
        workspaceId,
        projectId,
        projectSlug,
        crewId: focusedTeamIdFromUrl,
        hasSessionHandoff: Boolean(handoff),
      },
    )

    if (focusModeFromUrl === PROJECT_CREATION_FOCUS && !hasShownCreatedFocusToastRef.current) {
      hasShownCreatedFocusToastRef.current = true
      toast.success('Team created', {
        description: 'The new team is selected on the canvas.',
      })
    }
  }, [crews, draftAgentNodeState?.createdCrewId, focusModeFromUrl, focusedTeamIdFromUrl, projectId, projectSlug, workspaceId])

  const featuredBuilderTemplates = useMemo(
    () => [...catalogTemplates].sort((a, b) => b.install_count - a.install_count).slice(0, 4),
    [catalogTemplates],
  )

  const builderHref = useMemo(
    () => projectSlug
      ? buildProjectAgentBuilderPath(workspaceSlug, projectSlug)
      : `/${workspaceSlug}/new?start=describe`,
    [projectSlug, workspaceSlug],
  )

  const openAgentBuilderPanel = useCallback(() => {
    if (!projectId || !projectSlug) {
      router.push(builderHref)
      return
    }
    setViewMode('canvas')
    setSelectedAgentId(null)
    setSelectedTeamId(null)
    setSelectedGroup(null)
    setDraftAgentNodeState(null)
    setDraftAgentPrompt('')
    setSubmittedBuilderPrompt('')
    setAgentBuilderOpen(true)
  }, [builderHref, projectId, projectSlug, router])

  const openAgentBuilder = useCallback(() => {
    if (!projectId || !projectSlug) {
      router.push(builderHref)
      return
    }
    if (!hasAgents) {
      openAgentBuilderPanel()
      return
    }
    setViewMode('canvas')
    setSelectedAgentId(null)
    setSelectedTeamId(null)
    setSelectedGroup(null)
    setDraftAgentNodeState((current) => current
      ? { ...current, focusVersion: current.focusVersion + 1 }
      : {
          id: `draft-agent-${crypto.randomUUID()}`,
          label: 'Agent builder',
          status: 'Describe the agent to create.',
          lifecycleState: 'draft',
          focusVersion: 1,
        })
  }, [builderHref, hasAgents, openAgentBuilderPanel, projectId, projectSlug, router])

  useEffect(() => {
    if (builderModeFromUrl === '1' && projectId && projectSlug) {
      openAgentBuilder()
      return
    }
    if (isAgentOnboarding || isProjectOnboarding) {
      if (projectId && projectSlug) {
        openAgentBuilder()
        return
      }
      router.replace(builderHref)
    }
  }, [builderHref, builderModeFromUrl, isAgentOnboarding, isProjectOnboarding, openAgentBuilder, projectId, projectSlug, router])

  useEffect(() => {
    if (!promotionNotice) return
    const timer = window.setTimeout(() => setPromotionNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [promotionNotice])

  const assistantDetailHref = useCallback((assistantId: string) => {
    const assistantProjectSlug =
      projectSlug
      ?? assistants.find((assistant) => assistant.id === assistantId)?.projectSlug
      ?? null

    return assistantProjectSlug
      ? buildProjectAgentDetailPath(workspaceSlug, assistantProjectSlug, assistantId)
      : `/${workspaceSlug}/projects`
  }, [assistants, projectSlug, workspaceSlug])

    const { events: feedEvents, isLoading: feedLoading } = useLiveFeed({ orgId: workspaceId, initialEvents: initialFeedEvents })

  // ── Approvals — real-time subscription for approval cards ────────
  const { approvals, approve, deny } = useApprovals({
    orgId: workspaceId,
    initialApprovals,
  })

  // ── Topology data — polling for MC health/cost/error data ─────────
  const [topologyData, setTopologyData] = useState<CanvasTopologyData | undefined>(undefined)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false

    const fetchTopology = async () => {
      try {
        const res = await fetch(`/api/mission-control/canvas/topology?org_id=${workspaceId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled && data.agents) {
          setTopologyData({
            agents: data.agents,
            runtimes: data.runtimes,
          })
        }
      } catch {
        // Topology is non-critical — fail silently
      }
    }

    fetchTopology()
    const interval = setInterval(fetchTopology, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [workspaceId])

  // ── Control handler — reuses MC control endpoint ─────────────────
  const handleControl = useCallback(async (action: ControlAction) => {
    if (!selectedAgentId) return
    try {
      const csrf = getCsrfToken()
      const res = await fetch(`/api/mission-control/agents/${selectedAgentId}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        toast.error(`Failed to ${action} agent`)
        return
      }
      toast.success(
        action === 'kill' ? 'Run killed'
          : action === 'escalate' ? 'Model escalated'
          : action === 'nudge' ? 'Agent nudged'
          : `Agent ${action}d`,
      )
      router.refresh()
    } catch {
      toast.error('Network error — could not reach server')
    }
  }, [selectedAgentId, router])

  // ── Derived data ──────────────────────────────────────────────────
  const teamCount = crews.length

  const filtered = useAgentListFilters({
    agents: assistants,
    searchQuery,
    statusFilter,
  })

  // ── Handlers ──────────────────────────────────────────────────────
  // Agent creation is owned by the shared builder flow.
  const handleToggleActive = useCallback(async (assistant: Assistant, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const csrf = getCsrfToken()
      const res = await fetch(`/api/assistants/${assistant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ is_active: !assistant.is_active }),
      })
      if (res.ok) {
        toast.success(assistant.is_active ? 'Agent paused' : 'Agent activated')
        router.refresh()
      } else {
        toast.error('Failed to update agent')
      }
    } catch {
      toast.error(notificationCopy.common.networkError)
    }
  }, [router])

  const isCanvas = !hasAgentsOrTeams || viewMode === 'canvas'

  useEffect(() => {
    if (!isCanvas) {
      setIsCanvasReady(false)
      return
    }
    setIsCanvasReady(false)
  }, [isCanvas, projectId, projectSlug])

  useEffect(() => {
    if (!isCanvas || focusedAgentIdFromUrl || focusedTeamIdFromUrl || hasLoggedCanvasViewRef.current) return
    hasLoggedCanvasViewRef.current = true
    logProjectSurfaceTelemetry('project:canvas:view', {
      workspaceId,
      projectId,
      projectSlug,
      source: initialViewMode === 'canvas' ? 'initial' : 'view-toggle',
    })
  }, [focusedAgentIdFromUrl, focusedTeamIdFromUrl, initialViewMode, isCanvas, projectId, projectSlug, workspaceId])

  // ── Shared header JSX — floating controls over canvas ──
  const floatingHeader = (
    <AgentsFloatingToolbar
      title={title}
      agentCount={assistants.length}
      teamCount={teamCount}
      crewsEnabled={crewsEnabled}
      hasAgents={hasAgents}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      feedOpen={feedOpen}
      feedEventCount={feedEvents.length}
      onToggleFeed={() => setFeedOpen((value) => !value)}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onCreateAgent={openAgentBuilder}
      onCreateCrew={() => openCrewDialog()}
      selectedGroup={selectedGroup}
      onClearSelectedGroup={() => setSelectedGroup(null)}
      onCreateCrewFromGroup={(groupId, name, memberIds) => handleCreateCrewFromGroup(groupId, name, memberIds)}
    />
  )

  // ── Preview panel (shared across layouts) ──
  const previewPanel = selectedAgent && isCanvas && isCanvasReady && !draftAgentNodeState?.createdAgentId && !draftAgentNodeState?.createdCrewId && (
    <motion.div
      key="preview-panel"
      initial={{ x: 460, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-0 right-0 bottom-0 w-[380px] z-20"
    >
      <AssistantPreviewPanelLazy
        assistant={selectedAgent}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectSlug={projectSlug}
        feedEvents={feedEvents}
        onClose={() => setSelectedAgentId(null)}
      />
    </motion.div>
  )

  // ── Deploying node prop for canvas ──
  useEffect(() => {
    const createdAgentId = draftAgentNodeState?.createdAgentId
    if (!createdAgentId) return
    if (!assistants.some((assistant) => assistant.id === createdAgentId)) return
    const timer = window.setTimeout(() => {
      setViewMode('canvas')
      setSelectedTeamId(null)
      setSelectedGroup(null)
      setDraftAgentNodeState((current) => current?.createdAgentId === createdAgentId ? null : current)
      setSelectedAgentId(createdAgentId)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [assistants, draftAgentNodeState?.createdAgentId])

  useEffect(() => {
    const createdCrewId = draftAgentNodeState?.createdCrewId
    if (!createdCrewId) return
    if (!crews.some((crew) => crew.id === createdCrewId)) return
    const timer = window.setTimeout(() => {
      setViewMode('canvas')
      setSelectedAgentId(null)
      setSelectedGroup(null)
      setDraftAgentNodeState((current) => current?.createdCrewId === createdCrewId ? null : current)
      setSelectedTeamId(createdCrewId)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [crews, draftAgentNodeState?.createdCrewId])

  const draftAgentNodeProp = useMemo(() => {
    if (!draftAgentNodeState) return null
    return {
      ...draftAgentNodeState,
      promptValue: draftAgentPrompt,
      featuredTemplates: featuredBuilderTemplates,
      availableUnifiedSkills: initialAvailableUnifiedSkills,
      onPromptChange: setDraftAgentPrompt,
      onSubmitPrompt: () => {
        const prompt = draftAgentPrompt.trim()
        if (!prompt) return
        setAgentBuilderSeed(null)
        setAgentBuilderSessionNonce((current) => current + 1)
        setSubmittedBuilderPrompt(prompt)
        setDraftAgentNodeState((current) => current ? {
          ...current,
          status: 'Drafting the setup...',
          lifecycleState: 'reviewing',
          prompt,
        } : current)
        setAgentBuilderOpen(true)
      },
      onOpenBuilder: () => setAgentBuilderOpen(true),
      onStartFresh: () => {
        setAgentBuilderSeed(buildBlankAssistedSessionSeed())
        setAgentBuilderSessionNonce((current) => current + 1)
        setSubmittedBuilderPrompt('')
        setAgentBuilderOpen(true)
      },
      onUploadSpec: () => {
        setAgentBuilderSeed(null)
        setAgentBuilderSessionNonce((current) => current + 1)
        setSubmittedBuilderPrompt('Create an agent from an uploaded spec.')
        setAgentBuilderOpen(true)
      },
      onSelectTemplate: (template: TemplateCatalogEntry) => {
        setAgentBuilderSeed(buildTemplateAssistedSessionSeed(template))
        setAgentBuilderSessionNonce((current) => current + 1)
        setSubmittedBuilderPrompt('')
        setAgentBuilderOpen(true)
      },
      onBrowseAllTemplates: () => router.push(`/${workspaceSlug}/new?view=templates`),
      onCancel: () => {
        setAgentBuilderOpen(false)
        setDraftAgentNodeState(null)
        setDraftAgentPrompt('')
        setSubmittedBuilderPrompt('')
        setAgentBuilderSeed(null)
      },
    }
  }, [draftAgentNodeState, draftAgentPrompt, featuredBuilderTemplates, initialAvailableUnifiedSkills, router, workspaceSlug])

  // ── Crew canvas callbacks (gated by crewsEnabled) ──
  const closeAgentBuilderCompletely = useCallback(() => {
    setAgentBuilderOpen(false)
    setDraftAgentNodeState(null)
    setDraftAgentPrompt('')
    setSubmittedBuilderPrompt('')
    setAgentBuilderSeed(null)
  }, [])

  const [crewPreselectedIds, setCrewPreselectedIds] = useState<string[]>([])
  const [crewDraftName, setCrewDraftName] = useState('')

  const resetCrewDraftState = useCallback(() => {
    setCrewPreselectedIds([])
    setCrewDraftName('')
    setPromotionSourceGroup(null)
    setReplaceGroupAfterCreate(false)
  }, [])

  const openCrewDialog = useCallback((options?: {
    assistantIds?: string[]
    initialName?: string
    promotionSourceGroup?: { id: string; name: string } | null
    replaceGroupAfterCreate?: boolean
  }) => {
    setCrewPreselectedIds(options?.assistantIds ?? [])
    setCrewDraftName(options?.initialName ?? '')
    setPromotionSourceGroup(options?.promotionSourceGroup ?? null)
    setReplaceGroupAfterCreate(options?.replaceGroupAfterCreate ?? false)
    setIsCrewDialogOpen(true)
  }, [])

  const handleCrewDialogOpenChange = useCallback((open: boolean) => {
    setIsCrewDialogOpen(open)
    if (!open) {
      resetCrewDraftState()
    }
  }, [resetCrewDraftState])

  const handleCreateCrewFromSelection = useCallback((assistantIds: string[], initialName?: string) => {
    if (!crewsEnabled) return
    openCrewDialog({ assistantIds, initialName })
  }, [crewsEnabled, openCrewDialog])

  const handleCreateCrewFromGroup = useCallback((groupId: string, name: string, assistantIds: string[]) => {
    if (!crewsEnabled) return
    openCrewDialog({
      assistantIds,
      initialName: name,
      promotionSourceGroup: { id: groupId, name },
      replaceGroupAfterCreate: true,
    })
  }, [crewsEnabled, openCrewDialog])

  const handleCrewCreated = useCallback((crewId?: string) => {
    const sourceGroupName = promotionSourceGroup?.name
    const sourceGroupId = promotionSourceGroup?.id
    const shouldReplace = replaceGroupAfterCreate
    resetCrewDraftState()
    refetchCrews()

    if (crewId) {
      setSelectedGroup(null)
      setSelectedTeamId(crewId)
        if (sourceGroupId && shouldReplace) {
          setReplaceGroupRequest({ groupId: sourceGroupId, nonce: Date.now() })
          if (sourceGroupName) {
            setPromotionNotice({
              title: notificationCopy.team.createdFromGroup,
              description: `"${sourceGroupName}" was converted into a team and opened in the side panel.`,
            })
            toast.success(notificationCopy.team.createdFromGroup)
          }
        } else if (sourceGroupName) {
          setPromotionNotice({
            title: notificationCopy.team.createdFromGroup,
            description: `"${sourceGroupName}" stayed as a draft group while the new team opened in the side panel.`,
          })
          toast.success(notificationCopy.team.createdFromGroup)
        }
    }

    router.refresh()
  }, [promotionSourceGroup?.id, promotionSourceGroup?.name, refetchCrews, replaceGroupAfterCreate, resetCrewDraftState, router])

  const handleCrewMemberAdded = useCallback(async (crewId: string, assistantId: string) => {
    if (!crewsEnabled) return
    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCsrfToken()
      const assistant = assistants.find((a) => a.id === assistantId)
      const res = await fetch(`/api/crews/${crewId}/members`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: workspaceId,
          project_id: projectId ?? undefined,
          assistant_id: assistantId,
          role: assistant?.name ?? 'member',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      toast.success('Agent added to team')
      refetchCrews()
    } catch (err) {
      toast.error('Failed to add agent to team', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [crewsEnabled, assistants, projectId, refetchCrews, workspaceId])

  const handleCrewMemberRemoved = useCallback(async (crewId: string, assistantId: string) => {
    if (!crewsEnabled) return
    try {
      // Find the member ID for this assistant in this crew
      const members = crewMembers[crewId] ?? []
      const member = members.find((m) => m.assistant_id === assistantId)
      if (!member) return
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCsrfToken()
      const params = new URLSearchParams({ org_id: workspaceId })
      if (projectId) params.set('project_id', projectId)
      const res = await fetch(`/api/crews/${crewId}/members/${member.id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      toast.success('Agent removed from team')
      refetchCrews()
    } catch (err) {
      toast.error('Failed to remove agent from team', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [crewsEnabled, crewMembers, projectId, refetchCrews, workspaceId])

  const handleCrewRenamed = useCallback(async (crewId: string, newName: string) => {
    if (!crewsEnabled) return
    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCsrfToken()
      const res = await fetch(`/api/crews/${crewId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: workspaceId,
          project_id: projectId ?? undefined,
          name: newName,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      toast.success('Team renamed')
      refetchCrews()
    } catch (err) {
      toast.error('Failed to rename team', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [crewsEnabled, projectId, refetchCrews, workspaceId])

  const handleCrewDissolved = useCallback(async (crewId: string) => {
    if (!crewsEnabled) return
    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCsrfToken()
      const params = new URLSearchParams({ org_id: workspaceId })
      if (projectId) params.set('project_id', projectId)
      const res = await fetch(`/api/crews/${crewId}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      toast.success(notificationCopy.team.dissolved)
      refetchCrews()
      router.refresh()
    } catch (err) {
      toast.error(notificationCopy.team.failedToDissolve, {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [crewsEnabled, projectId, refetchCrews, router, workspaceId])

  // ── Canvas view content ──
  const agentBuilderSession = projectId && projectSlug ? (
    <AgentBuilderSessionPanelLazy
      key={`agent-builder-session:${agentBuilderSessionNonce}`}
      workspaceId={workspaceId}
      workspaceSlug={workspaceSlug}
      initialPrompt={submittedBuilderPrompt}
      initialMessages={agentBuilderSeed?.messages ?? []}
      initialResult={agentBuilderSeed?.result ?? null}
      catalogTemplates={catalogTemplates}
      initialAvailableUnifiedSkills={initialAvailableUnifiedSkills}
      targetProjectId={projectId}
      targetProjectSlug={projectSlug}
      onClose={closeAgentBuilderCompletely}
      onCreateStart={({ label }) => {
        setAgentBuilderOpen(false)
        setDraftAgentPrompt('')
        setSubmittedBuilderPrompt('')
        setDraftAgentNodeState((current) => current ? {
          ...current,
          label,
          status: 'Building runtime...',
          lifecycleState: 'building',
          startedAt: Date.now(),
        } : {
          id: `draft-agent-${crypto.randomUUID()}`,
          label,
          status: 'Building runtime...',
          lifecycleState: 'building',
          startedAt: Date.now(),
          focusVersion: 1,
        })
        return new Promise((resolve) => window.setTimeout(resolve, 600))
      }}
      onCreateConnecting={() => {
        setDraftAgentNodeState((current) => current ? {
          ...current,
          status: 'Connecting selected apps...',
          lifecycleState: 'deploying',
        } : current)
      }}
      onCreateCreating={() => {
        setDraftAgentNodeState((current) => current ? {
          ...current,
          status: 'Creating agent...',
          lifecycleState: 'deploying',
        } : current)
        return new Promise((resolve) => window.setTimeout(resolve, 800))
      }}
      onCreateFailed={() => {
        setDraftAgentNodeState((current) => current ? {
          ...current,
          status: 'Creation failed. Retry from the builder.',
          lifecycleState: 'failed',
        } : current)
      }}
      onCreated={(created) => {
        if (created.agentId || created.crewId) {
          saveProjectCanvasHandoff({
            projectSlug: created.projectSlug,
            agentId: created.agentId,
            crewId: created.crewId,
            createdAt: Date.now(),
          })
          setViewMode('canvas')
          setSelectedAgentId(null)
          setSelectedTeamId(null)
          setSelectedGroup(null)
          setDraftAgentNodeState((current) => current ? {
            ...current,
            createdAgentId: created.agentId,
            createdCrewId: created.crewId,
            status: created.crewId ? 'Finalizing team...' : 'Finalizing agent...',
            lifecycleState: 'created',
            focusVersion: current.focusVersion + 1,
          } : {
            id: created.crewId ? `created-team-${created.crewId}` : `created-agent-${created.agentId}`,
            label: created.crewId ? 'New team' : 'New agent',
            status: created.crewId ? 'Finalizing team...' : 'Finalizing agent...',
            lifecycleState: 'created',
            createdAgentId: created.agentId,
            createdCrewId: created.crewId,
            startedAt: Date.now(),
            focusVersion: 1,
          })
          logProjectSurfaceTelemetry('project:canvas:builder-created-agent', {
            workspaceId,
            projectId,
            projectSlug: created.projectSlug,
            agentId: created.agentId,
            crewId: created.crewId,
            assistantIds: created.assistantIds,
          })
          router.replace(buildProjectAgentsHandoffPath({
            workspaceSlug,
            projectSlug: created.projectSlug,
            agentId: created.agentId,
            crewId: created.crewId,
          }))
          router.refresh()
        } else {
          setDraftAgentNodeState(null)
          router.refresh()
        }
      }}
    />
  ) : null

  const canvasContent = (
    <div className="relative h-full">
      <AgentsCanvasLazy
        assistants={filtered}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        feedEvents={feedEvents}
        initialFocusAgentId={
          focusedAgentIdFromUrl && filtered.some((assistant) => assistant.id === focusedAgentIdFromUrl)
            ? focusedAgentIdFromUrl
            : null
        }
        initialFocusTeamId={
          focusedTeamIdFromUrl && crews.some((crew) => crew.id === focusedTeamIdFromUrl)
            ? focusedTeamIdFromUrl
            : null
        }
        onAgentSelect={(id) => {
          setSelectedGroup(null)
          setSelectedTeamId(null)
          setSelectedAgentId(id)
          setFeedOpen(false)
        }}
        onTeamSelect={(id) => {
          setSelectedGroup(null)
          setSelectedAgentId(null)
          setSelectedTeamId(id)
          setFeedOpen(false)
        }}
        onGroupSelect={(group) => {
          setPromotionSourceGroup(null)
          setSelectedAgentId(null)
          setSelectedTeamId(null)
          setSelectedGroup(group)
          setFeedOpen(false)
        }}
        onAddAgent={openAgentBuilder}
        onPaneClick={() => {
          setPromotionSourceGroup(null)
          setSelectedAgentId(null)
          setSelectedTeamId(null)
          setSelectedGroup(null)
          setFeedOpen(false)
        }}
        draftAgentNode={draftAgentNodeProp}
        hideDraftAgentNode={agentBuilderOpen}
        crews={crewsEnabled ? crews : undefined}
        crewMembers={crewsEnabled ? crewMembers : undefined}
        crewEdges={crewsEnabled ? crewEdges : undefined}
        onCreateCrewFromSelection={crewsEnabled ? handleCreateCrewFromSelection : undefined}
        onCreateCrewFromGroup={crewsEnabled ? handleCreateCrewFromGroup : undefined}
        onCreateCrew={crewsEnabled ? () => openCrewDialog() : undefined}
        onCrewMemberAdded={crewsEnabled ? handleCrewMemberAdded : undefined}
        onCrewMemberRemoved={crewsEnabled ? handleCrewMemberRemoved : undefined}
        onCrewRenamed={crewsEnabled ? handleCrewRenamed : undefined}
        onCrewDissolved={crewsEnabled ? handleCrewDissolved : undefined}
        topologyData={topologyData}
        replaceGroupRequest={replaceGroupRequest}
        onReplaceGroupHandled={() => setReplaceGroupRequest(null)}
        onReady={() => setIsCanvasReady(true)}
      />
      {floatingHeader}
      <AnimatePresence>
        {agentBuilderOpen && projectId && projectSlug ? (
          isMobile ? (
            <AgentBuilderModalShellLazy
              open={agentBuilderOpen}
              onOpenChange={(open) => {
                if (!open) closeAgentBuilderCompletely()
              }}
            >
              {agentBuilderSession}
            </AgentBuilderModalShellLazy>
          ) : (
            <motion.div
              key="agent-builder-canvas-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <AgentBuilderCanvasOverlayShellLazy>
                {agentBuilderSession}
              </AgentBuilderCanvasOverlayShellLazy>
            </motion.div>
          )
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {previewPanel}
      </AnimatePresence>
      <AnimatePresence>
        {selectedTeam && isCanvas && (
          <div className="absolute top-0 right-0 bottom-0 w-[380px] z-20">
            <TeamPreviewPanelLazy
              crewId={selectedTeam.id}
              orgId={workspaceId}
              projectId={projectId}
              onClose={() => setSelectedTeamId(null)}
            />
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {promotionNotice && (
          <motion.div
            key="promotion-notice"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-20 right-4 z-20 max-w-sm rounded-2xl border border-emerald-500/25 bg-background/95 p-4 shadow-xl backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-emerald-500/10 p-1">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{promotionNotice.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {promotionNotice.description}
                </p>
              </div>
              <button
                onClick={() => setPromotionNotice(null)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Dismiss promotion notice"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-in Live Feed panel */}
      <AnimatePresence>
      {feedOpen && (
        <motion.div
          key="feed-panel"
          initial={{ x: 480, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 480, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute top-0 right-0 bottom-0 w-[460px] z-30 border-l bg-background/95 backdrop-blur-sm shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Live Feed</span>
              {feedEvents.length > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
            <button
              onClick={() => setFeedOpen(false)}
              className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close feed"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="h-[calc(100%-41px)] overflow-hidden">
            <OperationsConsoleLazy
              feedEvents={feedEvents}
              feedLoading={feedLoading}
              approvals={approvals}
              onApprove={approve}
              onDeny={deny}
              selectedAgent={selectedAgent}
              onControl={handleControl}
            />
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )

  const crewDialog = crewsEnabled ? (
    <CreateCrewDialogLazy
      open={isCrewDialogOpen}
      onOpenChange={handleCrewDialogOpenChange}
      assistants={assistants}
      orgId={workspaceId}
      projectId={projectId}
      initialName={crewDraftName}
      sourceGroupName={promotionSourceGroup?.name}
      replaceGroupAfterCreate={replaceGroupAfterCreate}
      onReplaceGroupAfterCreateChange={setReplaceGroupAfterCreate}
      preselectedAssistantIds={crewPreselectedIds}
      onCreated={handleCrewCreated}
    />
  ) : null

  // ── Canvas mode: full-height canvas with slide-in feed panel ──
  const handleEmptyAgentCreated = useCallback((created: CreateAgentFromBuilderDraftResult) => {
    if (!created.agentId && !created.crewId) {
      router.refresh()
      return
    }

    saveProjectCanvasHandoff({
      projectSlug: created.projectSlug,
      agentId: created.agentId,
      crewId: created.crewId,
      createdAt: Date.now(),
    })
    logProjectSurfaceTelemetry('project:canvas:builder-created-agent', {
      workspaceId,
      projectId,
      projectSlug: created.projectSlug,
      agentId: created.agentId,
      crewId: created.crewId,
      assistantIds: created.assistantIds,
    })
    setViewMode('canvas')
    setSelectedAgentId(null)
    setSelectedTeamId(null)
    setSelectedGroup(null)
    setDraftAgentNodeState({
      id: created.crewId ? `created-team-${created.crewId}` : `created-agent-${created.agentId}`,
      label: created.crewId ? 'New team' : 'New agent',
      status: created.crewId ? 'Finalizing team...' : 'Finalizing agent...',
      lifecycleState: 'created',
      createdAgentId: created.agentId,
      createdCrewId: created.crewId,
      startedAt: Date.now(),
      focusVersion: 1,
    })
    router.replace(buildProjectAgentsHandoffPath({
      workspaceSlug,
      projectSlug: created.projectSlug,
      agentId: created.agentId,
      crewId: created.crewId,
    }))
    router.refresh()
  }, [projectId, router, workspaceId, workspaceSlug])

  if (isCanvas) {
    if (!hasAgentsOrTeams && projectId && projectSlug && !hasCreatedAgentHandoff && !hasCreatedTeamHandoff && !draftAgentNodeState?.createdAgentId && !draftAgentNodeState?.createdCrewId) {
      return (
        <div className="flex-1 relative h-full">
          <NewProjectCanvasLazy
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            catalogTemplates={catalogTemplates}
            initialAvailableUnifiedSkills={initialAvailableUnifiedSkills}
            targetProjectId={projectId}
            targetProjectSlug={projectSlug}
            embedded
            urlBasePath={`/${workspaceSlug}/projects/${projectSlug}/agents`}
            onCreated={handleEmptyAgentCreated}
          />
        </div>
      )
    }

    return (
      <div className="flex-1 relative h-full">
        {canvasContent}
        <CopilotTriggerLazy orgId={workspaceId} />
        {crewDialog}
      </div>
    )
  }

  // ── Grid / List views — unchanged, no console ──
  return (
    <div className="flex-1 relative h-full">
      {floatingHeader}

      {/* ── Content area (below floating header) ── */}
      <div className="relative z-0 pt-16 px-4 pb-4 overflow-y-auto h-full">
        {crewsEnabled && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => openCrewDialog()}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-accent px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors duration-150 hover:border-primary/50 hover:bg-accent/80"
            >
              <Users className="h-3.5 w-3.5" />
              Create Team
            </button>
          </div>
        )}

        {assistants.length === 0 && (
          <AssistantsEmptyState
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            onCreateAgent={openAgentBuilder}
          />
        )}

        {assistants.length > 0 && filtered.length === 0 && (
          <AssistantsNoResults />
        )}

      {/* ── Grid View ── */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <AssistantsGridView
          assistants={filtered}
          assistantDetailHref={assistantDetailHref}
          feedEvents={feedEvents}
          approvals={approvals}
          onToggleActive={handleToggleActive}
        />
      )}

      {/* ── List View ── */}
      {filtered.length > 0 && viewMode === 'list' && (
        <AssistantsListView
          assistants={filtered}
          assistantDetailHref={assistantDetailHref}
          feedEvents={feedEvents}
          approvals={approvals}
          onToggleActive={handleToggleActive}
        />
      )}
      </div>
      <CopilotTriggerLazy orgId={workspaceId} />

      {crewDialog}
    </div>
  )
}

export const AgentsListClient = AssistantsListClient
