import { NextRequest, NextResponse } from 'next/server'

/**
 * Edge-safe middleware helpers — NO heavy dependencies.
 * Only cookie reading and redirects. Keeps middleware compilation fast.
 *
 * Provider-agnostic: checks all known auth cookie names.
 */

/** All possible auth cookie names across providers */
const AUTH_COOKIE_NAMES = [
  // Privy
  'privy-token',
  'privy-id-token',
  'privy-refresh-token',
  // Local (GoTrue / Supabase Auth)
  'sb-access-token',
  'sb-auth-token',
  'lucid-auth-token',
]

/**
 * Gets auth token from request cookies with validation.
 * Checks all provider cookie names.
 */
export function getAuthToken(req: NextRequest): string | null {
  for (const name of AUTH_COOKIE_NAMES) {
    const token = req.cookies.get(name)?.value
    if (token) {
      // Validate token format
      if (token.length < 20 || !token.includes('.')) {
        console.warn(`[middleware] Detected corrupted auth credential in ${name}, skipping`)
        continue
      }
      return token
    }
  }
  return null
}

/**
 * Creates a redirect response to login
 */
export function redirectToLogin(req: NextRequest): NextResponse {
  const url = new URL('/login', req.url)
  url.searchParams.set('next', req.nextUrl.pathname)
  return NextResponse.redirect(url)
}

/**
 * Creates a redirect response to dashboard
 */
export function redirectToDashboard(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/dashboard', req.url))
}
