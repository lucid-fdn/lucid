/**
 * Unified Notification System Types
 * Industry standard: Semantic types with severity mapping
 */

// Notification types (semantic event names)
export type NotificationType =
  | 'NEW_FOLLOWER'
  | 'ASSET_LIKED'
  | 'ASSET_RATED'
  | 'ASSET_PUBLISHED'
  | 'MENTION'
  | 'WORKFLOW_EXECUTED'
  | 'WORKFLOW_FAILED'
  | 'AGENT_OPS_PERFORMANCE_ALERT'
  | 'IMPORTANT_UPDATE';

// UI severity levels
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

// Map notification types to UI severity
export const NOTIFICATION_SEVERITY_MAP: Record<NotificationType, NotificationSeverity> = {
  NEW_FOLLOWER: 'info',
  ASSET_LIKED: 'info',
  ASSET_RATED: 'info',
  ASSET_PUBLISHED: 'success',
  MENTION: 'warning',
  WORKFLOW_EXECUTED: 'success',
  WORKFLOW_FAILED: 'error',
  AGENT_OPS_PERFORMANCE_ALERT: 'warning',
  IMPORTANT_UPDATE: 'warning',
};

/**
 * Get UI severity for a notification type
 */
export function getNotificationSeverity(type: NotificationType): NotificationSeverity {
  return NOTIFICATION_SEVERITY_MAP[type] || 'info';
}

/**
 * Notification data structure
 */
export interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  organizationId?: string | null;
  relatedUserId?: string;
  relatedAssetId?: string;
}
