/**
 * Central Notification Service
 * Handles all notification channels: in-app, email, SMS, push
 * Follows the same pattern as auth/cache services
 */

import { NOTIFICATION_CONFIG, shouldSendToChannel } from './config';
import { getNotificationSeverity, type NotificationType } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getNotificationPreferences } from '@/lib/db';
import { maskEmail, maskIdentifier, maskPhone } from '@/lib/logging/safe-log';

let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

export interface NotificationPayload {
  userId: string;
  type: keyof typeof NOTIFICATION_CONFIG.TYPES;
  title: string;
  message: string;
  link?: string;
  relatedUserId?: string;
  relatedAssetId?: string;
  relatedOrgId?: string;
  metadata?: Record<string, unknown>;
}

export interface OrgNotificationPayload extends Omit<NotificationPayload, 'userId'> {
  orgId: string;
  recipientLimit?: number;
}

export interface NotificationChannels {
  inApp?: boolean;
  email?: boolean;
  push?: boolean;
  sms?: boolean;
}

/**
 * Central notification service
 * Send notifications across all configured channels
 */
export class NotificationService {
  /**
   * Send notification to user across configured channels
   */
  static async send(
    payload: NotificationPayload,
    channelOverrides?: NotificationChannels
  ): Promise<{ success: boolean; errors: string[] }> {
    if (!NOTIFICATION_CONFIG.ENABLED) {
      console.log('[NotificationService] Notifications disabled');
      return { success: true, errors: [] };
    }

    const errors: string[] = [];
    const promises: Promise<void>[] = [];

    // Get user notification preferences
    const userPrefs = await getNotificationPreferences(payload.userId);
    
    // Map notification type to preference event type
    const isFollowEvent = payload.type === 'NEW_FOLLOWER';
    const isInteractionEvent = ['ASSET_LIKED', 'ASSET_RATED', 'MENTION'].includes(payload.type);
    
    // Check if user wants this type of notification
    if (isFollowEvent && !userPrefs.follow_web && !userPrefs.follow_email) {
      console.log(`[NotificationService] User ${maskIdentifier(payload.userId)} disabled follow notifications`);
      return { success: true, errors: [] };
    }
    
    if (isInteractionEvent && !userPrefs.interactions_web && !userPrefs.interactions_email) {
      console.log(`[NotificationService] User ${maskIdentifier(payload.userId)} disabled interaction notifications`);
      return { success: true, errors: [] };
    }

    // Determine which channels to use (respecting user preferences)
    const channels = {
      inApp: channelOverrides?.inApp ?? (
        userPrefs.channel_web && 
        (isFollowEvent ? userPrefs.follow_web : isInteractionEvent ? userPrefs.interactions_web : true) &&
        shouldSendToChannel(payload.type, 'in_app')
      ),
      email: channelOverrides?.email ?? (
        userPrefs.channel_email && 
        (isFollowEvent ? userPrefs.follow_email : isInteractionEvent ? userPrefs.interactions_email : true) &&
        shouldSendToChannel(payload.type, 'email')
      ),
      push: channelOverrides?.push ?? (
        userPrefs.channel_web && 
        (isFollowEvent ? userPrefs.follow_web : isInteractionEvent ? userPrefs.interactions_web : true) &&
        shouldSendToChannel(payload.type, 'push')
      ),
      sms: channelOverrides?.sms ?? shouldSendToChannel(payload.type, 'sms'),
    };

    console.log(`[NotificationService] Sending ${payload.type} to ${maskIdentifier(payload.userId)}`, channels);

    // In-app notification (Supabase)
    if (channels.inApp) {
      promises.push(
        this.sendInApp(payload).catch(err => {
          errors.push(`In-app: ${err.message}`);
        })
      );
    }

    // Email notification
    if (channels.email) {
      promises.push(
        this.sendEmail(payload).catch(err => {
          errors.push(`Email: ${err.message}`);
        })
      );
    }

    // Push notification
    if (channels.push) {
      promises.push(
        this.sendPush(payload).catch(err => {
          errors.push(`Push: ${err.message}`);
        })
      );
    }

    // SMS notification
    if (channels.sms) {
      promises.push(
        this.sendSMS(payload).catch(err => {
          errors.push(`SMS: ${err.message}`);
        })
      );
    }

    await Promise.allSettled(promises);

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Send in-app notification (Supabase)
   */
  private static async sendInApp(payload: NotificationPayload): Promise<void> {
    // Compute severity from notification type
    const severity = getNotificationSeverity(payload.type as NotificationType);
    
    const { error } = await getSupabase().from('notifications').insert({
      user_id: payload.userId,
      type: payload.type,
      severity, // Add severity for bell icon
      title: payload.title,
      message: payload.message,
      href: payload.link,
      link: payload.link,
      organization_id: payload.relatedOrgId,
      related_user_id: payload.relatedUserId,
      related_asset_id: payload.relatedAssetId,
      related_org_id: payload.relatedOrgId,
      metadata: payload.metadata,
    });

    if (error && error.code === '23505') {
      console.log(`[NotificationService] Duplicate notification skipped for ${maskIdentifier(payload.userId)}`);
      return;
    }
    if (error) throw error;
    console.log(`[NotificationService] In-app sent to ${maskIdentifier(payload.userId)} (severity: ${severity})`);
  }

  /**
   * Send email notification
   */
  private static async sendEmail(payload: NotificationPayload): Promise<void> {
    if (!NOTIFICATION_CONFIG.CHANNELS.EMAIL.ENABLED) return;

    // Get user email
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('email')
      .eq('id', payload.userId)
      .single();

    if (!profile?.email) {
      console.warn(`[NotificationService] No email for user ${maskIdentifier(payload.userId)}`);
      return;
    }

    // TODO: Implement based on provider
    const provider = NOTIFICATION_CONFIG.CHANNELS.EMAIL.PROVIDER;
    
    if (provider === 'resend') {
      await this.sendWithResend(profile.email, payload);
    } else if (provider === 'sendgrid') {
      await this.sendWithSendGrid(profile.email, payload);
    }

    console.log(`[NotificationService] Email sent to ${maskEmail(profile.email)}`);
  }

  /**
   * Send push notification (Web Push API)
   */
  private static async sendPush(payload: NotificationPayload): Promise<void> {
    if (!NOTIFICATION_CONFIG.CHANNELS.PUSH.ENABLED) return;

    // Get user's push subscriptions
    const { data: subscriptions } = await getSupabase()
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', payload.userId);

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`[NotificationService] No push subscriptions for ${maskIdentifier(payload.userId)}`);
      return;
    }

