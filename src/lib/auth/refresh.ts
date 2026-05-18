/**
 * Token Refresh Utilities
 * Handles automatic token refresh and retry logic
 */
import { summarizeError } from '@/lib/logging/safe-log'

/**
 * Attempts to refresh the authentication token
 * Returns true if successful, false otherwise
 */
export async function refreshAuthToken(): Promise<boolean> {
  try {
    // Read CSRF token from cookie (double-submit pattern)
    let csrfToken = document.cookie.match(/(^| )csrf-token=([^;]+)/)?.[2] || '';

    let response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
    });

    if (response.status === 403) {
      const csrfResponse = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (csrfResponse.ok) {
        csrfToken = document.cookie.match(/(^| )csrf-token=([^;]+)/)?.[2] || '';
        response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
        });
      }
    }

    if (response.ok) {
      console.log('[auth] Auth refreshed successfully');
      return true;
    }

    console.warn('[auth] Auth refresh failed:', response.status);
    return false;
  } catch (error) {
    console.error('[auth] Auth refresh error:', summarizeError(error));
    return false;
  }
}

/**
 * Checks if a token is close to expiry
 * @param expiryTime Token expiry timestamp in milliseconds
 * @param bufferMinutes Minutes before expiry to consider "close"
 */
export function isTokenExpiringSoon(
  expiryTime: number,
  bufferMinutes: number = 5
): boolean {
  const now = Date.now();
  const bufferMs = bufferMinutes * 60 * 1000;
  return expiryTime - now < bufferMs;
}

/**
 * Gets the expiry time of a JWT token
 * Returns null if token is invalid or doesn't have exp claim
 */
export function getTokenExpiryTime(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
