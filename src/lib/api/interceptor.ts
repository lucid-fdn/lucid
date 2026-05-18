/**
 * API Request Interceptor
 * Handles 401 errors with automatic token refresh and retry
 * Includes CSRF protection for mutating requests
 */

import { refreshAuthToken } from '@/lib/auth/refresh';
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client';

// Track ongoing refresh to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Fetch wrapper with automatic 401 handling and CSRF protection
 * Automatically refreshes token and retries request on 401
 */
export async function fetchWithAuth(
  url: string | URL | Request,
  options: RequestInit = {}
): Promise<Response> {
  // Add credentials by default
  const fetchOptions: RequestInit = {
    ...options,
    credentials: options.credentials || 'include',
    headers: {
      ...options.headers,
    },
  };

  // Add CSRF token for mutating requests
  const method = options.method?.toUpperCase() || 'GET';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCSRFTokenFromCookie();
    if (csrfToken) {
      (fetchOptions.headers as Record<string, string>)['x-csrf-token'] = csrfToken;
    }
  }

  // Make initial request
  let response = await fetch(url, fetchOptions);

  // Handle 401 - Unauthorized
  if (response.status === 401) {
    console.log('[fetch-interceptor] 401 detected, attempting auth refresh');

    // If already refreshing, wait for that to complete
    if (isRefreshing && refreshPromise) {
      await refreshPromise;
    } else {
      // Start new refresh
      isRefreshing = true;
      refreshPromise = refreshAuthToken();
      
      try {
        const refreshSuccess = await refreshPromise;

        if (refreshSuccess) {
          console.log('[fetch-interceptor] Auth refreshed, retrying request');
          // Retry original request
          response = await fetch(url, fetchOptions);
        } else {
          console.warn('[fetch-interceptor] Auth refresh failed, redirecting to login');
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    }
  }

  return response;
}

/**
 * Enhanced fetch that throws on error status codes
 * Useful for API calls where you want automatic error handling
 */
export async function fetchWithAuthOrThrow(
  url: string | URL | Request,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetchWithAuth(url, options);

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    (error as unknown as Record<string, Response>).response = response;
    throw error;
  }

  return response;
}

/**
 * JSON API helper with automatic auth handling
 */
export async function fetchJSON<T = unknown>(
  url: string | URL | Request,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithAuthOrThrow(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response.json();
}
