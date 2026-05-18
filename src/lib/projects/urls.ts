import { buildWorkspaceUrl } from '@/lib/workspace/utils'
import { getProjectRouteState } from '@/lib/projects/route-state'

type WorkspaceLike = { slug: string }

export function buildProjectOverviewPath(workspaceSlug: string, projectSlug: string) {
  return `/${workspaceSlug}/projects/${projectSlug}`
}

export function buildProjectAgentsPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/agents`
}

export function buildProjectAgentBuilderPath(workspaceSlug: string, projectSlug: string) {
  const params = new URLSearchParams({
    view: 'canvas',
    builder: '1',
  })
  return `${buildProjectAgentsPath(workspaceSlug, projectSlug)}?${params.toString()}`
}

export function buildProjectAgentDetailPath(workspaceSlug: string, projectSlug: string, agentId: string) {
  return `${buildProjectAgentsPath(workspaceSlug, projectSlug)}/${agentId}`
}

export function buildProjectTeamsPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/teams`
}

export function buildProjectInboxPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/inbox`
}

export function buildProjectReplayPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/runs?view=replay`
}

export function buildWorkspaceMissionControlAgentsPath(workspaceSlug: string) {
  return `/${workspaceSlug}/mission-control/agents`
}

export function buildWorkspaceMissionControlOverviewPath(workspaceSlug: string) {
  return `/${workspaceSlug}/mission-control/overview`
}

export function buildWorkspaceMissionControlActivityPath(workspaceSlug: string) {
  return `/${workspaceSlug}/mission-control/activity`
}

export function buildWorkspaceMissionControlReplayPath(workspaceSlug: string) {
  return `/${workspaceSlug}/mission-control/replay`
}

export function buildWorkspaceMissionControlApprovalsPath(workspaceSlug: string) {
  return `/${workspaceSlug}/mission-control/approvals`
}

export function buildProjectWorkPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/work`
}

export function buildProjectWorkDetailPath(workspaceSlug: string, projectSlug: string, workItemId: string) {
  return `${buildProjectWorkPath(workspaceSlug, projectSlug)}/${workItemId}`
}

export function buildProjectTeamDetailPath(workspaceSlug: string, projectSlug: string, teamId: string) {
  return `${buildProjectTeamsPath(workspaceSlug, projectSlug)}/${teamId}`
}

export function buildProjectRunsPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/runs`
}

export function buildProjectSettingsPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/settings`
}

export function buildProjectCanvasPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/canvas`
}

export function buildProjectTemplatesPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/templates`
}

export function buildProjectAppsPath(workspaceSlug: string, projectSlug: string) {
  return `${buildProjectOverviewPath(workspaceSlug, projectSlug)}/apps`
}

export function buildProjectAppDetailPath(workspaceSlug: string, projectSlug: string, appId: string) {
  return `${buildProjectAppsPath(workspaceSlug, projectSlug)}/${appId}`
}

export function buildProjectSwitcherTarget(
  workspaceSlug: string,
  nextProjectSlug: string,
  pathname: string | null | undefined,
) {
  const routeState = getProjectRouteState(pathname, workspaceSlug)
  if (!routeState.inProject) {
    return buildProjectOverviewPath(workspaceSlug, nextProjectSlug)
  }

  return routeState.suffixSegments.length > 0
    ? `${buildProjectOverviewPath(workspaceSlug, nextProjectSlug)}/${routeState.suffixSegments.join('/')}`
    : buildProjectOverviewPath(workspaceSlug, nextProjectSlug)
}

export function buildWorkspaceProjectOverviewUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectsIndexUrl(
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl('/projects', currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceRunsUrl(
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl('/runs', currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectAgentsUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/agents`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectTeamsUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/teams`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectInboxUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/inbox`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectWorkUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/work`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectRunsUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/runs`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectTemplatesUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/templates`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectAppsUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/apps`, currentWorkspaceSlug, userWorkspaces)
}

export function buildWorkspaceProjectSettingsUrl(
  projectSlug: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: WorkspaceLike[] = [],
) {
  return buildWorkspaceUrl(`/projects/${projectSlug}/settings`, currentWorkspaceSlug, userWorkspaces)
}