    // Send to all subscriptions
    const webpush = await import('web-push');
    
    webpush.setVapidDetails(
      'mailto:notifications@lucid.ai',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.message,
      icon: '/lucid.png',
      badge: '/lucid.png',
      data: {
        url: payload.link || '/',
        notificationId: Date.now(),
      },
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, pushPayload);
        } catch (error: unknown) {
          // Remove invalid subscriptions
          if (error instanceof Error && 'statusCode' in error && (error as Error & { statusCode: number }).statusCode === 410) {
            await getSupabase()
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          }
        }
      })
    );

    console.log(`[NotificationService] Push sent to ${subscriptions.length} devices`);
  }

  /**
   * Send SMS notification
   */
  private static async sendSMS(payload: NotificationPayload): Promise<void> {
    if (!NOTIFICATION_CONFIG.CHANNELS.SMS.ENABLED) return;

    // Get user phone
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('phone')
      .eq('id', payload.userId)
      .single();

    if (!profile?.phone) {
      console.warn(`[NotificationService] No phone for user ${maskIdentifier(payload.userId)}`);
      return;
    }

    // TODO: Implement Twilio
    console.log(`[NotificationService] SMS would be sent to ${maskPhone(profile.phone)}`);
  }

  /**
   * Send with Resend
   */
  private static async sendWithResend(email: string, payload: NotificationPayload): Promise<void> {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: NOTIFICATION_CONFIG.CHANNELS.EMAIL.FROM,
      to: email,
      subject: payload.title,
      html: `
        <h2>${payload.title}</h2>
        <p>${payload.message}</p>
        ${payload.link ? `<a href="${process.env.NEXT_PUBLIC_APP_URL}${payload.link}">View</a>` : ''}
      `,
    });
  }

  /**
   * Send with SendGrid
   */
  private static async sendWithSendGrid(_email: string, _payload: NotificationPayload): Promise<void> {
    // TODO: Implement SendGrid
    console.log('[NotificationService] SendGrid not implemented yet');
  }

  /**
   * Batch send notifications
   */
  static async sendBatch(notifications: NotificationPayload[]): Promise<void> {
    console.log(`[NotificationService] Batch sending ${notifications.length} notifications`);
    
    await Promise.allSettled(
      notifications.map(notification => this.send(notification))
    );
  }

  /**
   * Send the same notification to organization members.
   * This keeps product systems from reimplementing org fanout and lets the
   * normal per-user preference checks run through NotificationService.send().
   */
  static async sendToOrgMembers(
    payload: OrgNotificationPayload,
    channelOverrides?: NotificationChannels
  ): Promise<{ recipientCount: number; successCount: number; errors: string[] }> {
    const limit = Math.min(Math.max(payload.recipientLimit ?? 200, 1), 500);
    const { data, error } = await getSupabase()
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', payload.orgId)
      .limit(limit);

    if (error) throw error;

    const userIds = [...new Set((data ?? [])
      .map((row: { user_id?: string | null }) => row.user_id)
      .filter((userId): userId is string => Boolean(userId)))];

    const results = await Promise.allSettled(userIds.map((userId) => this.send({
      ...payload,
      userId,
      relatedOrgId: payload.relatedOrgId ?? payload.orgId,
    }, channelOverrides)));

    const errors = results.flatMap((result) => {
      if (result.status === 'rejected') return [result.reason instanceof Error ? result.reason.message : String(result.reason)];
      return result.value.errors;
    });

    return {
      recipientCount: userIds.length,
      successCount: results.filter((result) => result.status === 'fulfilled' && result.value.success).length,
      errors,
    };
  }
}

// Export convenience functions
export const sendNotification = NotificationService.send.bind(NotificationService);
export const sendBatchNotifications = NotificationService.sendBatch.bind(NotificationService);
