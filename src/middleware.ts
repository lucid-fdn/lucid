import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getAuthToken,
  redirectToLogin,
  redirectToDashboard
} from "@/lib/auth/middleware-edge";
import { 
  isMaintenanceModeEnabled, 
  isValidBypassToken, 
  isPathAccessible 
} from "@/lib/maintenance-mode";

function getCanonicalAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (!raw && process.env.NODE_ENV === "production") return "https://www.lucid.foundation";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".up.railway.app")) {
      return process.env.NODE_ENV === "production" ? "https://www.lucid.foundation" : null;
    }
    return url.origin;
  } catch {
    return process.env.NODE_ENV === "production" ? "https://www.lucid.foundation" : null;
  }
}

function shouldRedirectRailwayUiHost(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const hostname = (req.headers.get("host") || req.nextUrl.hostname).split(":")[0].toLowerCase();
  if (!hostname.endsWith(".up.railway.app")) return false;
  const pathname = req.nextUrl.pathname;
  if (pathname === "/ready" || pathname.startsWith("/api/")) return false;
  return Boolean(getCanonicalAppOrigin());
}

// Industry-standard: Middleware stays lightweight (auth checks only)
// Business logic belongs in layouts/pages
export const config = { 
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, videos, etc)
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webm|mp4|json)$).*)",
  ]
};

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // === WILDCARD SUBDOMAIN → PUBLIC BLOG REWRITE ===
  const hostname = req.headers.get('host') || ''
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1')
  const allowDevAuthBypass =
    process.env.NODE_ENV !== 'production' &&
    process.env.DISABLE_AUTH_REDIRECTS_IN_DEV === 'true' &&
    isLocalhost
  const allowPreviewE2EAuthBypass = process.env.VERCEL_ENV === 'preview'
  const allowLocalProductionE2EAuthBypass =
    isLocalhost &&
    process.env.NODE_ENV === 'production' &&
    Boolean(process.env.E2E_AUTH_BYPASS_SECRET?.trim())
  const allowSignedE2EAuthBypass =
    ((process.env.NODE_ENV !== 'production' && isLocalhost) || allowPreviewE2EAuthBypass || allowLocalProductionE2EAuthBypass) &&
    Boolean(req.cookies.get('lucid-e2e-auth')?.value)
  const baseDomain = isLocalhost ? 'localhost:3000' : 'lucid.ai'
  const subdomain = hostname.replace(`.${baseDomain}`, '')

  if (subdomain && subdomain !== hostname && subdomain !== 'www' && subdomain !== 'app') {
    const blogPath = `/blog-public/${subdomain}${pathname}`
    return NextResponse.rewrite(new URL(blogPath, req.url))
  }

  // === SKIP API ROUTES ENTIRELY ===
  // API routes handle their own auth
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Health checks must stay unauthenticated so Railway can verify the web
  // control plane directly instead of following an auth redirect.
  if (pathname === '/ready') {
    return NextResponse.next();
  }

  // Privy restricts browser auth to configured app domains. Railway service
  // URLs are deployment plumbing, not a human login surface, so redirect UI
  // traffic to the canonical app host while keeping API/webhook/health routes
  // available on Railway.
  if (shouldRedirectRailwayUiHost(req)) {
    const canonical = new URL(req.nextUrl.pathname + req.nextUrl.search, getCanonicalAppOrigin()!);
    return NextResponse.redirect(canonical, 308);
  }

  // === SKIP PAYLOAD CMS ROUTES ===
  // Payload handles its own auth for admin panel and REST API
  if (pathname.startsWith('/content-admin') || pathname.startsWith('/content-api')) {
    return NextResponse.next();
  }
  
  // === MAINTENANCE MODE CHECK ===
  // This runs FIRST, before any auth checks
  if (isMaintenanceModeEnabled()) {
    // Check if path is always accessible (countdown, assets, etc.)
    if (isPathAccessible(pathname)) {
      return NextResponse.next();
    }
    
    // Check for bypass token in query params
    const bypassToken = req.nextUrl.searchParams.get('bypass');
    if (isValidBypassToken(bypassToken)) {
      // Valid bypass token - allow access
      // Set cookie to remember bypass for this session
      const response = NextResponse.next();
      response.cookies.set('maintenance_bypass', bypassToken || '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
      });
      return response;
    }
    
    // Check for bypass cookie
    const bypassCookie = req.cookies.get('maintenance_bypass')?.value || null;
    if (isValidBypassToken(bypassCookie)) {
      return NextResponse.next();
    }
    
    // No bypass - redirect to countdown
    if (pathname !== '/countdown') {
      return NextResponse.redirect(new URL('/countdown', req.url));
    }
  }
  
  // === REGULAR AUTH CHECKS ===
  
  // Allow countdown page to be publicly accessible (no auth required)
  if (pathname === "/countdown") {
    return NextResponse.next();
  }
  
  // Get authentication token
  const token = getAuthToken(req);
  const isAuthenticated = !!token || allowSignedE2EAuthBypass;
  
  // Login page - redirect authenticated users to dashboard
  if (pathname === "/login") {
    if (isAuthenticated) {
      return redirectToDashboard(req);
    }
    return NextResponse.next();
  }
  
  // Root path - redirect based on auth
  if (pathname === "/") {
    if (isAuthenticated) {
      return redirectToDashboard(req);
    }
    return NextResponse.next();
  }

  // Mission Control root is a pure IA redirect. Handle it at the edge so GET,
  // HEAD, and link-prefetch requests never render the app shell just to redirect.
  const missionControlRootMatch = pathname.match(/^\/([^/]+)\/mission-control\/?$/);
  if (missionControlRootMatch && isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = `/${missionControlRootMatch[1]}/mission-control/overview`;
    return NextResponse.redirect(url);
  }
  
  // Public marketing routes - allow without authentication
  const publicRoutes = [
    '/browse',
    '/explore',      // (app)/explore — auth handled inside the page
    '/explore-v2',   // (marketing)/explore-v2 — public marketing explore
    '/test',
    '/protocol',     // (marketing)/protocol — Lucid L2 / protocol page
    '/pricing',      // (marketing)/pricing — public pricing page
    '/templates',    // (marketing)/templates — public template marketplace
    '/blog',
    '/legal/terms-of-service',
    '/legal/privacy-policy',
    '/privacy',
    '/contact',
    '/company',
    '/sentry-example-page', // Sentry test page
    '/blog-public',
    '/discover',     // Launchpad — public marketplace
    '/leaderboard',  // Launchpad — public rankings
    '/agent',        // Launchpad — public agent detail pages
    '/oracle',       // Oracle — public agent intelligence
    '/styleguide',   // Internal design system reference (gated in prod by layout)
    '/telegram',     // Telegram Mini App and public bot surfaces
  ];
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  
  // Protected routes - require authentication
  if (!isAuthenticated && !allowDevAuthBypass) {
    return redirectToLogin(req);
  }
  
  return NextResponse.next();
}
