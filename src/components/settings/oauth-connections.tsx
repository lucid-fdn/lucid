/**
 * OAuth Connections Component (Wrapper)
 * 
 * This is now a simple wrapper around the unified OAuthManagement component.
 * Maintained for backwards compatibility.
 * 
 * @deprecated Use OAuthManagement component directly
 */

'use client'

import { OAuthManagement } from '@/components/oauth/oauth-management'

/**
 * OAuth Connections Component
 * 
 * Uses the unified OAuthManagement component in 'compact' mode.
 */
export function OAuthConnections() {
  return <OAuthManagement mode="compact" />
}
