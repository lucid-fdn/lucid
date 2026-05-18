/**
 * Lucid Runtime — bootstraps OpenClaw with our Supabase/multi-tenant adapters.
 * This is the main entry point used by the worker to create a configured runtime.
 *
 * The runtime provides storage adapters and billing hooks.
 * OpenClaw's runEmbeddedPiAgent handles the actual agent loop —
 * no custom LLM provider needed (TrustGate is OpenAI-compatible).
 */

import type { LucidRuntimeConfig } from './types'
import { SupabaseSessionStore } from './storage/supabase-session-store'
import { SupabaseMessageStore } from './storage/supabase-message-store'
import { SupabaseConfigStore } from './storage/supabase-config-store'
import { MultiTenantContext } from './auth/multi-tenant-context'
import { UsageTracker } from './billing/usage-tracker'
import { SentryHook } from './monitoring/sentry-hook'

export interface LucidRuntime {
  /** Storage adapters */
  sessionStore: SupabaseSessionStore
  messageStore: SupabaseMessageStore
  configStore: SupabaseConfigStore

  /** Multi-tenant context manager */
  tenant: MultiTenantContext

  /** Billing tracker */
  usage: UsageTracker

  /** Error monitoring */
  sentry: SentryHook

  /** TrustGate config (pass to OpenClaw's built-in OpenAI-compatible client) */
  llmConfig: {
    baseUrl: string
    apiKey: string
  }

  /** Feature flags */
  features: LucidRuntimeConfig['features']

  /** Initialize the runtime (call once at startup) */
  init(): Promise<void>
}

/**
 * Create a fully configured Lucid runtime.
 *
 * Usage in worker:
 * ```typescript
 * import { createLucidRuntime } from '@lucid/adapters'
 *
 * const runtime = createLucidRuntime({
 *   supabase,
 *   lucidApiUrl: config.LUCID_API_BASE_URL,
 *   lucidApiKey: config.TRUSTGATE_API_KEY,
 *   sentryDsn: config.SENTRY_DSN,
 * })
 *
 * await runtime.init()
 * ```
 */
export function createLucidRuntime(config: LucidRuntimeConfig): LucidRuntime {
  const sessionStore = new SupabaseSessionStore(config.supabase, config.defaultTenant)
  const messageStore = new SupabaseMessageStore(config.supabase)
  const configStore = new SupabaseConfigStore(config.supabase)
  const tenant = new MultiTenantContext(config.supabase)
  const usage = new UsageTracker(config.supabase)
  const sentry = new SentryHook({ dsn: config.sentryDsn })

  return {
    sessionStore,
    messageStore,
    configStore,
    tenant,
    usage,
    sentry,
    llmConfig: {
      baseUrl: config.lucidApiUrl,
      apiKey: config.lucidApiKey,
    },
    features: config.features,

    async init() {
      await sentry.init()
      console.log('[LucidRuntime] Initialized with Supabase storage + TrustGate LLM config')
    },
  }
}
