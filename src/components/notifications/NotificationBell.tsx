'use client'

import { NavNotifications } from '@/components/navigation/nav-notifications'

/**
 * Backward-compatible marketplace notification entrypoint.
 * The actual data fetching, realtime subscription, read mutations, and empty
 * state live in NavNotifications so every bell stays behaviorally identical.
 */
export function NotificationBell() {
  return <NavNotifications />
}
