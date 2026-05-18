/**
 * CSRF Protection
 * Implements double-submit cookie pattern for CSRF protection
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const DEBUG_CSRF = process.env.CSRF_DEBUG === 'true';

/**
 * Generates a random CSRF token
 */
function generateCSRFToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Gets or creates a CSRF token for the current session
 */
export async function getCSRFToken(): Promise<string> {
  const cookieStore = await cookies();
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!token) {
    token = generateCSRFToken();
  }

  return token;
}

/**
 * Sets CSRF token in response cookies
 */
export function setCSRFToken(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/**
 * Validates CSRF token from request
 * Implements double-submit cookie pattern
 */
export async function validateCSRFToken(req: NextRequest): Promise<boolean> {
  // GET requests don't need CSRF protection
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return true;
  }

  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = req.headers.get(CSRF_HEADER_NAME);

  if (DEBUG_CSRF) {
    console.debug('[request-guard] Validating:', req.method, new URL(req.url).pathname, {
      hasCookieToken: Boolean(cookieToken),
      hasHeaderToken: Boolean(headerToken),
    });
  }

  if (!cookieToken || !headerToken) {
    console.warn('[request-guard] Missing request guard', {
      hasCookie: Boolean(cookieToken),
      hasHeader: Boolean(headerToken),
    });
    return false;
  }

  if (cookieToken !== headerToken) {
    console.warn('[request-guard] Request guard mismatch');
    return false;
  }

  if (DEBUG_CSRF) console.debug('[request-guard] Request guard valid');
  return true;
}

/**
 * Middleware helper to enforce CSRF protection
 */
export async function requireCSRF(req: NextRequest): Promise<NextResponse | null> {
  const isValid = await validateCSRFToken(req);

  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Client-side helper to get CSRF token from cookie
 */
export function getCSRFTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(new RegExp(`(^| )${CSRF_COOKIE_NAME}=([^;]+)`));
  return match ? match[2] : null;
}

/**
 * Wraps an API route handler with CSRF validation.
 * Use for all state-changing endpoints (POST, PATCH, PUT, DELETE).
 *
 * Usage:
 *   export const POST = withCSRF(async (req) => {
 *     // handler logic
 *   })
 */
export function withCSRF<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (req: NextRequest, ...args: any[]) => Promise<NextResponse | Response>
>(handler: T): T {
  const wrapped = async (req: NextRequest, ...args: unknown[]) => {
    // Skip CSRF for webhook routes (they use their own auth)
    // Skip for GET/HEAD/OPTIONS (safe methods)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return handler(req, ...args);
    }

    const csrfError = await requireCSRF(req);
    if (csrfError) return csrfError;

    return handler(req, ...args);
  };
  return wrapped as T;
}
