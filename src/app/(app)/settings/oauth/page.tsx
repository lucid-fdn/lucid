/**
 * OAuth Settings Page
 * 
 * Full-page OAuth management interface.
 * Uses the unified OAuthManagement component in 'full' mode.
 */

import { OAuthManagement } from '@/components/oauth/oauth-management'

export default function OAuthSettingsPage() {
  return <OAuthManagement mode="full" />
}
