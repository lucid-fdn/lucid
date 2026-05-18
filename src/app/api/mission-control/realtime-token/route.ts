import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth/session'
import { SignJWT } from 'jose'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mission-control/realtime-token
 *
 * Mints a short-lived Supabase JWT for Realtime RLS authorization.
 * Bridges Privy auth → Supabase Realtime: the JWT includes the user's
 * internal UUID as `sub` (so auth.uid() works) and `role: "authenticated"`
 * (so RLS policies for the authenticated role apply).
 *
 * IMPORTANT: Uses getServerSession() (not getUserId()) because it resolves
 * the Privy DID (did:privy:xxx) to our internal UUID. Supabase auth.uid()
 * expects a UUID — a Privy DID string would break RLS policies.
 *
 * Signed with SUPABASE_REALTIME_JWT_KEY. Today this can be the legacy
 * project JWT secret (Dashboard → Settings → API). Long term, import
 * your own signing key for better key-management hygiene.
 *
 * See: https://supabase.com/docs/guides/realtime/postgres-changes
 * See: https://supabase.com/docs/guides/auth/signing-keys
 *
 * Token lifetime: 1 hour. Client must refresh before expiry.
 */
export async function GET(request: Request) {
  const session = await getServerSession()
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.userId

  const signingKey = process.env.SUPABASE_REALTIME_JWT_KEY
  if (!signingKey) {
    // No signing key configured — client will fall back to polling
    return NextResponse.json({ token: null })
  }

  // Extract org_id from query params (for RLS org scoping)
  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('org_id')

  const secret = new TextEncoder().encode(signingKey)

  const now = Math.floor(Date.now() / 1000)
  const expiresIn = 3600 // 1 hour

  const token = await new SignJWT({
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'lucid-mission-control',
    ...(orgId ? { org_id: orgId } : {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(secret)

  return NextResponse.json({
    token,
    expires_at: (now + expiresIn) * 1000, // ms for client
  })
}
