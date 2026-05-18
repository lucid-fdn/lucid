/**
 * Shared types for the Lucid adapter layer
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Multi-tenant context — every operation is scoped to org/project/env */
export interface TenantContext {
  orgId: string
  projectId: string
  envId: string
  userId?: string
}

/** Configuration for creating a Lucid runtime */
export interface LucidRuntimeConfig {
  /** Supabase client (service-role for worker) */
  supabase: SupabaseClient

  /** TrustGate API base URL (OpenAI-compatible endpoint) */
  lucidApiUrl: string

  /** TrustGate API key (lk_... tenant key) */
  lucidApiKey: string

  /** Optional: Sentry DSN for error tracking */
  sentryDsn?: string

  /** Optional: default tenant context (can be overridden per-request) */
  defaultTenant?: TenantContext

  /** Feature flags */
  features?: {
    /** Enable OpenClaw Pi agent (think-act-observe loop) */
    piAgent?: boolean
    /** Enable OpenClaw commands (/status, /reset, etc.) */
    commands?: boolean
    /** Enable context compaction */
    compaction?: boolean
  }
}

/** Message data stored in Supabase (assistant_messages table) */
export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: Record<string, unknown>
  token_count?: number
  created_at: string
}
