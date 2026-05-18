export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PrivyClient } from "@privy-io/server-auth";
import { createClient } from "@supabase/supabase-js";
import { generateUniqueHandle } from "@/lib/auth/handle";
import { getCSRFToken, setCSRFToken } from "@/lib/auth/csrf";
import { cacheServerSessionForToken } from "@/lib/auth/session";
import { ErrorService } from "@/lib/errors/error-service";

export const dynamic = 'force-dynamic'

let privyClient: PrivyClient | null = null;
let supabase: ReturnType<typeof createClient> | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("Privy credentials not configured");
    }
    privyClient = new PrivyClient(appId, appSecret);
  }
  return privyClient;
}

function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase credentials not configured");
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = await req.json();

    // Prefer the Authorization header (sent explicitly by the client SDK via
    // getAccessToken()), then fall back to the privy-token cookie. The cookie
    // can rotate or be evicted while the SDK still has a valid session, so the
    // header path is the resilient one.
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const headerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get("privy-token")?.value;
    const token = headerToken || cookieToken;

    if (!token) {
      return NextResponse.json(
        { error: "No authentication token found" },
        { status: 401 }
      );
    }

    // Verify the Privy token server-side
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);
    const privyUserId = claims.userId;

    // Check if user already exists in our DB
    const supa = getSupabaseClient();
    const { data: link } = await supa
      .from("identity_links")
      .select("user_id")
      .eq("provider", "privy")
      .eq("external_id", privyUserId)
      .single();

    let isNewUser = false;
    let internalUserId: string | null = null;

    if (link && (link as Record<string, unknown>).user_id) {
      // Existing user — update last login
      const userId = (link as Record<string, unknown>).user_id as string;
      internalUserId = userId;
      await (supa.from("profiles") as any)
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", userId);
    } else {
      // New user — create via atomic function
      isNewUser = true;
      const privyUser = await privy.getUser(privyUserId);
      const handle = await generateUniqueHandle(privyUser);

      let avatarUrl: string | undefined;
      try {
        avatarUrl =
          (privyUser.discord as Record<string, unknown> | undefined)
            ?.profilePictureUrl as string | undefined ||
          (privyUser.twitter as Record<string, unknown> | undefined)
            ?.profilePictureUrl as string | undefined;
      } catch {
        // Ignore avatar extraction errors
      }

      let displayName: string | undefined;
      try {
        displayName = (
          privyUser.google as Record<string, unknown> | undefined
        )?.name as string | undefined;
        if (!displayName && privyUser.email?.address) {
          displayName = privyUser.email.address.split("@")[0];
        }
      } catch {
        displayName = undefined;
      }

      // @ts-expect-error - RPC function created via migration, not in TypeScript types
      const result = await supa.rpc("create_user_atomic", {
        p_privy_id: privyUserId,
        p_handle: handle,
        p_email: privyUser.email?.address || null,
        p_avatar_url: avatarUrl || null,
        p_display_name: displayName || null,
      }) as { data: string | null; error: unknown };

      if (result.error || !result.data) {
        ErrorService.captureException(
          result.error || new Error("Atomic function returned no user_id"),
          {
            severity: "error",
            context: { privyUserId, handle, walletAddress },
            tags: { layer: "auth", route: "privy-login" },
          }
        );
        return NextResponse.json(
          { error: "Failed to create user account" },
          { status: 500 }
        );
      }
      internalUserId = result.data;
    }

    if (internalUserId) {
      await cacheServerSessionForToken(token, { userId: internalUserId });
      if (cookieToken && cookieToken !== token) {
        await cacheServerSessionForToken(cookieToken, { userId: internalUserId });
      }
    }

    const response = NextResponse.json({
      success: true,
      isNewUser,
    });

    const isDev = process.env.NODE_ENV === 'development';
    response.cookies.set('lucid-auth-token', token, {
      httpOnly: true,
      secure: !isDev,
      sameSite: isDev ? 'lax' : 'none',
      path: '/',
      maxAge: 3600,
      ...(isDev ? {} : { domain: '.lucid.foundation' }),
    });

    // Set CSRF cookie so subsequent refresh calls work
    const csrfToken = await getCSRFToken();
    setCSRFToken(response, csrfToken);

    return response;
  } catch (err) {
    ErrorService.captureException(err, {
      severity: "error",
      context: { endpoint: "/auth/privy-login/route.ts", method: "POST" },
      tags: { layer: "api", route: "privy-login" },
    });
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
