/**
 * Shared Supabase client for all database modules (Server-only)
 *
 * Uses lazy initialization to avoid crashes during Next.js static analysis
 * at build time (when env vars are not yet available).
 *
 * Uses native Node fetch (not Next.js's patched fetch) to avoid issues with
 * internal Docker network URLs and Next.js fetch caching/revalidation behavior.
 * Next.js patches globalThis.fetch with caching semantics that can cause
 * "fetch failed" errors for non-public URLs like http://api-gateway:8000.
 */

import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'
import { composeAbortSignal, readPositiveIntEnv } from '@/lib/http/fetch-timeout'

let _supabase: SupabaseClient | null = null

const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 10_000

function getSupabaseFetchTimeoutMs(): number {
  return readPositiveIntEnv('SUPABASE_FETCH_TIMEOUT_MS', DEFAULT_SUPABASE_FETCH_TIMEOUT_MS)
}

function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  return globalThis.fetch(input, {
    cache: 'no-store',
    ...init,
    signal: composeAbortSignal(init?.signal, getSupabaseFetchTimeoutMs()),
  })
}

export function isTransientSupabaseError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error)

  return /fetch failed|networkerror|timeout|aborted/i.test(message)
}

function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    // Use SUPABASE_URL (server-only, not NEXT_PUBLIC_) to avoid Next.js
    // inlining the URL at build time. NEXT_PUBLIC_* vars are replaced with
    // their build-time values in the bundle, which may be a placeholder.
    const url = process.env.SUPABASE_URL
      || process.env.NEXT_PUBLIC_SUPABASE_URL
      || 'https://placeholder.supabase.co'

    _supabase = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
      {
        global: {
          // Bypass Next.js fetch caching for internal Docker network URLs.
          // Also bound Supabase HTTP calls; dashboard polling must degrade
          // quickly instead of pinning API routes until the platform times out.
          fetch: supabaseFetch as typeof fetch,
        },
      }
    )
  }
  return _supabase
}

/**
 * Shared Supabase client singleton.
 * Uses a Proxy to lazily initialize on first property access,
 * preserving the `supabase.from(...)` call pattern.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export { ErrorService }
