import { NextResponse } from 'next/server';
import { getCSRFToken, setCSRFToken } from '@/lib/auth/csrf';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/csrf
 * Returns a CSRF token for the current session
 */
export async function GET() {
  try {
    const token = await getCSRFToken();
    
    const response = NextResponse.json({ 
      token,
      headerName: 'x-csrf-token'
    });
    
    setCSRFToken(response, token);
    
    return response;
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/auth/csrf/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
