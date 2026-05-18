'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import {
  Settings2,
  MessageSquare,
  Activity,
  LayoutDashboard,
  PanelLeft,
  PanelRight,
  Save,
  Zap,
} from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useAssistantKeyboard } from '@/hooks/use-assistant-keyboard'
import { useRegisterCommands, type RegisteredCommand } from '@/components/command-palette'
import { ResizablePanelLayout } from '@/components/panels/resizable-layout'
import { StatusBar } from '@/components/panels/status-bar'
import { CommandBar } from '@/components/panels/command-bar'
import { ConfigPanel, type ConfigSection, DEFAULT_SECTION_ICONS } from '@/components/assistant/config-panel'
import { InlineChatPanel } from '@/components/assistant/inline-chat-panel'
import { LiveFeedPane } from '@/components/mission-control/command-center/live-feed-pane'
import type { FeedEvent, ChatStatus } from '@/lib/mission-control/types'
import { MetricsBar } from '@/components/panels/metrics-bar'
import { MobilePanelSwitcher } from '@/components/panels/mobile-panel-switcher'
import { useCommandPalette } from '@/components/command-palette'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAgentPresence } from '@/hooks/use-agent-presence'
import { cn } from '@/lib/utils'
import { useRealtimeMetrics } from '@/hooks/use-realtime-metrics'
import { IntrospectionStream, ConfigIconRail, HeroStream, RunTimelineBar, StreamNode as StreamNodeComponent, TraceInspector } from '@/components/introspection'
import { BuildHero } from '@/components/assistant/build-hero'
import { BuildSummaryRows } from '@/components/assistant/build-summary-rows'
import {
  mapAssistantChannelsToSummaryItems,
  mapScheduledTasksToSummaryItems,
  mapUnifiedSkillsToSummaryItems,
} from '@/components/assistant/view-models'
import { LivingActivityStream } from '@/components/assistant/living-activity-stream'
import { GhostActivity } from '@/components/assistant/ghost-activity'
import { OverviewSection } from '@/components/assistant/sections/overview-section'
import { AgentPulse } from '@/components/introspection/hero/agent-pulse'
import { EMOTION_VISUALS } from '@/components/introspection/emotion-visuals'
import { RunSummaryCard } from '@/components/introspection/run-summary-card'
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context'
import { getChannelUiStats } from '@/lib/channels/types'
import { useIntrospectionStream } from '@/hooks/use-introspection-stream'
import { useRunHistory } from '@/hooks/use-run-history'
import { useToolUsageStats } from '@/hooks/use-tool-usage-stats'
import { useSmartAnnotations } from '@/hooks/use-smart-annotations'
import { useContextualSections } from '@/hooks/use-contextual-sections'
import { AutoSaveIndicator } from '@/components/forms/auto-save-indicator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfigSectionDialog } from '@/components/assistant/config-section-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { useActiveSectionId, useDetailSidebarActionsOptional } from '@/contexts/detail-sidebar-context'
import type { DetailNavGroup } from '@/contexts/detail-sidebar-context'
import type { AssistantLiveSurfaces } from '@/components/assistant/live-surfaces'

// Section icons for command palette — reuses DEFAULT_SECTION_ICONS from config-panel (single source of truth)

interface AssistantCommandCenterProps {
  /** Assistant name for the status bar */
  name: string
  /** Called when user edits the name inline */
  onNameChange?: (name: string) => void
  /** Model identifier for the status bar */
  model?: string
  /** Whether the assistant is active */
  active?: boolean
  /** Auto-save status */
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  /** Navigate back handler */
  onBack?: () => void
  /** Manual save trigger */
  onSave?: () => void

  /** Config panel sections */
  configSections: ConfigSection[]

  /** Chat panel props */
  chatProps: {
    assistantId: string
    assistantName: string
    lucidModel?: string
    orgId?: string
    isActive?: boolean
  }

  /** Activity feed events */
  activityEvents?: FeedEvent[]

  /** Whether the activity feed is loading */
  feedLoading?: boolean

  /** Whether the activity feed connection is healthy */
  feedConnected?: boolean

  /** Metrics for the right panel */
  metrics?: Array<{
    label: string
    value: number
    prefix?: string
    suffix?: string
    decimals?: number
    trend?: number[]
    color?: string
  }>

  /** Introspection stream data — channels, tasks, last memory for idle view */
  introspectionData?: {
    channels?: Array<{
      type: string
      name?: string
      message_count?: number
    }>
    tasks?: Array<{
      id: string
      label: string
      next_run_at?: string
    }>
    lastMemory?: {
      content: string
      created_at: string
    } | null
  }

  /** Health data */
  healthData?: import('@/hooks/use-health-score').AgentHealthScore | null
  /** Channels */
  channels?: import('@/types/agent').AgentChannel[]
  /** Cost today */
  costTodayUsd?: number

