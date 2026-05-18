import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { summarizeError } from '@/lib/logging/safe-log';

// Lazy init for build time
let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('Privy credentials not configured');
    }

    privyClient = new PrivyClient(appId, appSecret);
  }

  return privyClient;
}

/**
 * Gets auth token from request cookies with validation
 */
export function getAuthToken(req: NextRequest): string | null {
  const token = 
    req.cookies.get('privy-token')?.value ||
    req.cookies.get('privy-id-token')?.value ||
    req.cookies.get('privy-refresh-token')?.value ||
    null;
  
  // Validate token format to catch corrupted tokens
  // Valid JWT tokens should be at least 20 characters and contain dots
  if (token) {
    if (token.length < 20 || !token.includes('.')) {
      console.warn('[middleware] Detected corrupted auth credential, treating as unauthenticated');
      return null;
    }
  }
  
  return token;
}

/**
 * Verifies if a token is valid
 * Returns user ID if valid, null otherwise
 */
export async function verifyAuthToken(token: string): Promise<string | null> {
  try {
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);
    return claims.userId;
  } catch (error) {
    console.error('[middleware] Auth verification failed:', summarizeError(error));
    return null;
  }
}

/**
 * Creates a redirect response to login
 */
export function redirectToLogin(req: NextRequest): NextResponse {
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/**
 * Creates a redirect response to dashboard
 */
export function redirectToDashboard(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/dashboard', req.url));
}

/**
 * Creates a redirect response to onboarding
 */
export function redirectToOnboarding(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/onboarding/profile', req.url));
}

/**
 * Checks if user profile is complete
 * Returns true if profile has first_name and last_name
 */
export async function isProfileComplete(userId: string): Promise<boolean> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();
    
    if (error || !profile) {
      console.error('[middleware] Failed to fetch profile:', error ? summarizeError(error) : null);
      return true; // Fail open - don't block if we can't check
    }
    
    return !!(profile.first_name && profile.last_name);
  } catch (error) {
    console.error('[middleware] Profile check failed:', summarizeError(error));
    return true; // Fail open
  }
}
