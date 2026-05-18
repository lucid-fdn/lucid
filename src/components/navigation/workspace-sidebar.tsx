"use client"

import * as React from "react"
import {
  Bot,
  Inbox,
  FolderKanban,
  Settings,
  FileText,
  Activity,
  LayoutTemplate,
  Network,
  Users,
  BriefcaseBusiness,
  LayoutDashboard,
  Brain,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarTrigger,
  useSidebar,
} from "@/ui/components/sidebar"
import { Separator } from "@/components/ui/separator"
import { WorkspaceDropdown } from "./workspace-dropdown"
import { ProjectDropdown } from "./project-dropdown"
// SearchButton removed from sidebar — available internally only
import { NavItem } from "./nav-item"
import { NavSection } from "./nav-section"
import {
  MissionControlContextSidebar,
} from "./mission-control-sidebar-section"
import { FavoriteList } from "@/components/favorites/favorite-list"
import { useWorkspace } from "@/contexts/workspace-context"
import { useResolvedFeatureFlags } from "@/contexts/feature-flags-context"
import { useFavorites } from "@/components/favorites/use-favorites"
import { useProfile } from "@/contexts/profile-context"
import { useAuth } from "@/contexts/auth-context"
import { buildWorkspaceUrl } from "@/lib/workspace/utils"
import { useRecentAgents } from "@/hooks/use-recent-agents"
import { useCrews } from "@/hooks/use-crews"
import { useProjectAttention } from "@/hooks/use-project-attention"
import { useProjectWorkSummary } from "@/hooks/use-project-work-summary"
import { usePathname } from "next/navigation"
import { getProjectRouteState } from "@/lib/projects/route-state"
import {
  buildProjectAgentDetailPath,
  buildProjectWorkDetailPath,
  buildWorkspaceProjectAgentsUrl,
  buildWorkspaceProjectInboxUrl,
  buildWorkspaceProjectOverviewUrl,
  buildWorkspaceProjectRunsUrl,
  buildWorkspaceProjectSettingsUrl,
  buildWorkspaceProjectTeamsUrl,
  buildWorkspaceProjectTemplatesUrl,
  buildWorkspaceProjectWorkUrl,
} from "@/lib/projects/urls"

/**
 * WorkspaceSidebar - Main navigation sidebar
 * 
 * Notion-style sidebar with:
 * - Workspace dropdown (team integrated)
 * - Search (⌘K)
 * - Quick actions (Home, Inbox)
 * - Marketplace link
 * - Teamspaces section (Data, Functions, Analytics)
 * - Bottom actions (Marketplace backup, Trash)
 * - Settings modal
 * 
 * Features:
 * - Collapsible (⌘B)
 * - Feature flag controlled
 * - Responsive (mobile sheet)
 * - Type-safe
 * 
 * @example
 * <SidebarProvider>
 *   <WorkspaceSidebar />
 *   <SidebarInset>
 *     {children}
 *   </SidebarInset>
 * </SidebarProvider>
 */
