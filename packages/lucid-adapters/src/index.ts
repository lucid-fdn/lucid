/**
 * @lucid/adapters — Thin adapter layer bridging OpenClaw to LucidMerged SaaS
 *
 * This package provides:
 * - Supabase storage adapters (replacing OpenClaw's SQLite)
 * - Multi-tenant context (org/project/env scoping)
 * - Billing hooks (token usage tracking)
 * - Sentry monitoring hooks
 *
 * OpenClaw's built-in OpenAI-compatible LLM client points at TrustGate —
 * no custom LLM provider needed.
 */

export { SupabaseSessionStore } from './storage/supabase-session-store'
export { SupabaseMessageStore } from './storage/supabase-message-store'
export { SupabaseConfigStore } from './storage/supabase-config-store'
export { MultiTenantContext } from './auth/multi-tenant-context'
export { UsageTracker } from './billing/usage-tracker'
export { SentryHook } from './monitoring/sentry-hook'
export { createLucidRuntime } from './runtime'
export {
  createEncryptionService,
  NullEncryptionService,
  HKDFEncryptionService,
} from './crypto/encryption-service'

export type { LucidRuntimeConfig, TenantContext, MessageRow } from './types'
export type { LucidRuntime } from './runtime'
export type { ConversationRow } from './storage/supabase-session-store'
export type { AssistantConfig } from './storage/supabase-config-store'
export type { UsageEvent } from './billing/usage-tracker'
export type {
  EncryptionService,
  EncryptionMode,
  EncryptedPayload,
} from './crypto/encryption-service'
