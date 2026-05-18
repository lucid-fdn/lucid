import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, RateLimitPresets, getRequestIdentifier } from '@/lib/auth/rate-limit';
import { requireCSRF, getCSRFToken, setCSRFToken } from '@/lib/auth/csrf';
import { AuthAudit, getClientIP, getUserAgent } from '@/lib/auth/audit';
import { ErrorService } from '@/lib/errors/error-service';
import { getAuthProvider, getAuthProviderType } from '@/lib/auth/adapter';
import { getServerSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/refresh
 * Refreshes the authentication token using Privy's refresh token
 */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const userAgent = getUserAgent(req);
  
  // Check CSRF token
  const csrfError = await requireCSRF(req);
  if (csrfError) {
    AuthAudit.csrfViolation(ip, userAgent, '/api/auth/refresh');
    return csrfError;
  }
  
  // Apply dual rate limiting (5/min + 50/hr)
  const identifier = getRequestIdentifier(req);
  
  // Check minute limit
  const rateLimitMin = await checkRateLimit(`${identifier}:refresh:min`, RateLimitPresets.AUTH_MINUTE);
  if (!rateLimitMin.success) {
    AuthAudit.rateLimitHit(ip, '/api/auth/refresh (5/min)');
    return NextResponse.json(
      { 
        error: 'Too many requests - minute limit',
        retryAfter: Math.ceil((rateLimitMin.resetAt - Date.now()) / 1000)
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitMin.limit.toString(),
          'X-RateLimit-Remaining': rateLimitMin.remaining.toString(),
          'X-RateLimit-Reset': rateLimitMin.resetAt.toString(),
        }
      }
    );
  }
  
  // Check hour limit
  const rateLimitHour = await checkRateLimit(`${identifier}:refresh:hour`, RateLimitPresets.AUTH_HOUR);
  if (!rateLimitHour.success) {
    AuthAudit.rateLimitHit(ip, '/api/auth/refresh (50/hr)');
    return NextResponse.json(
      { 
        error: 'Too many requests - hour limit',
        retryAfter: Math.ceil((rateLimitHour.resetAt - Date.now()) / 1000)
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitHour.limit.toString(),
          'X-RateLimit-Remaining': rateLimitHour.remaining.toString(),
          'X-RateLimit-Reset': rateLimitHour.resetAt.toString(),
        }
      }
    );
  }
  
  try {
    if (getAuthProviderType() === 'local') {
      const session = await getServerSession()

      if (!session.userId) {
        const cookieStore = await cookies()
        const provider = await getAuthProvider()
        const hasLocalAuthCookie = provider.tokenCookieNames.some((name) => {
          const value = cookieStore.get(name)?.value
          return typeof value === 'string' && value.length > 0
        })

        if (!hasLocalAuthCookie) {
          AuthAudit.refreshFailure(ip, 'No valid local session')
          return NextResponse.json(
            { error: 'No valid tokens for refresh' },
            { status: 401 }
          )
        }
      }

      AuthAudit.refreshSuccess(session.userId ?? 'local-cookie-session', ip)
      const response = NextResponse.json({
        success: true,
        message: 'Local auth session is valid',
      })
      const csrfToken = await getCSRFToken()
      setCSRFToken(response, csrfToken)
      return response
    }

    const cookieStore = await cookies();
    
    // Get current tokens
    const refreshToken = cookieStore.get('privy-refresh-token')?.value;
    const currentToken = cookieStore.get('privy-token')?.value;

    if (!refreshToken && !currentToken) {
      return NextResponse.json(
        { error: 'No authentication tokens found' },
        { status: 401 }
      );
    }

    // Try the shared server session path first so refresh uses the same
    // session cache as every other API route instead of verifying Privy twice.
    if (currentToken) {
      const session = await getServerSession()
      if (session.userId) {
        AuthAudit.refreshSuccess(session.userId, ip);

        const response = NextResponse.json({ success: true });
        const csrfToken = await getCSRFToken();
        setCSRFToken(response, csrfToken);
        return response;
      }
    }

    // If we have a refresh token, use Privy's refresh mechanism
    if (refreshToken) {
      // Note: Privy handles token refresh client-side
      // This endpoint validates that refresh is possible
      const response = NextResponse.json({ 
        success: true,
        message: 'Refresh token available, client should handle refresh'
      });
      const csrfToken = await getCSRFToken();
      setCSRFToken(response, csrfToken);
      return response;
    }

    // No valid tokens
    AuthAudit.refreshFailure(ip, 'No valid tokens');
    return NextResponse.json(
      { error: 'No valid tokens for refresh' },
      { status: 401 }
    );

  } catch (error) {
    console.error('[auth/refresh] 500 error:', error);
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/auth/refresh/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    AuthAudit.refreshFailure(ip, String(error));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
