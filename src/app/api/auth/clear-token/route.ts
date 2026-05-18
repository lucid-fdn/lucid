import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authCache } from "@/lib/cache/service";
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

function getAuthCookieDomain(hostname: string): string | undefined {
  const normalized = hostname.toLowerCase();
  if (normalized === "lucid.foundation" || normalized.endsWith(".lucid.foundation")) {
    return ".lucid.foundation";
  }
  return undefined;
}

export async function POST(req: NextRequest) {
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

    // Only use the shared cookie domain on Lucid-owned domains. Preview and
    // Railway hosts need host-only cookies, otherwise browsers reject logout
    // and login cookies because the domain does not match the request host.
    const cookieDomain = isDev ? undefined : getAuthCookieDomain(req.nextUrl.hostname);
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
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
