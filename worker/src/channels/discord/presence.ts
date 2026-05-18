export interface DiscordPresenceActivity {
  name: string
  type: 0 | 1 | 2 | 3 | 4 | 5
  state?: string
  url?: string
}

export interface DiscordPresenceSnapshot {
  status: 'online' | 'idle' | 'dnd' | 'invisible'
  activity: DiscordPresenceActivity | null
  updatedAt: string
}

export interface DiscordPresenceInput {
  status?: string | null
  activity?: string | null
  activityType?: number | null
  activityUrl?: string | null
}

const DEFAULT_CUSTOM_ACTIVITY_TYPE = 4 as const
const CUSTOM_STATUS_NAME = 'Custom Status'

export function resolveDiscordPresence(input: DiscordPresenceInput): DiscordPresenceSnapshot {
  const activityText = typeof input.activity === 'string' ? input.activity.trim() : ''
  const rawStatus = typeof input.status === 'string' ? input.status.trim() : ''
  const rawActivityType = input.activityType
  const activityUrl = typeof input.activityUrl === 'string' ? input.activityUrl.trim() : ''

  const status: DiscordPresenceSnapshot['status'] =
    rawStatus === 'idle' || rawStatus === 'dnd' || rawStatus === 'invisible'
      ? rawStatus
      : 'online'

  let activity: DiscordPresenceActivity | null = null
  if (activityText) {
    const activityType =
      rawActivityType === 0 ||
      rawActivityType === 1 ||
      rawActivityType === 2 ||
      rawActivityType === 3 ||
      rawActivityType === 4 ||
      rawActivityType === 5
        ? rawActivityType
        : DEFAULT_CUSTOM_ACTIVITY_TYPE

    activity =
      activityType === DEFAULT_CUSTOM_ACTIVITY_TYPE
        ? { name: CUSTOM_STATUS_NAME, type: activityType, state: activityText }
        : { name: activityText, type: activityType }

    if (activityType === 1 && activityUrl) {
      activity.url = activityUrl
    }
  }

  return {
    status,
    activity,
    updatedAt: new Date().toISOString(),
  }
}
