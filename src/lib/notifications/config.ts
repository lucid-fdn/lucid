/**
 * Notification System Configuration
 * Central config for all notification channels (in-app, email, SMS, push)
 */

// Environment-based toggles
export const NOTIFICATIONS_ENABLED = process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED !== 'false';

export const NOTIFICATION_CONFIG = {
  // Global toggle
  ENABLED: NOTIFICATIONS_ENABLED,
  
  // Channel toggles (can be controlled per environment)
  CHANNELS: {
    IN_APP: {
      ENABLED: true, // Always enabled
      POLLING_INTERVAL: 30000, // 30 seconds
      MAX_DISPLAY: 10,
    },
    EMAIL: {
      ENABLED: process.env.NEXT_PUBLIC_EMAIL_NOTIFICATIONS === 'true',
      PROVIDER: 'resend', // 'resend' | 'sendgrid' | 'ses'
      FROM: process.env.EMAIL_FROM || 'notifications@lucid.foundation',
      BATCH_DELAY: 300000, // 5 minutes - batch notifications
    },
    SMS: {
      ENABLED: process.env.NEXT_PUBLIC_SMS_NOTIFICATIONS === 'true',
      PROVIDER: 'twilio', // 'twilio' | 'vonage'
      RATE_LIMIT: 5, // Max 5 SMS per hour per user
    },
    PUSH: {
      ENABLED: process.env.NEXT_PUBLIC_PUSH_NOTIFICATIONS !== 'false',
      VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
      RATE_LIMIT: 20, // Max 20 push per hour per user
    },
  },
  
  // Notification types and their default channels
  TYPES: {
    NEW_FOLLOWER: {
      in_app: true,
      email: true,
      push: true,
      sms: false,
    },
    ASSET_LIKED: {
      in_app: true,
      email: false, // Too frequent
      push: false,
      sms: false,
    },
    ASSET_RATED: {
      in_app: true,
      email: false,
      push: false,
      sms: false,
    },
    ASSET_PUBLISHED: {
      in_app: true,
      email: true,
      push: true,
      sms: false,
    },
    MENTION: {
      in_app: true,
      email: true,
      push: true,
      sms: false,
    },
    WORKFLOW_EXECUTED: {
      in_app: false,  // ❌ Don't show success in bell (industry standard)
      email: false,   // ❌ Too frequent
      push: false,    // ❌ Too noisy
      sms: false,
    },
    WORKFLOW_FAILED: {
      in_app: true,   // ✅ Show failures in bell (actionable)
      email: true,    // ✅ Important to know
      push: true,     // ✅ Immediate action needed
      sms: false,
    },
    AGENT_OPS_PERFORMANCE_ALERT: {
      in_app: true,
      email: false, // Keep budget alerts in-product by default; external escalation can be policy-driven later.
      push: false,
      sms: false,
    },
    IMPORTANT_UPDATE: {
      in_app: true,
      email: true,
      push: true,
      sms: true, // Only for critical updates
    },
  },
  
  // Rate limiting
  RATE_LIMITS: {
    PER_USER_PER_HOUR: 50,
    PER_USER_PER_DAY: 200,
  },
  
  // Batching (for email)
  BATCHING: {
    ENABLED: true,
    WINDOW_MS: 300000, // 5 minutes
  },
} as const;

// Helper to check if notification type should use channel
export function shouldSendToChannel(
  type: keyof typeof NOTIFICATION_CONFIG.TYPES,
  channel: 'in_app' | 'email' | 'push' | 'sms'
): boolean {
  if (!NOTIFICATION_CONFIG.ENABLED) return false;
  
  const channelConfig = NOTIFICATION_CONFIG.CHANNELS[channel.toUpperCase() as keyof typeof NOTIFICATION_CONFIG.CHANNELS];
  if (!channelConfig.ENABLED) return false;
  
  const typeConfig = NOTIFICATION_CONFIG.TYPES[type];
  return typeConfig[channel] ?? false;
}

// Environment validation
export function validateNotificationConfig(): string[] {
  const errors: string[] = [];
  
  if (NOTIFICATION_CONFIG.CHANNELS.EMAIL.ENABLED) {
    if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
      errors.push('Email notifications enabled but no API key provided');
    }
  }
  
  if (NOTIFICATION_CONFIG.CHANNELS.SMS.ENABLED) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      errors.push('SMS notifications enabled but Twilio credentials missing');
    }
  }
  
  if (NOTIFICATION_CONFIG.CHANNELS.PUSH.ENABLED) {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      errors.push('Push notifications enabled but VAPID keys missing');
    }
  }
  
  return errors;
}

// Log configuration on startup only when explicitly debugging notification setup.
if (typeof window === 'undefined' && process.env.DEBUG_NOTIFICATIONS_CONFIG === 'true') {
  console.log('[Notifications] Safe configuration flags:', {
    enabled: NOTIFICATION_CONFIG.ENABLED,
    channels: {
      inApp: NOTIFICATION_CONFIG.CHANNELS.IN_APP.ENABLED,
      email: NOTIFICATION_CONFIG.CHANNELS.EMAIL.ENABLED,
      textMessages: NOTIFICATION_CONFIG.CHANNELS.SMS.ENABLED,
      push: NOTIFICATION_CONFIG.CHANNELS.PUSH.ENABLED,
    },
  });
  
  const errors = validateNotificationConfig();
  if (errors.length > 0) {
    console.warn('[Notifications] Configuration warnings:', errors);
  }
}
