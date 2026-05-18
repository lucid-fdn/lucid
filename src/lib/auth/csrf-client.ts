/**
 * Client-safe CSRF helpers.
 * Separated from csrf.ts to avoid importing `next/headers` in client components.
 */

const CSRF_COOKIE_NAME = 'csrf-token'

/**
 * Client-side helper to get CSRF token from cookie.
 * Safe to import in 'use client' components.
 */
export function getCSRFTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(new RegExp(`(^| )${CSRF_COOKIE_NAME}=([^;]+)`))
  return match ? match[2] : null
}
