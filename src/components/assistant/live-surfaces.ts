'use client'

export interface AssistantLiveSurfaces {
  activity: boolean
  metrics: boolean
  runtimes: boolean
  health: boolean
}

export const DEFAULT_ASSISTANT_LIVE_SURFACES: AssistantLiveSurfaces = {
  activity: false,
  metrics: false,
  runtimes: false,
  health: false,
}
