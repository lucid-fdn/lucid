/**
 * Centralized Email Configuration
 * Single source of truth for all email addresses
 */

export const EMAIL_ADDRESSES = {
  // Contact & Forms
  CONTACT: 'contact@form.lucid.foundation',
  WAITINGLIST: 'waitinglist@lucid.foundation',
  
  // Notifications & Alerts
  NOTIFICATIONS: 'notifications@lucid.foundation',
  ALERTS: 'alerts@lucid.foundation',
  
  // System
  NO_REPLY: 'no-reply@lucid.foundation',
  SYSTEM: 'system@lucid.foundation',
} as const;

// Get email from config or env, with fallback
export function getEmailFrom(type: keyof typeof EMAIL_ADDRESSES): string {
  return process.env.EMAIL_FROM || EMAIL_ADDRESSES[type];
}

// For backwards compatibility
export const DEFAULT_FROM = EMAIL_ADDRESSES.NOTIFICATIONS;
