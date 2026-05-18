/**
 * Runtime Tool Types -- context for agent primitives (scheduler, messaging, subagent).
 *
 * These tools are tightly coupled to the worker runtime (DB tables, event loops).
 * They do NOT need wallet/signing context -- that's platform-tools territory.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Context passed to runtime tool functions at execution time.
 * Minimal -- no wallet/signing/x402 concerns.
 */
export interface RuntimeToolContext {
  supabase: SupabaseClient
  userId: string
  assistantId: string
  runId?: string
  toolCallId?: string
}
