export interface ProjectRouteState {
  inWorkspace: boolean
  inProject: boolean
  projectSlug: string | null
  subpage: string | null
  suffixSegments: string[]
  workspaceSegments: string[]
}

export function getProjectRouteState(
  pathname: string | null | undefined,
  workspaceSlug: string | null | undefined,
): ProjectRouteState {
  if (!pathname || !workspaceSlug) {
    return {
      inWorkspace: false,
      inProject: false,
      projectSlug: null,
      subpage: null,
      suffixSegments: [],
      workspaceSegments: [],
    }
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== workspaceSlug) {
    return {
      inWorkspace: false,
      inProject: false,
      projectSlug: null,
      subpage: null,
      suffixSegments: [],
      workspaceSegments: [],
    }
  }

  const workspaceSegments = segments.slice(1)
  const inProject = workspaceSegments[0] === 'projects' && Boolean(workspaceSegments[1])
  const projectSlug = inProject ? (workspaceSegments[1] ?? null) : null
  const suffixSegments = inProject ? workspaceSegments.slice(2) : []

  return {
    inWorkspace: true,
    inProject,
    projectSlug,
    subpage: suffixSegments[0] ?? null,
    suffixSegments,
    workspaceSegments,
  }
}
