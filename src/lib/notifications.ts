/**
 * Server-Side Notification Helpers
 * 
 * @deprecated These helpers are legacy. Use NotificationService instead:
 * import { NotificationService } from '@/lib/notifications/service';
 * 
 * For multi-channel notifications (email, push, SMS), use NotificationService.
 * These helpers are kept for backwards compatibility only.
 */

import { createClient } from '@supabase/supabase-js';
import { getNotificationSeverity, type NotificationType } from '@/lib/notifications/types';

// Supabase client with service role (server-side only, lazy to avoid build-time crash)
let _supabase: ReturnType<typeof createClient<any>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

export interface CreateNotificationParams {
  user_id: string;
  organization_id?: string | null;  // null = global, string = org-specific
  title: string;
  message?: string;
  type: 'info' | 'success' | 'warning' | 'error';  // Legacy UI type
  href?: string;
  semantic_type?: NotificationType;  // Optional: semantic type for better categorization
}

/**
 * Create a notification (server-side)
 * 
 * @example
 * // Global notification
 * await createNotification({
 *   user_id: userId,
 *   organization_id: null,
 *   title: 'Welcome to Lucid!',
 *   message: 'Thanks for signing up',
 *   type: 'info'
 * });
 * 
 * // Org-specific notification
 * await createNotification({
 *   user_id: memberId,
 *   organization_id: orgId,
 *   title: 'New member joined',
 *   message: 'John Doe joined your team',
 *   type: 'success',
 *   href: `/workspace/${orgId}/settings/team`
 * });
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    // Determine severity: use semantic_type if provided, otherwise fallback to legacy type
    const severity = params.semantic_type 
      ? getNotificationSeverity(params.semantic_type)
      : params.type;
    
    const { data, error } = await getSupabase()
      .from('notifications')
      .insert({
        user_id: params.user_id,
        organization_id: params.organization_id ?? null,
        title: params.title,
        message: params.message,
        type: params.semantic_type || params.type,  // Store semantic type if available
        severity,  // Add severity for UI
        href: params.href,
        read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[createNotification] Error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[createNotification] Failed:', error);
    throw error;
  }
}

/**
 * Create notifications for multiple users
 * Useful for notifying all org members
 * 
 * @example
 * await createBulkNotifications({
 *   user_ids: orgMemberIds,
 *   organization_id: orgId,
 *   title: 'Team update',
 *   message: 'New project created',
 *   type: 'info'
 * });
 */
export async function createBulkNotifications(params: Omit<CreateNotificationParams, 'user_id'> & { user_ids: string[] }) {
  try {
    // Determine severity
    const severity = params.semantic_type 
      ? getNotificationSeverity(params.semantic_type)
      : params.type;
    
    const notifications = params.user_ids.map(user_id => ({
      user_id,
      organization_id: params.organization_id ?? null,
      title: params.title,
      message: params.message,
      type: params.semantic_type || params.type,  // Store semantic type if available
      severity,  // Add severity for UI
      href: params.href,
      read: false,
    }));

    const { data, error } = await getSupabase()
      .from('notifications')
      .insert(notifications)
      .select();

    if (error) {
      console.error('[createBulkNotifications] Error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[createBulkNotifications] Failed:', error);
    throw error;
  }
}

/**
 * Get organization members for bulk notifications
 */
export async function getOrgMemberIds(orgId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId);

  if (error) {
    console.error('[getOrgMemberIds] Error:', error);
    return [];
  }

  return data?.map(m => m.user_id) || [];
}

/**
 * Helper: Notify all org members
 * 
 * @example
 * await notifyOrgMembers(orgId, {
 *   title: 'New feature released',
 *   message: 'Check out our new dashboard',
 *   type: 'info',
 *   href: `/workspace/${orgId}/dashboard`
 * });
 */
export async function notifyOrgMembers(
  orgId: string,
  notification: Omit<CreateNotificationParams, 'user_id' | 'organization_id'>
) {
  const memberIds = await getOrgMemberIds(orgId);
  
  if (memberIds.length === 0) {
    console.warn('[notifyOrgMembers] No members found for org:', orgId);
    return [];
  }

  return createBulkNotifications({
    user_ids: memberIds,
    organization_id: orgId,
    ...notification,
  });
}

/**
 * Example: Notification templates for common scenarios
 */
export const NotificationTemplates = {
  /**
   * When user is invited to org
   */
  orgInvite: (inviteeUserId: string, orgId: string, orgName: string, inviterName: string) =>
    createNotification({
      user_id: inviteeUserId,
      organization_id: orgId,
      title: 'Organization invitation',
      message: `${inviterName} invited you to join ${orgName}`,
      type: 'info',
      href: `/workspace/${orgId}`,
    }),

  /**
   * When new member joins org
   */
  memberJoined: (orgId: string, memberName: string) =>
    notifyOrgMembers(orgId, {
      title: 'New member joined',
      message: `${memberName} just joined your organization`,
      type: 'success',
      href: `/workspace/${orgId}/settings/team`,
    }),

  /**
   * When member is removed
   */
  memberRemoved: (userId: string, orgId: string, orgName: string) =>
    createNotification({
      user_id: userId,
      organization_id: null,  // Global (user can't access org anymore)
      title: 'Removed from organization',
      message: `You were removed from ${orgName}`,
      type: 'warning',
    }),

  /**
   * When user's role changes
   */
  roleChanged: (userId: string, orgId: string, newRole: string, orgName: string) =>
    createNotification({
      user_id: userId,
      organization_id: orgId,
      title: 'Role updated',
      message: `Your role in ${orgName} was changed to ${newRole}`,
      type: 'info',
      href: `/workspace/${orgId}`,
    }),

  /**
   * When project is created
   */
  projectCreated: (orgId: string, projectName: string, projectId: string) =>
    notifyOrgMembers(orgId, {
      title: 'New project created',
      message: `Project "${projectName}" is now available`,
      type: 'success',
      href: `/workspace/${orgId}/projects/${projectId}`,
    }),

  /**
   * Welcome notification for new users
   */
  welcome: (userId: string) =>
    createNotification({
      user_id: userId,
      organization_id: null,  // Global
      title: 'Welcome to Lucid!',
      message: 'Get started by completing your profile',
      type: 'info',
      href: '/settings/profile',
    }),
};
