export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCSRFToken, setCSRFToken } from '@/lib/auth/csrf'
import { checkRateLimit, RateLimitPresets, getRequestIdentifier } from '@/lib/auth/rate-limit'
import { ErrorService } from '@/lib/errors/error-service'
import { getAuthProviderType } from '@/lib/auth/adapter'

export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  mode: z.enum(['login', 'signup']).default('login'),
})

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveAuthBaseUrl(): { baseUrl: string; usesSupabaseApiKey: boolean } {
  const explicit = process.env.GOTRUE_URL?.trim()
  if (explicit) {
    const normalized = trimTrailingSlash(explicit)
    return {
      baseUrl: normalized.endsWith('/auth/v1') ? normalized : `${normalized}/auth/v1`,
      usesSupabaseApiKey: normalized.includes('supabase.co'),
    }
  }

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  if (supabaseUrl) {
    return {
      baseUrl: `${trimTrailingSlash(supabaseUrl)}/auth/v1`,
      usesSupabaseApiKey: true,
    }
  }

  return {
    baseUrl: 'http://gotrue:9999',
    usesSupabaseApiKey: false,
  }
}

/**
 * Local auth login/signup — for self-hosted (GoTrue/Supabase Auth).
 *
 * POST /api/auth/local-login
 * Body: { email, password, mode: 'login' | 'signup' }
 */
export async function POST(req: NextRequest) {
  try {
    if (getAuthProviderType() !== 'local') {
      return NextResponse.json(
        { error: 'Local auth not enabled' },
        { status: 400 }
      )
    }

    // Rate limit: 5 attempts per 5 minutes
    const identifier = getRequestIdentifier(req)
    const rl = await checkRateLimit(`local-login:${identifier}`, RateLimitPresets.LOGIN)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      )
    }

    // Validate input
    const parsed = loginSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }
    const { email, password, mode } = parsed.data

    const { baseUrl, usesSupabaseApiKey } = resolveAuthBaseUrl()
    const anonKey =
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      ''

    const endpoint = mode === 'signup'
      ? `${baseUrl}/signup`
      : `${baseUrl}/token?grant_type=password`

    const gotrueResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(usesSupabaseApiKey && anonKey ? { apikey: anonKey } : {}),
      },
      body: JSON.stringify({ email, password }),
    })

    if (!gotrueResponse.ok) {
      const errorData = await gotrueResponse.json().catch(() => ({})) as Record<string, string>
      const msg = errorData.msg || errorData.error_description || 'Authentication failed'
      return NextResponse.json(
        { error: msg },
        { status: gotrueResponse.status }
      )
    }

    const data = await gotrueResponse.json() as { access_token?: string }

    if (!data.access_token) {
      return NextResponse.json(
        { error: 'No access token in response' },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      success: true,
      isNewUser: mode === 'signup',
    })

    response.cookies.set('lucid-auth-token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    })

    const csrfToken = await getCSRFToken()
    setCSRFToken(response, csrfToken)

    return response
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'error',
      context: { endpoint: '/auth/local-login', method: 'POST' },
      tags: { layer: 'api', route: 'local-login' },
    })
    return NextResponse.json({ error: 'Server Error' }, { status: 500 })
  }
}
