/**
 * Supabase Server Client for API Routes
 * Creates authenticated Supabase client for server-side operations
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Create Supabase client for API routes (with user context)
 * Use this in API routes that need user authentication
 */
export async function createClient() {
  const cookieStore = await cookies();
  
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          // Pass through cookies for auth
          cookie: cookieStore.toString(),
        },
      },
    }
  );
}

/**
 * Get service role client (bypasses RLS - use carefully)
 * Use this only for system operations that need to bypass RLS
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
