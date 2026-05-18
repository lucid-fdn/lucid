import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

/**
 * State-changing fetch wrapper for retail client components.
 *
 * Every retail POST/DELETE has to supply the `x-csrf-token` header, and
 * on the very first request of a session the cookie may not exist yet.
 * This helper encapsulates the "warm up the CSRF cookie, then send with
 * the header" pattern so individual editors don't each reimplement it
 * (and silently 403 when someone forgets). Used by the retail wizard,
 * personality editor, and knowledge editor.
 */
export async function retailCsrfFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let csrf = getCSRFTokenFromCookie()
  if (!csrf) {
    // Warm-up GET. `/api/auth/csrf` sets the cookie on the response.
    await fetch('/api/auth/csrf').catch(() => {})
    csrf = getCSRFTokenFromCookie()
  }

  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(csrf && { 'x-csrf-token': csrf }),
    },
  })
}