export function WorkspaceSidebar({ 
  className,
  onSettingsClick,
  userWorkspaces = [],
  currentWorkspaceSlug
}: { 
  className?: string
  onSettingsClick?: (tab?: string) => void
  userWorkspaces?: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    member_count?: number
    plan_name?: string
  }>
  currentWorkspaceSlug?: string | null
}) {
  const { workspace, loading } = useWorkspace()
  const { state } = useSidebar()
  const pathname = usePathname()
  const _profile = useProfile()
  const _auth = useAuth()
  const {
    sidebarFavorites,
    sidebarShared,
    sidebarPrivate,
  } = useResolvedFeatureFlags()

  // Favorites
  const orgId = workspace?.org?.id
  const projectId = workspace?.project?.id
  const { favorites } = useFavorites({ orgId })
  const hasFavorites = favorites.length > 0

  // TODO: Fetch inbox unread count
  const _inboxCount = 0

  const _orgName = workspace?.org?.name || 'My Workspace'
  const routeWorkspace = React.useMemo(
    () => userWorkspaces.find((item) => item.slug === currentWorkspaceSlug) ?? null,
    [currentWorkspaceSlug, userWorkspaces],
  )
  const routeState = React.useMemo(
    () => getProjectRouteState(pathname, currentWorkspaceSlug),
    [pathname, currentWorkspaceSlug],
  )
  const currentProjectSlug = routeState.projectSlug
  const isMissionControlRoute = Boolean(
    currentWorkspaceSlug && pathname?.startsWith(`/${currentWorkspaceSlug}/mission-control`),
  )
  const [forcePrimarySidebar, setForcePrimarySidebar] = React.useState(false)
  React.useEffect(() => {
    setForcePrimarySidebar(false)
  }, [pathname])
  const showMissionControlSidebar = isMissionControlRoute && !forcePrimarySidebar
  const activeProjectSlug = currentProjectSlug ?? workspace?.project?.slug ?? null
  const activeProject = React.useMemo(() => {
    if (!activeProjectSlug) return workspace?.project ?? null
    return workspace?.projects?.find((project) => project.slug === activeProjectSlug)
      ?? (workspace?.project?.slug === activeProjectSlug ? workspace.project : null)
      ?? null
  }, [activeProjectSlug, workspace?.project, workspace?.projects])
  const activeProjectId = activeProject?.id ?? projectId ?? null
  const activeProjectAssistantCount = activeProject?.agent_count ?? activeProject?.counts?.assistants
  const hasProjectAgents = typeof activeProjectAssistantCount === 'number'
    ? activeProjectAssistantCount > 0
    : true
  const showAgentDependentProjectNav = !currentProjectSlug || hasProjectAgents
  const workspaceAgentCount = React.useMemo(() => {
    if (!workspace?.projects) return null
    return workspace.projects.reduce((total, project) => {
      return total + (project.agent_count ?? project.counts?.assistants ?? 0)
    }, 0)
  }, [workspace?.projects])
  const hasWorkspaceAgents = workspaceAgentCount === null ? true : workspaceAgentCount > 0
  const hasRealProject = Boolean(workspace?.project?.id)
  const isPreActivation = !loading && !hasRealProject
  const onTeamsRoute = routeState.subpage === 'teams'
  const { crews } = useCrews(
    orgId ?? '',
    activeProjectId,
    Boolean(currentProjectSlug && orgId && activeProjectId),
  )
  const { attentionCount } = useProjectAttention(
    currentProjectSlug ? orgId : null,
    currentProjectSlug ? activeProjectId : null,
  )
  const { summary: workSummary, items: recentWorkItems } = useProjectWorkSummary(
    currentProjectSlug ? orgId : null,
    currentProjectSlug ? activeProjectId : null,
    5,
  )
  const shouldShowTeamsNav = onTeamsRoute || crews.length > 0
  const projectsHref = buildWorkspaceUrl('/projects', currentWorkspaceSlug, userWorkspaces)
  const workspaceAgentsHref = buildWorkspaceUrl('/assistants', currentWorkspaceSlug, userWorkspaces)
  const dashboardHref = buildWorkspaceUrl('/dashboard', currentWorkspaceSlug, userWorkspaces)
  const knowledgeHref = buildWorkspaceUrl('/knowledge', currentWorkspaceSlug, userWorkspaces)
  const workspaceSettingsHref = buildWorkspaceUrl('/settings', currentWorkspaceSlug, userWorkspaces)
  const missionControlOverviewHref = buildWorkspaceUrl('/mission-control/overview', currentWorkspaceSlug, userWorkspaces)
  const missionControlActivityHref = buildWorkspaceUrl('/mission-control/activity', currentWorkspaceSlug, userWorkspaces)
  const missionControlReplayHref = buildWorkspaceUrl('/mission-control/replay', currentWorkspaceSlug, userWorkspaces)
  const missionControlBrowserHref = buildWorkspaceUrl('/mission-control/browser', currentWorkspaceSlug, userWorkspaces)
  const missionControlAgentOpsHref = buildWorkspaceUrl('/mission-control/agent-ops', currentWorkspaceSlug, userWorkspaces)
  const missionControlRoutinesHref = buildWorkspaceUrl('/mission-control/routines', currentWorkspaceSlug, userWorkspaces)
  const missionControlTemplatesHref = buildWorkspaceUrl('/mission-control/templates', currentWorkspaceSlug, userWorkspaces)
  const missionControlKnowledgeHref = buildWorkspaceUrl('/mission-control/knowledge', currentWorkspaceSlug, userWorkspaces)
  const missionControlConversationsHref = buildWorkspaceUrl('/mission-control/conversations', currentWorkspaceSlug, userWorkspaces)
  const missionControlIntegrationsHref = buildWorkspaceUrl('/mission-control/integrations', currentWorkspaceSlug, userWorkspaces)
  const missionControlProofReceiptsHref = buildWorkspaceUrl('/mission-control/proof-explorer', currentWorkspaceSlug, userWorkspaces)
  const missionControlSystemHref = buildWorkspaceUrl('/mission-control/system', currentWorkspaceSlug, userWorkspaces)
  const missionControlSpendHref = buildWorkspaceUrl('/mission-control/economics', currentWorkspaceSlug, userWorkspaces)
  const missionControlCommerceHref = buildWorkspaceUrl('/mission-control/commerce', currentWorkspaceSlug, userWorkspaces)
  const missionControlWorkHref = buildWorkspaceUrl('/mission-control/work', currentWorkspaceSlug, userWorkspaces)
  const missionControlInboxHref = buildWorkspaceUrl('/mission-control/inbox', currentWorkspaceSlug, userWorkspaces)
  const missionControlDoctorHref = buildWorkspaceUrl('/mission-control/doctor', currentWorkspaceSlug, userWorkspaces)
  const missionControlProposedChangesHref = buildWorkspaceUrl('/mission-control/mutations', currentWorkspaceSlug, userWorkspaces)
  const missionControlExperimentsHref = buildWorkspaceUrl('/mission-control/experiments', currentWorkspaceSlug, userWorkspaces)
  const missionControlDagTemplatesHref = buildWorkspaceUrl('/mission-control/dags/templates', currentWorkspaceSlug, userWorkspaces)
  const missionControlLinks = React.useMemo(() => ({
    overview: missionControlOverviewHref,
    activity: missionControlActivityHref,
    replay: missionControlReplayHref,
    browser: missionControlBrowserHref,
    agentOps: missionControlAgentOpsHref,
    routines: missionControlRoutinesHref,
    templates: missionControlTemplatesHref,
    knowledge: missionControlKnowledgeHref,
    conversations: missionControlConversationsHref,
    integrations: missionControlIntegrationsHref,
    proofReceipts: missionControlProofReceiptsHref,
    system: missionControlSystemHref,
    spend: missionControlSpendHref,
    commerce: missionControlCommerceHref,
    work: missionControlWorkHref,
    inbox: missionControlInboxHref,
    doctor: missionControlDoctorHref,
    proposedChanges: missionControlProposedChangesHref,
    experiments: missionControlExperimentsHref,
    dagTemplates: missionControlDagTemplatesHref,
  }), [
    missionControlOverviewHref,
    missionControlActivityHref,
    missionControlReplayHref,
    missionControlBrowserHref,
    missionControlAgentOpsHref,
    missionControlRoutinesHref,
    missionControlTemplatesHref,
    missionControlKnowledgeHref,
    missionControlConversationsHref,
    missionControlIntegrationsHref,
    missionControlProofReceiptsHref,
    missionControlSystemHref,
    missionControlSpendHref,
    missionControlCommerceHref,
    missionControlWorkHref,
    missionControlInboxHref,
    missionControlDoctorHref,
    missionControlProposedChangesHref,
    missionControlExperimentsHref,
    missionControlDagTemplatesHref,
  ])
  const projectOverviewHref = activeProjectSlug
    ? buildWorkspaceProjectOverviewUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectAgentsHref = activeProjectSlug
    ? buildWorkspaceProjectAgentsUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectInboxHref = activeProjectSlug
    ? buildWorkspaceProjectInboxUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectWorkHref = activeProjectSlug
    ? buildWorkspaceProjectWorkUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectTeamsHref = activeProjectSlug
    ? buildWorkspaceProjectTeamsUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectRunsHref = activeProjectSlug
    ? buildWorkspaceProjectRunsUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectTemplatesHref = activeProjectSlug
    ? buildWorkspaceProjectTemplatesUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null
  const projectSettingsHref = activeProjectSlug
    ? buildWorkspaceProjectSettingsUrl(activeProjectSlug, currentWorkspaceSlug, userWorkspaces)
    : null

  // Don't render if no workspace (after loading)
  if (!loading && !workspace) {
    return null
  }

  return (
    <Sidebar collapsible="icon" className={className}>
      {!showMissionControlSidebar ? (
        <SidebarHeader className="animate-in fade-in duration-200">
          {state === "collapsed" ? (
            <div className="flex justify-center">
              <SidebarTrigger />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {currentProjectSlug ? (
                <ProjectDropdown
                  workspaceSlug={currentWorkspaceSlug}
                  workspaceId={routeWorkspace?.id ?? workspace?.org?.id ?? null}
                  className="flex-1"
                />
              ) : (
                <WorkspaceDropdown
                  onSettingsClick={onSettingsClick}
                  userWorkspaces={userWorkspaces}
                  currentWorkspaceSlug={currentWorkspaceSlug || undefined}
                />
              )}
              <SidebarTrigger />
            </div>
          )}
        </SidebarHeader>
      ) : null}

        {/* Main content */}
        <SidebarContent className="animate-in fade-in duration-200">
          {showMissionControlSidebar ? (
            <MissionControlContextSidebar
              onBack={() => setForcePrimarySidebar(true)}
              links={missionControlLinks}
            />
          ) : isPreActivation ? (
            <SidebarGroup>
              <SidebarMenu>
                {dashboardHref && (
                  <NavItem
                    href={dashboardHref}
                    icon={LayoutDashboard}
                    label="Dashboard"
                  />
                )}
              </SidebarMenu>
            </SidebarGroup>
          ) : !currentProjectSlug ? (
            <>
              <SidebarGroup>
                <SidebarMenu>
                  {dashboardHref && (
                    <NavItem
                      href={dashboardHref}
                      icon={LayoutDashboard}
                      label="Dashboard"
                    />
                  )}
                  {projectsHref && (
                    <NavItem
                      href={projectsHref}
                      icon={FolderKanban}
                      label="Projects"
                    />
                  )}
                  {workspaceAgentsHref && (
                    <NavItem
                      href={workspaceAgentsHref}
                      icon={Network}
                      label="All Agents"
                    />
                  )}
                  {knowledgeHref && (
                    <NavItem
                      href={knowledgeHref}
                      icon={Brain}
                      label="Brain"
                    />
                  )}
                  {missionControlOverviewHref ? (
                    isMissionControlRoute ? (
                      <NavItem
                        icon={Activity}
                        label="Mission Control"
                        hasSubmenu
                        isActive
                        onClick={() => setForcePrimarySidebar(false)}
                      />
                    ) : (
                      <NavItem
                        href={missionControlOverviewHref}
                        icon={Activity}
                        label="Mission Control"
                        hasSubmenu
                      />
                    )
                  ) : null}
                  {workspaceSettingsHref && (
                    <NavItem
                      href={workspaceSettingsHref}
                      icon={Settings}
                      label="Workspace Settings"
                    />
                  )}
                </SidebarMenu>
              </SidebarGroup>
            </>
          ) : null}

          {/* Favorites - Only show when user has favorites */}
          {!showMissionControlSidebar && !isPreActivation && sidebarFavorites && hasFavorites && (
            <>
              <NavSection title="Favorites">
                <FavoriteList orgId={orgId} />
              </NavSection>
              <Separator className="my-2" />
            </>
          )}

          {/* Current project */}
          {!showMissionControlSidebar && !isPreActivation && loading ? (
            <SidebarGroup>
              <SidebarMenu>
                <div className="px-2 py-1 text-sm text-muted-foreground">
                  <span className="group-data-[state=collapsed]:hidden animate-pulse">Loading project context...</span>
                  <div className="hidden group-data-[state=collapsed]:flex justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                </div>
              </SidebarMenu>
            </SidebarGroup>
          ) : !isPreActivation && currentProjectSlug ? (
            <SidebarGroup>
              <SidebarMenu>
              {projectOverviewHref && (
                <NavItem 
                  href={projectOverviewHref}
                  icon={LayoutDashboard}
                  label="Overview" 
                />
              )}
              {projectAgentsHref && (
                <NavItem
                  href={projectAgentsHref}
                  icon={Network}
                  label="Agents"
                />
              )}
              {projectInboxHref && showAgentDependentProjectNav && (
                <NavItem
                  href={projectInboxHref}
                  icon={Inbox}
                  label="Inbox"
                  badge={attentionCount}
                />
              )}
              {projectWorkHref && showAgentDependentProjectNav && (
                <NavItem
                  href={projectWorkHref}
                  icon={BriefcaseBusiness}
                  label="Work"
                  badge={workSummary.open + workSummary.waiting + workSummary.overdue}
                />
              )}
              {projectTeamsHref && showAgentDependentProjectNav && shouldShowTeamsNav && (
                <NavItem
                  href={projectTeamsHref}
                  icon={Users}
                  label="Teams"
                />
              )}
              {projectRunsHref && showAgentDependentProjectNav && (
                <NavItem
                  href={projectRunsHref}
                  icon={Activity}
                  label="Runs"
                />
              )}
              {projectTemplatesHref && (
                <NavItem
                  href={projectTemplatesHref}
                  icon={LayoutTemplate}
                  label="Templates"
                />
              )}
                  {projectSettingsHref && (
                    <NavItem
                      href={projectSettingsHref}
                      icon={Settings}
                      label="Project Settings"
                    />
                  )}
                  {missionControlOverviewHref ? (
                    isMissionControlRoute ? (
                      <NavItem
                        icon={Activity}
                        label="Mission Control"
                        hasSubmenu
                        isActive
                        onClick={() => setForcePrimarySidebar(false)}
                      />
                    ) : (
                      <NavItem
                        href={missionControlOverviewHref}
                        icon={Activity}
                        label="Mission Control"
                        hasSubmenu
                      />
                    )
                  ) : null}
              </SidebarMenu>
            </SidebarGroup>
          ) : null}

          {!showMissionControlSidebar && !isPreActivation && currentProjectSlug && showAgentDependentProjectNav && currentWorkspaceSlug && recentWorkItems.length > 0 ? (
            <>
              <Separator className="my-2" />
              <NavSection title="Recent Work" defaultOpen={true}>
                {recentWorkItems.map((item) => (
                  <NavItem
                    key={item.id}
                    href={buildProjectWorkDetailPath(
                      currentWorkspaceSlug,
                      currentProjectSlug,
                      item.id,
                    )}
                    icon={BriefcaseBusiness}
                    label={item.title}
                  />
                ))}
              </NavSection>
            </>
          ) : null}

          {/* Recent agents */}
          {!showMissionControlSidebar && !isPreActivation ? <RecentAgentsSection workspaceSlug={currentWorkspaceSlug} /> : null}

          {/* Shared (if enabled) */}
          {!showMissionControlSidebar && !isPreActivation && sidebarShared && (
            <>
              <Separator className="my-2" />
              <NavSection title="Shared">
                <div className="px-2 py-1 text-sm text-muted-foreground">
                  No shared items
                </div>
              </NavSection>
            </>
          )}

          {/* Private (if enabled) */}
          {!showMissionControlSidebar && !isPreActivation && sidebarPrivate && (
            <>
              <Separator className="my-2" />
              <NavSection title="Private">
                <div className="px-2 py-1 text-sm text-muted-foreground">
                  No private items
                </div>
              </NavSection>
            </>
          )}
        </SidebarContent>

        {/* Footer: Bottom actions */}
        {!showMissionControlSidebar ? (
          <SidebarFooter>
            <SidebarMenu>
              <NavItem href="https://wiki.lucid.foundation" icon={FileText} label="Documentation" external />
            </SidebarMenu>
          </SidebarFooter>
        ) : null}
    </Sidebar>
  )
}

/**
 * Recent agents section — collapsible list of recently visited agents.
 * Only renders when the user has visited at least one agent.
 */
function RecentAgentsSection({ workspaceSlug }: { workspaceSlug?: string | null }) {
  const { recentAgents } = useRecentAgents()

  if (!workspaceSlug || recentAgents.length === 0) return null

  return (
    <>
      <Separator className="my-2" />
      <NavSection title="Recent" defaultOpen={true}>
        {recentAgents.map(agent => {
          const agentUrl = buildProjectAgentDetailPath(workspaceSlug, agent.projectSlug, agent.id)
          return (
            <NavItem
              key={agent.id}
              href={agentUrl}
              icon={Bot}
              label={agent.name}
              hasSubmenu
              onClick={() => window.dispatchEvent(new CustomEvent('lucid:show-detail-sidebar'))}
            />
          )
        })}
      </NavSection>
    </>
  )
}
