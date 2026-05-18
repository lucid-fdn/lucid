"use client"

import { useEffect, useState } from 'react'
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences-form'
import { getNotificationPreferencesAction } from '@/lib/forms/actions'
import { useAuth } from '@/contexts/auth-context'
import { Skeleton } from '@/components/ui/skeleton'
import type { NotificationPreferencesData } from '@/lib/forms/schemas'

export function NotificationsSettings() {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState<Partial<NotificationPreferencesData> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPreferences() {
      if (!user?.id) {
        console.log('[NotificationsSettings] No user ID, skipping fetch')
        setLoading(false)
        return
      }

      console.log('[NotificationsSettings] 🔍 Fetching preferences for user:', user.id)
      
      try {
        const result = await getNotificationPreferencesAction()
        
        if (result.success && result.data) {
          console.log('[NotificationsSettings] ✅ Fetched preferences:', result.data)
          setPreferences(result.data)
        } else {
          console.error('[NotificationsSettings] ❌ Failed:', result.error)
          setPreferences({}) // Fallback to defaults
        }
      } catch (error) {
        console.error('[NotificationsSettings] ❌ Error fetching preferences:', error)
        setPreferences({}) // Fallback to defaults
      } finally {
        setLoading(false)
      }
    }

    fetchPreferences()
  }, [user?.id])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground mt-1">
          Choose how you want to be notified about activity
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        /* Notification Preferences Form */
        <NotificationPreferencesForm defaultValues={preferences || {}} />
      )}
    </div>
  )
}
