'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { notificationPreferencesSchema, type NotificationPreferencesData } from '@/lib/forms/schemas'
import { updateNotificationPreferencesAction } from '@/lib/forms/actions'
import { useNotification } from '@/contexts/notification-context'
import { Bell, Mail, Users, Star, Info } from 'lucide-react'
import { notificationCopy } from '@/lib/notifications/copy'

interface NotificationPreferencesFormProps {
  defaultValues: Partial<NotificationPreferencesData>
}

export function NotificationPreferencesForm({ defaultValues }: NotificationPreferencesFormProps) {
  const [_saving, setSaving] = useState(false)
  const [_lastSaved, setLastSaved] = useState<Date | null>(null)
  const { showNotification } = useNotification()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const {
    setValue,
    watch,
    getValues,
  } = useForm<NotificationPreferencesData>({
    resolver: zodResolver(notificationPreferencesSchema),
    defaultValues: {
      // Master Channels
      channel_web: defaultValues.channel_web ?? true,
      channel_email: defaultValues.channel_email ?? true,
      // Posts & Activity
      posts_email: defaultValues.posts_email ?? true,
      posts_web: defaultValues.posts_web ?? true,
      watched_activity_email: defaultValues.watched_activity_email ?? true,
      watched_activity_web: defaultValues.watched_activity_web ?? true,
      // Organization
      org_join_requests: defaultValues.org_join_requests ?? true,
      org_suggestions: defaultValues.org_suggestions ?? false,
      // Social
      follow_web: defaultValues.follow_web ?? true,
      follow_email: defaultValues.follow_email ?? true,
      new_followers: defaultValues.new_followers ?? true,
      // Asset Interactions
      interactions_web: defaultValues.interactions_web ?? true,
      interactions_email: defaultValues.interactions_email ?? false,
      // System & Features
      features_announcements: defaultValues.features_announcements ?? true,
      gated_repo_requests: defaultValues.gated_repo_requests ?? true,
      billing_notifications: defaultValues.billing_notifications ?? true,
    },
  })

  const formValues = watch()

  const scheduleAutoSave = () => {
    console.log('[NotificationForm] ⏰ scheduleAutoSave called')
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      console.log('[NotificationForm] 💾 Timeout fired! Starting save...')
      setSaving(true)

      try {
        const currentValues = getValues() as NotificationPreferencesData
        console.log('[NotificationForm] 📤 Calling action with values:', {
          ...currentValues,
          fieldCount: Object.keys(currentValues).length
        })
        const result = await updateNotificationPreferencesAction(currentValues)

        if (result.success) {
          setLastSaved(new Date())
          showNotification({
            type: 'success',
            title: 'Saved',
            message: 'Preferences updated',
            duration: 2000,
          })
        } else {
          showNotification({
            type: 'error',
            title: 'Failed to Save',
            message: result.error || 'Failed to update preferences',
            duration: 5000,
          })
        }
      } catch (error) {
        console.error('[notification-preferences-form] Auto-save error:', error)
        showNotification({
          type: 'error',
          title: notificationCopy.title.error,
          message: 'Failed to save preferences',
          duration: 5000,
        })
      } finally {
        setSaving(false)
      }
    }, 1000)
  }

  const handleSwitchChange = (field: keyof NotificationPreferencesData, value: boolean) => {
    console.log('[NotificationForm] 🔄 Switch changed:', { field, value })
    setValue(field, value)
    console.log('[NotificationForm] ⏰ Calling scheduleAutoSave')
    scheduleAutoSave()
  }

  const handleMasterToggle = (channel: 'web' | 'email', value: boolean) => {
    if (channel === 'web') {
      setValue('channel_web', value)
      setValue('follow_web', value)
      setValue('interactions_web', value)
    } else {
      setValue('channel_email', value)
      setValue('follow_email', value)
      setValue('interactions_email', value)
    }
    scheduleAutoSave()
  }

  return (
    <div className="space-y-6">
      {/* Master Controls Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notification Channels</CardTitle>
          <CardDescription>
            Control all notifications by channel type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Web Channel Master */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors duration-120">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Web Notifications</p>
                    <Badge variant={formValues.channel_web ? "default" : "secondary"} className="text-xs">
                      {formValues.channel_web ? "On" : "Off"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    In-app toast messages and alerts
                  </p>
                </div>
              </div>
              <Switch
                checked={formValues.channel_web}
                onCheckedChange={(checked) => handleMasterToggle('web', checked)}
              />
            </div>

            {/* Email Channel Master */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Email Notifications</p>
                    <Badge variant={formValues.channel_email ? "default" : "secondary"} className="text-xs">
                      {formValues.channel_email ? "On" : "Off"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sent to your registered email address
                  </p>
                </div>
              </div>
              <Switch
                checked={formValues.channel_email}
                onCheckedChange={(checked) => handleMasterToggle('email', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Notification Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notification Types</CardTitle>
          <CardDescription>
            Choose which events trigger notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Followers */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-purple-500/10">
                  <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="font-medium">New Followers</h4>
                  <p className="text-sm text-muted-foreground">
                    When someone starts following you
                  </p>
                </div>
              </div>
              
              <div className="ml-11 space-y-3">
                {/* Web Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className={formValues.channel_web ? "" : "text-muted-foreground"}>
                      Web notification
                    </span>
                  </div>
                  <Switch
                    checked={formValues.follow_web}
                    onCheckedChange={(checked) => handleSwitchChange('follow_web', checked)}
                    disabled={!formValues.channel_web}
                  />
                </div>

                {/* Email Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className={formValues.channel_email ? "" : "text-muted-foreground"}>
                      Email notification
                    </span>
                  </div>
                  <Switch
                    checked={formValues.follow_email}
                    onCheckedChange={(checked) => handleSwitchChange('follow_email', checked)}
                    disabled={!formValues.channel_email}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Asset Interactions */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                  <Star className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h4 className="font-medium">Asset Interactions</h4>
                  <p className="text-sm text-muted-foreground">
                    Ratings, bookmarks, and comments on your assets
                  </p>
                </div>
              </div>
              
              <div className="ml-11 space-y-3">
                {/* Web Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className={formValues.channel_web ? "" : "text-muted-foreground"}>
                      Web notification
                    </span>
                  </div>
                  <Switch
                    checked={formValues.interactions_web}
                    onCheckedChange={(checked) => handleSwitchChange('interactions_web', checked)}
                    disabled={!formValues.channel_web}
                  />
                </div>

                {/* Email Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className={formValues.channel_email ? "" : "text-muted-foreground"}>
                      Email notification
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      May be frequent
                    </Badge>
                  </div>
                  <Switch
                    checked={formValues.interactions_email}
                    onCheckedChange={(checked) => handleSwitchChange('interactions_email', checked)}
                    disabled={!formValues.channel_email}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Notification Delivery
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Changes are saved automatically. Master channel toggles control all notifications for that channel. When a channel is disabled, individual notification types for that channel are also disabled.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