  /** Total memories count */
  memoriesTotal?: number
  /** Whether memory is enabled */
  memoryEnabled?: boolean
  /** Assigned runtime ID */
  runtimeId?: string | null
  /** Available runtimes */
  runtimes?: import('@/lib/mission-control/types').DedicatedRuntime[]
  /** Scheduled tasks */
  tasks?: import('@/lib/mission-control/types').ScheduledTask[]
  /** Whether wallet is enabled */
  walletEnabled?: boolean
  /** Number of installed skills */
  skillsCount?: number
  /** Current unified skills for identity chips and summary rows */
  skills?: import('@contracts/unified-skill').UnifiedSkillItem[]
  /** Recent completed run count */
  recentRunCount?: number
  /** One-line mission / purpose (first sentence of system prompt or soul) */
  mission?: string
  /** Agent engine (openclaw, langchain, etc.) */
  engine?: string | null
  /** Toggle agent active/paused (Live/Standby) */
  onToggleActive?: (active: boolean) => void

  /** Save agent as a reusable template */
  onSaveAsTemplate?: () => void

  /** Extra dialogs/modals to render (portaled, so position doesn't matter) */
  dialogs?: React.ReactNode

  /** Report which live operational surfaces are actually visible */
  onLiveSurfacesChange?: (surfaces: AssistantLiveSurfaces) => void

  /** Optional hook when a config-section modal is dismissed */
  onConfigSectionModalClose?: (sectionId: string) => void

  className?: string
}

