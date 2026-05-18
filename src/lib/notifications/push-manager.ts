'use client';

import { NOTIFICATION_CONFIG } from './config';

/**
 * Client-side Push Notification Manager
 * Handles permission, subscription, and unsubscription
 */
export class PushNotificationManager {
  /**
   * Request permission and subscribe to push notifications
   */
  static async subscribe(userId: string): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[PushManager] Push notifications not supported');
      return false;
    }

    if (!NOTIFICATION_CONFIG.CHANNELS.PUSH.ENABLED) {
      console.warn('[PushManager] Push notifications disabled in config');
      return false;
    }

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[PushManager] Permission denied');
        return false;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          NOTIFICATION_CONFIG.CHANNELS.PUSH.VAPID_PUBLIC_KEY
        ) as BufferSource,
      });

      // Save to backend
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          subscription: subscription.toJSON(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      console.log('[PushManager] Subscribed successfully');
      return true;
    } catch (error) {
      console.error('[PushManager] Subscribe failed:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  static async unsubscribe(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      await subscription.unsubscribe();

      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      });

      console.log('[PushManager] Unsubscribed');
    } catch (error) {
      console.error('[PushManager] Unsubscribe failed:', error);
    }
  }

  /**
   * Check if currently subscribed
   */
  static async isSubscribed(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false;

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;

      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch (error) {
      console.error('[PushManager] isSubscribed check failed:', error);
      return false;
    }
  }

  /**
   * Get current permission status
   */
  static getPermissionStatus(): NotificationPermission {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  private static urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
