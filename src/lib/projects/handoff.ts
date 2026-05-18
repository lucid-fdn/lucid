export const PROJECT_CREATION_FOCUS = 'created'

export interface ProjectCanvasHandoffTarget {
  workspaceSlug: string
  projectSlug: string
  agentId?: string | null
  crewId?: string | null
}

export function buildProjectAgentsHandoffPath({
  workspaceSlug,
  projectSlug,
  agentId,
  crewId,
}: ProjectCanvasHandoffTarget) {
  const path = `/${workspaceSlug}/projects/${projectSlug}/agents`
  const params = new URLSearchParams({ view: 'canvas' })

  if (agentId) {
    params.set('agent', agentId)
    params.set('focus', PROJECT_CREATION_FOCUS)
  } else if (crewId) {
    params.set('team', crewId)
    params.set('focus', PROJECT_CREATION_FOCUS)
  }

  return `${path}?${params.toString()}`
}

export interface ProjectCanvasHandoffState {
  projectSlug: string
  agentId?: string | null
  crewId?: string | null
  createdAt: number
}

const HANDOFF_STORAGE_KEY_PREFIX = 'lucid:project-canvas-handoff'

function getHandoffStorageKey(projectSlug: string, entityId: string) {
  return `${HANDOFF_STORAGE_KEY_PREFIX}:${projectSlug}:${entityId}`
}

export function saveProjectCanvasHandoff(state: ProjectCanvasHandoffState) {
  if (typeof window === 'undefined') return
  const entityId = state.agentId ?? state.crewId
  if (!entityId) return

  try {
    window.sessionStorage.setItem(
      getHandoffStorageKey(state.projectSlug, entityId),
      JSON.stringify(state),
    )
  } catch {
    // Handoff animation is progressive enhancement; never block creation.
  }
}

export function consumeProjectCanvasHandoff(projectSlug: string, entityId: string): ProjectCanvasHandoffState | null {
  if (typeof window === 'undefined') return null

  const key = getHandoffStorageKey(projectSlug, entityId)

  try {
    const raw = window.sessionStorage.getItem(key)
    window.sessionStorage.removeItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProjectCanvasHandoffState>
    if (
      parsed.projectSlug !== projectSlug
      || (parsed.agentId !== entityId && parsed.crewId !== entityId)
      || typeof parsed.createdAt !== 'number'
    ) {
      return null
    }
    return parsed as ProjectCanvasHandoffState
  } catch {
    return null
  }
}
