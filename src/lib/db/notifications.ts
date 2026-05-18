/**
 * Notification preferences and notification inbox operations
 */

import { supabase, ErrorService } from './client'

const DEBUG_NOTIFICATIONS_DB = process.env.NEXT_PUBLIC_DEBUG_NOTIFICATIONS_DB === 'true'

function debugNotifications(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_NOTIFICATIONS_DB) return
  console.debug(`[db:notifications] ${message}`, metadata)
}

const NOTIFICATION_PREFERENCES_SELECT =
  'user_id, channel_web, channel_email, posts_email, posts_web, watched_activity_email, watched_activity_web, org_join_requests, org_suggestions, follow_web, follow_email, new_followers, interactions_web, interactions_email, features_announcements, gated_repo_requests, billing_notifications, created_at, updated_at' as const

const NOTIFICATION_SELECT =
  'id, user_id, title, message, type, severity, read, href, created_at' as const

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

export async function getNotificationPreferences(userId: string) {
  debugNotifications('getNotificationPreferences start', { hasUserId: Boolean(userId) })

  const { data, error } = await supabase
    .from('notification_preferences')
    .select(NOTIFICATION_PREFERENCES_SELECT)
    .eq('user_id', userId)
    .single();

  if (error) {
    debugNotifications('No preferences found, returning defaults', { error: error.message })
    // Return defaults if not found - MUST match all 16 DB columns
    return {
      // Master Channels
      channel_web: true,
      channel_email: true,
      // Posts & Activity
      posts_email: true,
      posts_web: true,
      watched_activity_email: true,
      watched_activity_web: true,
      // Organization
      org_join_requests: true,
      org_suggestions: false,
      // Social
      follow_web: true,
      follow_email: true,
      new_followers: true,
      // Asset Interactions
      interactions_web: true,
      interactions_email: false,
      // System & Features
      features_announcements: true,
      gated_repo_requests: true,
      billing_notifications: true,
    };
  }

  debugNotifications('getNotificationPreferences found data', {
    fieldCount: Object.keys(data).length,
    hasAllFields: data.channel_web !== undefined && data.posts_email !== undefined
  })

  return data;
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Record<string, boolean>
) {
  debugNotifications('updateNotificationPreferences start')
  debugNotifications('preferences received', {
    fieldCount: Object.keys(preferences).length
  })

  const payload = {
    user_id: userId,
    ...preferences,
    updated_at: new Date().toISOString(),
  }

  debugNotifications('Payload to upsert', {
    fieldCount: Object.keys(payload).length
  })

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(payload as Record<string, unknown>, {
      onConflict: 'user_id'  // ✅ Fix: Specify conflict column
    })
    .select()
    .single();

  if (error) {
    console.error('[db] ❌ Failed to update notification preferences:', error);
    console.error('[db] Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    })
    throw error;
  }

  debugNotifications('updateNotificationPreferences complete', { hasData: Boolean(data) })

  return data;
}

// ============================================================================
// NOTIFICATIONS (Bell/Inbox)
// ============================================================================

export async function getNotifications(userId: string, limit: number = 50) {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        limit,
        table: 'notifications',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'notifications'
      }
    });
    return [];
  }

  return data || [];
}

export async function createNotification(notification: {
  user_id: string;
  title: string;
  message?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  href?: string;
}) {
  const { data, error } = await supabase
    .from('notifications')
    .insert(notification as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId: notification.user_id,
        type: notification.type,
        table: 'notifications',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'notifications'
      }
    });
    throw error;
  }

  return data;
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true } as Record<string, unknown>)
    .eq('id', notificationId)
    .eq('user_id', userId); // Security: ensure user owns notification

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        notificationId,
        table: 'notifications',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'notifications'
      }
    });
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true } as Record<string, unknown>)
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        table: 'notifications',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'notifications'
      }
    });
    throw error;
  }
}

export async function deleteNotification(userId: string, notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', userId); // Security: ensure user owns notification

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        notificationId,
        table: 'notifications',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'notifications'
      }
    });
    throw error;
  }
}
