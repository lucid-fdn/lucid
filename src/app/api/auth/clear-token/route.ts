import { NextResponse } from "next/server";
import { authCache } from "@/lib/cache/service";
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Create response
    const response = NextResponse.json({ success: true });

    const isDev = process.env.NODE_ENV === 'development';

    const cookieOptions: { httpOnly: boolean; secure: boolean; sameSite: 'lax' | 'none'; path: string; maxAge: number; domain?: string } = {
      httpOnly: true,
      secure: !isDev,
      sameSite: isDev ? "lax" : "none",
      path: "/",
      maxAge: 0, // This makes the cookie expire immediately
    };

    // Only set domain in production (must match privy-login)
    if (!isDev) {
      cookieOptions.domain = ".lucid.foundation";
    }

    const cookieNames = [
      'access_token',
      'privy-token',
      'privy-id-token',
      'privy-refresh-token',
      'lucid-auth-token',
      'sb-access-token',
      'sb-auth-token',
    ]

    for (const cookieName of cookieNames) {
      response.cookies.set(cookieName, '', cookieOptions)
    }

    // Clear any cached data
    await authCache.clear();

    return response;
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/auth/clear-token/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: "Failed to clear token" },
      { status: 500 }
    );
  }
} 
