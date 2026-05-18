import { getUserId } from '@/lib/auth/server-utils'
import { getNotificationPreferences } from '@/ports/db'
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences-form'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Notifications',
  description: 'Manage notification preferences',
}

export default async function NotificationsPage() {
  // Get authenticated user ID
  const userId = await getUserId()
  
  if (!userId) {
    // Redirect to login if not authenticated
    redirect('/login')
  }
  
  // Fetch notification preferences
  const preferences = await getNotificationPreferences(userId)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground mt-1">
          Choose how you want to be notified about activity
        </p>
      </div>

      {/* Notification Preferences Form */}
      <NotificationPreferencesForm defaultValues={preferences} />
    </div>
  )
}