export function AssistantCommandCenter({
  name,
  onNameChange,
  model,
  active = true,
  saveStatus,
  onBack,
  onSave,
  configSections,
  chatProps,
  activityEvents = [],
  feedLoading = false,
  feedConnected = true,
  healthData,
  channels = [],
  costTodayUsd,
  metrics = [],
  introspectionData,
  memoriesTotal,
  memoryEnabled,
  runtimeId,
  runtimes,
  tasks,
  walletEnabled,
  skillsCount,
  skills = [],
  recentRunCount,
  mission,
  engine,
  onToggleActive,
  onSaveAsTemplate,
  dialogs,
  onLiveSurfacesChange,
  onConfigSectionModalClose,
  className,
}: AssistantCommandCenterProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isTablet = useMediaQuery('(min-width: 768px)')
  const { setOpen: openPalette } = useCommandPalette()
  const flags = useResolvedFeatureFlags()
  const introspectionEnabled = flags.introspectionStream ?? false

  // Track chat status for presence derivation
  const [chatStatus, setChatStatus] = useState<ChatStatus>('ready')

  // External section open (for + buttons in summary rows)

  // Agent presence — derives state, last activity, sparkline from events + chat status
  const presence = useAgentPresence(activityEvents, chatStatus, feedConnected)

  // Right panel state: null=closed, 'chat'=chat tab, 'activity'=feed tab
  const [rightPanel, setRightPanel] = useState<'chat' | 'activity' | null>(null)
  const setChatOpen = (open: boolean) => setRightPanel(open ? 'chat' : null)
  // Mobile: expanded run ID for inline stream view
  const [mobileExpandedRunId, setMobileExpandedRunId] = useState<string | null>(null)
  const [mobileActiveTab, setMobileActiveTab] = useState<string>(introspectionEnabled ? 'stream' : 'chat')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedTraceNodeId, setSelectedTraceNodeId] = useState<string | null>(null)

  // Introspection stream data for hero layout
  const introspectionState = useIntrospectionStream({
    orgId: chatProps.orgId ?? '',
    agentId: chatProps.assistantId,
    enabled: introspectionEnabled,
  })
  const runs = useRunHistory(introspectionState.nodes)
  const toolStats = useToolUsageStats(introspectionState.nodes)
  const annotations = useSmartAnnotations(runs, introspectionState.nodes)
  const pendingTaskCount = (tasks ?? []).filter(
    (t) => t.status === 'pending' || t.status === 'claimed' || t.status === 'running',
  ).length
  const channelStats = useMemo(() => getChannelUiStats(channels), [channels])
  const sectionHighlights = useContextualSections({
    emotion: introspectionState.emotion,
    isActive: introspectionState.isActive,
    healthScore: healthData?.overall_score ?? null,
    channelCount: channelStats.total,
    pendingTaskCount,
  })

  // Split contexts: actions (stable, write-only) vs read (re-renders on changes)
  const sidebarActions = useDetailSidebarActionsOptional()
  const sidebarActiveSectionId = useActiveSectionId()
  // Bumped when user clicks "Main menu" to unregister, then needs to re-register
  const [sidebarDismissed, setSidebarDismissed] = useState(false)
  // Remember which section was active before dismiss so we restore it on re-show
  const lastSectionRef = useRef<string | null>(null)
  // Track if we just came back from a dismiss — prevents unnecessary setActiveSectionId on regular registrations
  const wasDismissedRef = useRef(false)

  // Track active section changes so we can restore on re-show
  useEffect(() => {
    if (sidebarActiveSectionId !== null) {
      lastSectionRef.current = sidebarActiveSectionId
    }
  }, [sidebarActiveSectionId])

  // Reset dismissed state when navigating to an agent (same or different).
  // For same-agent re-clicks, the SidebarSwitch won't see isDetailPage so it renders
  // the workspace sidebar — clicking the link should re-show the detail sidebar.
  // We listen for the custom event dispatched from the workspace sidebar link click.
  useEffect(() => {
    const handler = () => setSidebarDismissed(false)
    window.addEventListener('lucid:show-detail-sidebar', handler)
    return () => window.removeEventListener('lucid:show-detail-sidebar', handler)
  }, [])

  // Grouping for sidebar nav items
  const ENGAGE_SECTION_IDS = useMemo(() => new Set(['channels', 'skills', 'memories', 'tasks']), [])

  // Build generic nav groups from config sections
  const navGroups = useMemo<DetailNavGroup[]>(() => {
    const engageItems = configSections
      .filter(s => ENGAGE_SECTION_IDS.has(s.id))
      .map(s => ({
        id: s.id,
        label: s.title,
        icon: DEFAULT_SECTION_ICONS[s.id] ?? s.icon,
        badge: s.badge,
        highlight: sectionHighlights[s.id] ?? undefined,
      }))

    const configureItems = configSections
      .filter(s => !ENGAGE_SECTION_IDS.has(s.id))
      .map(s => ({
        id: s.id,
        label: s.title,
        icon: DEFAULT_SECTION_ICONS[s.id] ?? s.icon,
        badge: s.badge,
        highlight: sectionHighlights[s.id] ?? undefined,
      }))

    return [
      {
        id: 'primary',
        items: [
          { id: '__overview', label: 'Overview', icon: LayoutDashboard },
          { id: '__chat', label: 'Chat', icon: MessageSquare },
          { id: '__activity', label: 'Activity', icon: Activity },
        ],
      },
      { id: 'engage', label: 'Engage', items: engageItems },
      { id: 'configure', label: 'Configure', items: configureItems },
    ]
  }, [configSections, ENGAGE_SECTION_IDS, sectionHighlights])

  // Stable key for nav group content — tracks meaningful changes without object identity issues
  const navGroupsKey = useMemo(() =>
    navGroups.flatMap(g => g.items.map(i => `${i.id}:${i.badge ?? ''}:${i.highlight ?? ''}`)).join('|'),
    [navGroups],
  )

  // Keep latest navGroups in ref (changes identity every render)
  const navGroupsRef = useRef(navGroups)
  navGroupsRef.current = navGroups

  // Registration effect — sidebarActions has stable identity, so no loop risk
  useEffect(() => {
    if (!sidebarActions || sidebarDismissed) {
      if (sidebarDismissed) sidebarActions?.unregister()
      return
    }
    sidebarActions.register({
      identity: {
        name,
        statusDot: active ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground',
        statusLabel: active ? 'Live' : 'Idle',
      },
      backLabel: 'Main menu',
      onBack: () => { wasDismissedRef.current = true; setSidebarDismissed(true) },
      navGroups: navGroupsRef.current,
      saveStatus,
      _navKey: navGroupsKey,
    })
    // Restore last active section only when coming back from dismiss (not on regular re-registrations)
    if (wasDismissedRef.current && lastSectionRef.current) {
      wasDismissedRef.current = false
      sidebarActions.setActiveSectionId(lastSectionRef.current)
    }
  }, [sidebarActions, name, active, saveStatus, navGroupsKey, sidebarDismissed])

  // Unregister only on true unmount
  useEffect(() => {
    return () => sidebarActions?.unregister()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Navigate to a sidebar section — also re-shows agent sidebar if it was dismissed
  const goToSection = useCallback((sectionId: string) => {
    if (sidebarDismissed) setSidebarDismissed(false)
    sidebarActions?.setActiveSectionId(sectionId)
  }, [sidebarDismissed, sidebarActions])

  // Config drawer state — configure items open in a Sheet instead of inline
  const [drawerSectionId, setDrawerSectionId] = useState<string | null>(null)

  // Sidebar-driven section/panel switching
  // sidebarActiveSectionId already set above via useActiveSectionId()
  // Skip when sidebar is dismissed — don't let the null from unregister() reset the view
  useEffect(() => {
    if (sidebarDismissed) return
    if (sidebarActiveSectionId === '__chat') {
      setRightPanel('chat')
      setDrawerSectionId(null)
    } else if (sidebarActiveSectionId === '__activity') {
      setRightPanel('activity')
      setDrawerSectionId(null)
    } else if (sidebarActiveSectionId === '__overview' || sidebarActiveSectionId === null) {
      setDrawerSectionId(null)
    } else {
      // Config section — open in drawer
      setDrawerSectionId(sidebarActiveSectionId)
    }
  }, [sidebarActiveSectionId, sidebarDismissed])

  // Find the config section for the drawer
  const drawerConfigSection = useMemo(() => {
    if (!drawerSectionId) return null
    return configSections.find(s => s.id === drawerSectionId) ?? null
  }, [drawerSectionId, configSections])
  const defaultConfigSectionId = useMemo(() => {
    const preferred = configSections.find((section) => section.id === 'settings')
    return preferred?.id ?? configSections[0]?.id ?? null
  }, [configSections])

  const liveSurfaces = useMemo<AssistantLiveSurfaces>(() => {
    const activityVisible = isDesktop
      ? introspectionEnabled
        ? rightPanel === 'activity'
        : true
      : !isTablet && mobileActiveTab === 'activity'
    const metricsVisible = activityVisible
    const runtimesVisible = drawerSectionId === 'runtime'
    const healthVisible = drawerSectionId === 'health'

    return {
      activity: activityVisible,
      metrics: metricsVisible,
      runtimes: runtimesVisible,
      health: healthVisible,
    }
  }, [drawerSectionId, introspectionEnabled, isDesktop, isTablet, mobileActiveTab, rightPanel])

  useEffect(() => {
    onLiveSurfacesChange?.(liveSurfaces)
  }, [liveSurfaces, onLiveSurfacesChange])

  const { data: realtimeData } = useRealtimeMetrics(chatProps.orgId ?? '', {
    enabled: liveSurfaces.metrics,
    live: liveSurfaces.metrics,
  })

  const runLevelMetrics = useMemo(() => {
    if (metrics.length > 0) return metrics
    if (!liveSurfaces.metrics) return []

    return [
      {
        label: 'Runs',
        value: realtimeData.total_runs_24h,
      },
      {
        label: 'Errors',
        value: realtimeData.errors_24h,
        color: '#ef4444',
      },
      {
        label: 'Cost',
        value: realtimeData.cost_today_usd,
        prefix: '$',
        decimals: 2,
        color: '#10b981',
      },
    ]
  }, [liveSurfaces.metrics, metrics, realtimeData.cost_today_usd, realtimeData.errors_24h, realtimeData.total_runs_24h])
  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId],
  )
  const selectedRunNodes = useMemo(
    () => (selectedRun ? introspectionState.nodes.filter((node) => node.runId === selectedRun.runId) : []),
    [introspectionState.nodes, selectedRun],
  )
  const selectedTraceNode = useMemo(
    () => selectedRunNodes.find((node) => node.id === selectedTraceNodeId) ?? selectedRunNodes[0] ?? null,
    [selectedRunNodes, selectedTraceNodeId],
  )
  const openFocusMode = useCallback((mode: 'overview' | 'config' | 'runs' | 'activity') => {
    if (mode === 'overview') {
      setRightPanel(null)
      setDrawerSectionId(null)
      setSelectedRunId(null)
      setSelectedTraceNodeId(null)
      sidebarActions?.setActiveSectionId('__overview')
      return
    }

    if (mode === 'config') {
      if (!defaultConfigSectionId) return
      setRightPanel(null)
      setSelectedRunId(null)
      setSelectedTraceNodeId(null)
      setDrawerSectionId(defaultConfigSectionId)
      sidebarActions?.setActiveSectionId(defaultConfigSectionId)
      return
    }

    if (mode === 'runs') {
      const latestRun = runs[0]
      if (latestRun) {
        setSelectedRunId(latestRun.runId)
        setSelectedTraceNodeId(null)
      } else {
        setSelectedRunId(null)
      }
      setRightPanel(introspectionEnabled ? null : 'activity')
      sidebarActions?.setActiveSectionId('__activity')
      return
    }

    setSelectedRunId(null)
    setSelectedTraceNodeId(null)
    setRightPanel('activity')
    sidebarActions?.setActiveSectionId('__activity')
  }, [defaultConfigSectionId, introspectionEnabled, runs, sidebarActions])
  const focusModes = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'config' as const, label: 'Config' },
    { id: 'runs' as const, label: 'Runs' },
    { id: 'activity' as const, label: 'Activity' },
  ]
  const activeFocusMode = selectedRunId
    ? 'runs'
    : drawerSectionId
      ? 'config'
      : rightPanel === 'activity'
        ? 'activity'
        : 'overview'

  // Build vs Operate mode detection
  const hasConnectedChannels = channelStats.connected > 0
  const hasRuntime = Boolean(runtimeId)
  const hasMeaningfulActivity = (recentRunCount ?? 0) > 0
  const isBuildMode = !hasConnectedChannels && !hasRuntime && !hasMeaningfulActivity

  const activeFocusSummary = useMemo(() => {
    if (activeFocusMode === 'overview') {
      return {
        title: 'Overview',
        detail: isBuildMode
          ? 'Shape the operator, connect the first channel, and get to one real receipt quickly.'
          : 'Read the current operating state before you change behavior, tools, or runtime posture.',
      }
    }
    if (activeFocusMode === 'config') {
      return {
        title: drawerConfigSection?.title ?? 'Configuration',
        detail: 'Change one domain at a time. Behavior, tools, memory, channels, and runtime stay separated here.',
      }
    }
    if (activeFocusMode === 'runs') {
      return {
        title: selectedRun ? `Run ${selectedRun.runId.slice(0, 8)}` : 'Recent runs',
        detail: 'Inspect the latest receipts, then drill into the exact step, tool call, or decision that needs attention.',
      }
    }
    return {
      title: 'Activity',
      detail: 'Watch the live operational stream, agent events, and runtime signals without leaving the current page.',
    }
  }, [activeFocusMode, drawerConfigSection?.title, isBuildMode, selectedRun])

  // Panel refs for focus management
  const configRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const activityRef = useRef<HTMLDivElement>(null)

  // Focus helpers
  const focusPanel = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    const el = ref.current
    if (!el) return
    const focusable = el.querySelector<HTMLElement>(
      'input, textarea, button, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable) focusable.focus()
    else el.focus()
  }, [])

  // Keyboard shortcuts (⌘S, ⌘1/2/3)
  useAssistantKeyboard({
    onSave,
    onFocusConfig: () => focusPanel(configRef),
    onFocusChat: () => focusPanel(chatRef),
    onFocusActivity: () => focusPanel(activityRef),
  })

  // Register contextual commands into the global ⌘K palette
  const commands = useMemo<RegisteredCommand[]>(() => {
    const cmds: RegisteredCommand[] = []

    // Actions
    if (onSave) {
      cmds.push({
        id: 'assistant:save',
        label: 'Save now',
        icon: <Save className="h-4 w-4" />,
        group: 'Actions',
        shortcut: '⌘S',
        onSelect: onSave,
        priority: 0,
      })
    }

    // Panels
    cmds.push(
      {
        id: 'assistant:focus-config',
        label: 'Focus config panel',
        icon: <PanelLeft className="h-4 w-4" />,
        group: 'Panels',
        shortcut: '⌘1',
        onSelect: () => focusPanel(configRef),
        priority: 10,
      },
      {
        id: 'assistant:focus-chat',
        label: 'Focus chat panel',
        icon: <MessageSquare className="h-4 w-4" />,
        group: 'Panels',
        shortcut: '⌘2',
        onSelect: () => focusPanel(chatRef),
        priority: 11,
      },
      {
        id: 'assistant:focus-activity',
        label: 'Focus activity panel',
        icon: <Activity className="h-4 w-4" />,
        group: 'Panels',
        shortcut: '⌘3',
        onSelect: () => focusPanel(activityRef),
        priority: 12,
      },
    )

    // Jump to section
    for (const section of configSections) {
      cmds.push({
        id: `assistant:section-${section.id}`,
        label: `Go to ${section.title}`,
        icon: DEFAULT_SECTION_ICONS[section.id] ?? section.icon,
        group: 'Jump to section',
        onSelect: () => goToSection(section.id),
        keywords: [section.title, section.id],
        priority: 20,
      })
    }

    return cmds
  }, [onSave, configSections, focusPanel, goToSection])

  useRegisterCommands(commands)

  // Shared panel content
  const configContent = (
    <div ref={configRef} className="h-full border-r border-border lg:border-r-0" tabIndex={-1}>
      <ConfigPanel sections={configSections} />
    </div>
  )

  const chatContent = (
    <div ref={chatRef} className="h-full overflow-hidden" tabIndex={-1}>
      <InlineChatPanel
        assistantId={chatProps.assistantId}
        assistantName={chatProps.assistantName}
        lucidModel={chatProps.lucidModel}
        orgId={chatProps.orgId}
        isActive={chatProps.isActive}
        onChatStatusChange={setChatStatus}
      />
    </div>
  )

  const activityContent = introspectionEnabled ? (
    <div ref={activityRef} className="h-full flex flex-col border-l border-border lg:border-l-0" tabIndex={-1}>
      {/* Consciousness Stream — primary content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <IntrospectionStream
          orgId={chatProps.orgId ?? ''}
          agentId={chatProps.assistantId}
          enabled={introspectionEnabled}
          channels={introspectionData?.channels}
          tasks={introspectionData?.tasks}
          lastMemory={introspectionData?.lastMemory}
        />
      </div>
      {/* Run-level metrics — distinct from operational strip (health/activity/cost) */}
      {runLevelMetrics.length > 0 && <MetricsBar metrics={runLevelMetrics} />}
      <div className="border-t border-border max-h-[40%] overflow-y-auto">
        <LiveFeedPane
          events={activityEvents}
          showHeader={true}
          loading={feedLoading}
        />
      </div>
    </div>
  ) : (
    <ScrollArea ref={activityRef} className="h-full border-l border-border lg:border-l-0" tabIndex={-1}>
      {runLevelMetrics.length > 0 && <MetricsBar metrics={runLevelMetrics} />}
      <LiveFeedPane
        events={activityEvents}
        showHeader={true}
        loading={feedLoading}
      />
    </ScrollArea>
  )

  const shortcuts = [
    { keys: '⌘K', label: 'Commands' },
    { keys: '⌘S', label: 'Save' },
    { keys: '⌘1/2/3', label: 'Panels' },
  ]

  const configLaunchCards = useMemo(
    () =>
      configSections.map((section) => ({
        id: section.id,
        title: section.title,
        badge: section.badge,
        icon: DEFAULT_SECTION_ICONS[section.id] ?? section.icon,
      })),
    [configSections],
  )

  return (
    <div className={cn('flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-background', className)}>
      {/* StatusBar only for non-introspection layouts — hero layout has identity in the hero */}
      {!(isDesktop && introspectionEnabled) && (
        <StatusBar
          name={name}
          onNameChange={onNameChange}
          model={model}
          active={active}
          saveStatus={saveStatus}
          onBack={onBack}
          presence={presence}
          onSaveAsTemplate={onSaveAsTemplate}
        />
      )}

      <div className="border-b border-border/60 bg-background/80 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {focusModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => openFocusMode(mode.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                activeFocusMode === mode.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-0.5">
          <div className="text-sm font-medium text-foreground">{activeFocusSummary.title}</div>
          <div className="text-xs text-muted-foreground">{activeFocusSummary.detail}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {isDesktop && introspectionEnabled ? (
          /* ── Hero Stream Layout (sidebar-driven navigation) ────────── */
          <div className="flex h-full">
            {/* Main content area — shows hero overview OR focused config section */}
            <div className="flex-1 min-h-0 flex">
              <div className="flex-1 min-h-0 flex flex-col relative">
                {/* Ghost activity — live system brain in the right zone (rendered first so it sits behind content) */}
                {rightPanel === null && (
                  <GhostActivity
                    emotion={introspectionState.emotion}
                    isActive={introspectionState.isActive}
                    hasChannels={channelStats.total > 0}
                    channelCount={channelStats.connected}
                    activityEvents={activityEvents}
                  />
                )}
                {activeFocusMode === 'config' ? (
                  <ScrollArea className="flex-1 h-full">
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-8">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Configuration domains</p>
                        <p className="text-sm text-muted-foreground">
                          Open one domain at a time so behavior, runtime, memory, channels, and safety controls stay clearly separated.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {configLaunchCards.map((section) => (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => goToSection(section.id)}
                            className="rounded-xl border border-border bg-card/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{section.icon}</span>
                                {section.title}
                              </span>
                              {section.badge != null ? (
                                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {section.badge}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                              Open this domain in the focused config drawer without mixing it into runs or live activity.
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                ) : activeFocusMode === 'runs' ? (
                  <ScrollArea className="flex-1 h-full">
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-8">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Run receipts</p>
                        <p className="text-sm text-muted-foreground">
                          Start with the run list, then inspect the exact execution nodes that explain the current state.
                        </p>
                      </div>
                      <RunTimelineBar runs={runs} onRunClick={setSelectedRunId} />
                      {selectedRunNodes.length > 0 ? (
                        <div className="rounded-xl border border-border bg-card/60 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                Run {selectedRun?.runId.slice(0, 8)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {selectedRunNodes.length} execution node{selectedRunNodes.length === 1 ? '' : 's'} captured for this run.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedRunId(null)}
                              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              Clear selection
                            </button>
                          </div>
                          <div className="space-y-3">
                            {selectedRunNodes.map((node) => (
                              <StreamNodeComponent
                                key={node.id}
                                node={node}
                                onExpand={(expandedNode) => setSelectedTraceNodeId(expandedNode.id)}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                          No run is selected yet. Pick a receipt above to inspect its execution path.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : isBuildMode ? (
                  /* Build mode — overview */
                  <ScrollArea className="flex-1 h-full">
                    <BuildHero
                      name={name}
                      mission={mission}
                      onNameChange={onNameChange}
                      emotion="idle"
                      channels={channels}
                      lastEvent={activityEvents[0] ?? null}
                      onConnectChannel={() => goToSection('channels')}
                      onOpenChat={() => { goToSection('__chat'); setRightPanel('chat') }}
                      onOpenActivity={() => { goToSection('__activity'); setRightPanel('activity') }}
                      hasChannels={channelStats.total > 0}
                      hasRuntime={Boolean(runtimeId)}
                      isActive={false}
                      isLive={active}
                      onToggleLive={onToggleActive}
                    />
                    <LivingActivityStream
                      emotion="idle"
                      presenceState="idle"
                      channels={channels}
                      activityEvents={activityEvents}
                      lastEvent={activityEvents[0] ?? null}
                    />
                    <div className="border-t border-border/50 mx-14 max-w-[832px]" />
                    <BuildSummaryRows
                      healthData={healthData ?? null}
                      runtimeId={runtimeId}
                      runtimes={runtimes ?? []}
                      memoriesTotal={memoriesTotal ?? 0}
                      memoryEnabled={memoryEnabled ?? true}
                      tasks={mapScheduledTasksToSummaryItems(tasks ?? [])}
                      channels={mapAssistantChannelsToSummaryItems(channels)}
                      skills={mapUnifiedSkillsToSummaryItems(skills)}
                      costTodayUsd={costTodayUsd}
                      engine={engine}
                      onTabChange={(id) => goToSection(id)}
                      onAddChannel={() => goToSection('channels')}
                      onAddSkill={() => goToSection('skills')}
                    />
                  </ScrollArea>
                ) : (
                  /* Operate mode */
                  <ScrollArea className="flex-1 h-full">
                    <BuildHero
                      name={name}
                      mission={mission}
                      onNameChange={onNameChange}
                      emotion={introspectionState.emotion}
                      channels={channels}
                      lastEvent={activityEvents[0] ?? null}
                      onConnectChannel={() => goToSection('channels')}
                      onOpenChat={() => { goToSection('__chat'); setRightPanel('chat') }}
                      onOpenActivity={() => { goToSection('__activity'); setRightPanel('activity') }}
                      hasChannels={channelStats.total > 0}
                      hasRuntime={Boolean(runtimeId)}
                      isActive={introspectionState.isActive}
                      isLive={active}
                      onToggleLive={onToggleActive}
                    />
                    <LivingActivityStream
                      emotion={introspectionState.emotion}
                      presenceState={presence.state}
                      channels={channels}
                      activityEvents={activityEvents}
                      lastEvent={activityEvents[0] ?? null}
                    />
                    <div className="border-t border-border/50 mx-14 max-w-[832px]" />
                    <BuildSummaryRows
                      healthData={healthData ?? null}
                      runtimeId={runtimeId}
                      runtimes={runtimes ?? []}
                      memoriesTotal={memoriesTotal ?? 0}
                      memoryEnabled={memoryEnabled ?? true}
                      tasks={mapScheduledTasksToSummaryItems(tasks ?? [])}
                      channels={mapAssistantChannelsToSummaryItems(channels)}
                      skills={mapUnifiedSkillsToSummaryItems(skills)}
                      costTodayUsd={costTodayUsd}
                      engine={engine}
                      onTabChange={(id) => goToSection(id)}
                      onAddChannel={() => goToSection('channels')}
                      onAddSkill={() => goToSection('skills')}
                    />
                    {introspectionState.isActive && (
                      <div className="min-h-[300px]">
                        <HeroStream
                          orgId={chatProps.orgId ?? ''}
                          agentId={chatProps.assistantId}
                          enabled={introspectionEnabled}
                          isActive={introspectionState.isActive}
                          emotion={introspectionState.emotion}
                          annotations={annotations}
                          channels={introspectionData?.channels}
                          tasks={introspectionData?.tasks}
                          lastMemory={introspectionData?.lastMemory}
                          toolStats={toolStats}
                        />
                      </div>
                    )}
                    <RunTimelineBar runs={runs} onRunClick={setSelectedRunId} />
                  </ScrollArea>
                )}

              </div>

              {/* Right: inline Chat/Activity panel — does NOT cover system */}
              <AnimatePresence>
                {rightPanel !== null && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: '35%', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                    className="h-full flex flex-col overflow-hidden bg-popover/85 backdrop-blur-md border-l border-border shadow-xl"
                    style={{
                      minWidth: rightPanel !== null ? 360 : 0,
                    }}
                  >
                    {/* Tab header */}
                    <div
                      className="flex items-center shrink-0 border-b border-border"
                    >
                      <button
                        type="button"
                        onClick={() => setRightPanel('chat')}
                        className={cn(
                          'flex items-center gap-1.5 px-4 py-3.5 text-[13px] font-medium border-b-2 transition-all duration-150',
                          rightPanel === 'chat'
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightPanel('activity')}
                        className={cn(
                          'flex items-center gap-1.5 px-4 py-3.5 text-[13px] font-medium border-b-2 transition-all duration-150',
                          rightPanel === 'activity'
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        <Activity className="h-3.5 w-3.5" />
                        Activity
                      </button>
                      {/* Close button — right-aligned */}
                      <button
                        type="button"
                        onClick={() => setRightPanel(null)}
                        className="ml-auto mr-2 p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors duration-120"
                      >
                        <PanelRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Panel content */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {rightPanel === 'chat' && chatContent}
                      {rightPanel === 'activity' && (
                        <ScrollArea className="h-full">
                          {runLevelMetrics.length > 0 && <MetricsBar metrics={runLevelMetrics} />}
                          <LiveFeedPane
                            events={activityEvents}
                            showHeader={true}
                            loading={feedLoading}
                            channelCount={channelStats.connected}
                          />
                        </ScrollArea>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : isDesktop ? (
          <ResizablePanelLayout
            autoSaveId="assistant-command-center"
            panels={[
              {
                id: 'config',
                defaultSize: 30,
                minSize: 20,
                maxSize: 50,
                collapsible: true,
                collapsedSize: 0,
                content: configContent,
              },
              {
                id: 'chat',
                defaultSize: 45,
                minSize: 30,
                content: chatContent,
              },
              {
                id: 'activity',
                defaultSize: 25,
                minSize: 15,
                maxSize: 40,
                collapsible: true,
                collapsedSize: 0,
                content: activityContent,
              },
            ]}
          />
        ) : isTablet ? (
          <ResizablePanelLayout
            autoSaveId="assistant-command-center-tablet"
            panels={[
              {
                id: 'config',
                defaultSize: 35,
                minSize: 25,
                maxSize: 55,
                collapsible: true,
                collapsedSize: 0,
                content: configContent,
              },
              {
                id: 'chat',
                defaultSize: 65,
                minSize: 40,
                content: chatContent,
              },
            ]}
          />
        ) : (
          <MobilePanelSwitcher
            defaultTab={introspectionEnabled ? 'stream' : 'chat'}
            activeTab={mobileActiveTab}
            onTabChange={setMobileActiveTab}
            tabs={[
              ...(introspectionEnabled ? [{
                id: 'stream',
                label: 'Stream',
                icon: <Zap />,
                content: (
                  <div className="h-full overflow-y-auto">
                    {runs.length > 0 ? (
                      <div className="py-2">
                        {runs.map((run) => (
                          <div key={run.runId}>
                            <RunSummaryCard
                              run={run}
                              onTap={(id) => setMobileExpandedRunId(prev => prev === id ? null : id)}
                            />
                            {mobileExpandedRunId === run.runId && (
                              <div className="pl-6 pr-2 pb-2 border-l border-border ml-4">
                                {introspectionState.nodes
                                  .filter((n) => n.runId === run.runId)
                                  .map((node) => (
                                    <StreamNodeComponent key={node.id} node={node} />
                                  ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <IntrospectionStream
                        orgId={chatProps.orgId ?? ''}
                        agentId={chatProps.assistantId}
                        enabled={introspectionEnabled}
                        channels={introspectionData?.channels}
                        tasks={introspectionData?.tasks}
                        lastMemory={introspectionData?.lastMemory}
                      />
                    )}
                  </div>
                ),
              }] : []),
              {
                id: 'config',
                label: 'Config',
                icon: <Settings2 />,
                badge: configSections.length,
                content: configContent,
              },
              {
                id: 'chat',
                label: 'Chat',
                icon: <MessageSquare />,
                content: chatContent,
              },
              {
                id: 'activity',
                label: 'Activity',
                icon: <Activity />,
                badge: activityEvents.length > 0 ? activityEvents.length : undefined,
                content: activityContent,
              },
            ]}
          />
        )}
      </div>

      <div className="hidden md:block">
        <CommandBar
          shortcuts={shortcuts}
          onCommandPalette={() => openPalette(true)}
        />
      </div>

      {dialogs}

      {/* Config section modal — configure items open here instead of inline */}
      <ConfigSectionDialog
        open={drawerConfigSection !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (drawerSectionId) {
              onConfigSectionModalClose?.(drawerSectionId)
            }
            setDrawerSectionId(null)
            sidebarActions?.setActiveSectionId('__overview')
          }
        }}
        title={drawerConfigSection?.title ?? ''}
        icon={drawerConfigSection?.icon}
        sectionId={drawerConfigSection?.id}
      >
        {drawerConfigSection?.content}
      </ConfigSectionDialog>

      <Dialog
        open={selectedRunId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRunId(null)
            setSelectedTraceNodeId(null)
          }
        }}
      >
        <DialogContent className="max-w-[1100px] w-[92vw] max-h-[88vh] p-0 bg-background border-border gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border/60 shrink-0">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {selectedRun ? `Run ${selectedRun.runId.slice(0, 8)}` : 'Run inspector'}
              </span>
              {selectedRun ? (
                <span className="text-xs text-muted-foreground">
                  {selectedRun.nodeCount} events · {selectedRun.toolCount} tools · {selectedRun.durationMs < 1000 ? `${selectedRun.durationMs}ms` : `${(selectedRun.durationMs / 1000).toFixed(1)}s`}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ScrollArea className="max-h-[calc(88vh-64px)] border-r border-border/60">
              <div className="space-y-2 p-4">
                {selectedRunNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className={cn(
                      'block w-full rounded-lg border border-transparent p-1 text-left transition-colors hover:border-border/60 hover:bg-muted/30',
                      selectedTraceNode?.id === node.id && 'border-border bg-muted/40',
                    )}
                    onClick={() => setSelectedTraceNodeId(node.id)}
                  >
                    <StreamNodeComponent node={node} onExpand={(expandedNode) => setSelectedTraceNodeId(expandedNode.id)} />
                  </button>
                ))}
              </div>
            </ScrollArea>
            <ScrollArea className="max-h-[calc(88vh-64px)]">
              <div className="p-4">
                {selectedTraceNode ? (
                  <TraceInspector node={selectedTraceNode} />
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                    Select an event to inspect its exact input, output, tokens, and runtime details.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
