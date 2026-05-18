/**
 * Worker Configuration — Lucid Worker Service
 *
 * Environment variables and configuration for the worker service.
 */

import { z } from 'zod'

// Treat empty strings as undefined (Docker compose passes "" for unset optional vars)
const optionalUrl = z.string().url().optional().or(z.literal('').transform(() => undefined))
const optionalStr = z.string().min(1).optional().or(z.literal('').transform(() => undefined))
const envBoolean = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value == null || value === '') return defaultValue
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value !== 0

      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true
      if (['false', '0', 'no', 'off'].includes(normalized)) return false

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected boolean-like value (true/false, 1/0, yes/no, on/off)',
      })
      return z.NEVER
    })

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  
  // Lucid-L2 AI Gateway
  LUCID_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  LUCID_API_KEY: z.string().optional(),
  TRUSTGATE_BASE_URL: optionalUrl,
  TRUSTGATE_API_KEY: optionalStr,
  AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED: envBoolean(false),
  AI_TEXT_DIRECT_OPENAI_FALLBACK_ENABLED: envBoolean(false),
  AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED: envBoolean(false),
  LUCID_INTERNAL_HOST_SUFFIXES: z.string().default('.lucid.internal,.railway.internal,.run.app'),
  
  // Worker identification
  WORKER_ID: z.string().default(
    process.env.K_REVISION
      ? `${process.env.K_REVISION}-${process.pid}`
      : `worker-${process.pid}`
  ),
  
  // Polling intervals (ms) — used by relay path + Pulse circuit breaker fallback
  INBOUND_POLL_INTERVAL: z.coerce.number().int().min(250).default(1000),
  OUTBOUND_POLL_INTERVAL: z.coerce.number().int().min(1000).default(3000),
  RELAY_CLAIM_WAIT_MS: z.coerce.number().int().min(0).max(30000).default(10000),
  CLEANUP_INTERVAL: z.coerce.number().int().min(60000).default(300000), // 5 minutes
  SCHEDULED_TASK_POLL_INTERVAL: z.coerce.number().int().min(10000).default(30000), // 30s
  
  // Concurrency limits
  MAX_CONCURRENT_INBOUND: z.coerce.number().int().min(1).max(50).default(5),
  MAX_CONCURRENT_OUTBOUND: z.coerce.number().int().min(1).max(50).default(10),
  
  // Batch sizes
  INBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  OUTBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  
  // Heartbeat interval (ms)
  HEARTBEAT_INTERVAL: z.coerce.number().int().min(10000).default(30000), // 30s
  INTERACTIVE_LATENCY_WARN_MS: z.coerce.number().int().min(1000).default(30000),
  INTERACTIVE_LATENCY_ALERT_MS: z.coerce.number().int().min(1000).default(60000),
  INTERACTIVE_BACKLOG_WARN_DEPTH: z.coerce.number().int().min(1).default(5),
  
  // Server port (for health checks and webhook trigger)
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  
  // Webhook trigger secret (for /trigger endpoint)
  WORKER_TRIGGER_SECRET: z.string().optional(),
  WORKER_CONTROL_PLANE_URL: optionalUrl,
  AI_AVATAR_JOB_WORKER_ENABLED: envBoolean(true),
  AI_AVATAR_JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  AI_AVATAR_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  AI_AVATAR_JOB_STALE_AFTER_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  AI_AVATAR_JOB_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(10 * 60 * 1000),
  
  // Encryption key for decrypting channel secrets
  ENCRYPTION_KEY: z.string().length(64).optional(), // 32 bytes as hex
  
  // Telegram hosted bot token (for channels without their own bot token)
  TELEGRAM_HOSTED_BOT_TOKEN: z.string().optional(),
  DISCORD_HOSTED_BOT_TOKEN: z.string().optional(),
  
  // Agent runtime — gates the full agent loop (OpenClaw / future runtimes)
  FEATURE_AGENT_RUNTIME: envBoolean(false),
  FEATURE_RUNTIME_V2: envBoolean(false),

  // L2 Receipt Pipeline (Receipt → Epoch → Chain Anchor)
  FEATURE_RECEIPTS: envBoolean(true),
  RECEIPT_SIGNER_KEY: z.string().optional(), // Ed25519 private key (hex) for signing receipts
  LUCID_PLATFORM_WALLET: z.string().optional(), // Platform wallet address (compute passport owner)

  // Agent Performance Optimization
  FEATURE_CONVERSATION_SUMMARY: envBoolean(false),
  LUCID_KNOWLEDGE_SEMANTIC_RECALL_ENABLED: envBoolean(false),
  LUCID_KNOWLEDGE_PROMPT_PACKETS_ENABLED: envBoolean(false),
  LUCID_KNOWLEDGE_DURABLE_EXTRACTION_ENABLED: envBoolean(false),
  LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED: envBoolean(false),
  LUCID_KNOWLEDGE_SOURCE_REFRESH_ENABLED: envBoolean(false),
  LUCID_DAILY_INTEL_ENABLED: envBoolean(false),
  LUCID_KNOWLEDGE_L2_API_URL: optionalUrl,
  LUCID_KNOWLEDGE_L2_API_TOKEN: optionalStr,
  LUCID_KNOWLEDGE_BRAIN_OPS_ENABLED: envBoolean(false),
  MEMORY_EXTRACTION_JOB_BATCH_SIZE: z.coerce.number().int().min(1).max(25).default(5),
  MEMORY_EXTRACTION_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  MEMORY_EXTRACTION_JOB_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  KNOWLEDGE_L2_PROJECTION_INTERVAL_MS: z.coerce.number().int().min(5000).default(60000),
  KNOWLEDGE_L2_PROJECTION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  KNOWLEDGE_L2_PROJECTION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  KNOWLEDGE_BRAIN_OPS_INTERVAL_MS: z.coerce.number().int().min(60000).default(6 * 60 * 60 * 1000),
  KNOWLEDGE_BRAIN_OPS_ORG_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  KNOWLEDGE_BRAIN_OPS_SCAN_LIMIT: z.coerce.number().int().min(10).max(1000).default(250),
  KNOWLEDGE_EMBEDDING_EXPECTED_DIMENSIONS: z.coerce.number().int().min(1).default(1536),
  KNOWLEDGE_EMBEDDING_PROVIDER_ID: z.string().min(1).default('lucid:text-embedding-3-small'),
  KNOWLEDGE_SOURCE_REFRESH_INTERVAL_MS: z.coerce.number().int().min(60000).default(5 * 60 * 1000),
  DAILY_INTEL_INTERVAL_MS: z.coerce.number().int().min(60 * 60 * 1000).default(24 * 60 * 60 * 1000),
  DAILY_INTEL_WORKSPACE_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(25),
  KNOWLEDGE_SOURCE_REFRESH_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  KNOWLEDGE_SOURCE_REFRESH_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  KNOWLEDGE_SOURCE_REFRESH_DEFAULT_INTERVAL_SECONDS: z.coerce.number().int().min(300).default(24 * 60 * 60),
  FEATURE_TOOL_CACHE: envBoolean(true),
  FAST_MODEL: z.string().default('openai/gpt-4.1-mini'),
  STRONG_MODEL: z.string().default('openai/gpt-4.1'),
  OPENCLAW_NATIVE_DENY_EXTRA: z.string().optional(),
  DEDUP_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  DEFAULT_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(20),
  DEFAULT_MAX_LLM_CALLS: z.coerce.number().int().min(1).default(15),
  DEFAULT_MAX_TOOL_CALLS: z.coerce.number().int().min(0).default(10),
  DEFAULT_MAX_WALL_TIME_MS: z.coerce.number().int().min(5000).default(60000),
  
  // Phase 2: Agent compaction tuning
  AGENT_COMPACTION_THRESHOLD: z.coerce.number().int().min(10).default(50),
  AGENT_KEEP_RECENT: z.coerce.number().int().min(5).default(20),
  
  // Phase 2: Provider failover chain (P1 #11)
  FALLBACK_PROVIDER_URL: optionalUrl,  // OpenAI-compatible endpoint
  FALLBACK_PROVIDER_KEY: optionalStr,  // API key for fallback
  FALLBACK_PROVIDER_MODEL: optionalStr, // Model override for fallback
  LLM_CALL_TIMEOUT_MS: z.coerce.number().int().min(5000).default(30000), // Per-call timeout
  LLM_RETRY_COUNT: z.coerce.number().int().min(0).max(3).default(1),     // Retries on primary before fallback
  
  // Phase 1B: Encryption
  MESSAGE_ENCRYPTION_MASTER_KEY: z.string().optional(),
  PII_REDACT_LOGS: envBoolean(true),
  
  // Nango OAuth Tool Execution
  NANGO_SECRET_KEY: z.string().optional(),
  NANGO_HOST: z.string().url().default('https://api.nango.dev'),
  NANGO_ACTIONS_DIR: z.string().default('./nango-actions/'),

  // PolyClaw Phase 4: Persistent Position Tracking
  FEATURE_POLYMARKET_POSITIONS: envBoolean(false),
  POLYGON_RPC_URL: optionalUrl,

  // PolyClaw Phase 5A: Protective Alerts + Approval-Based Exits
  FEATURE_POLYMARKET_AUTOMATION: envBoolean(false),

  // Consciousness Stream: introspection events for live agent visualization
  FEATURE_INTROSPECTION_STREAM: envBoolean(false),

  // Redis Streams Ingest: buffer runtime telemetry through Redis before Postgres
  FEATURE_REDIS_INGEST: envBoolean(false),

  // Pulse: distributed agent orchestration engine (replaces polling loops)
  FEATURE_PULSE: envBoolean(false),
  PULSE_LEASE_TTL_SECONDS: z.coerce.number().int().min(10).default(60),
  PULSE_CLAIM_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  PULSE_MAX_CONCURRENT_PER_AGENT: z.coerce.number().int().min(1).max(20).default(3),
  PULSE_BLOCK_TIMEOUT_MS: z.coerce.number().int().min(100).default(2000),
  PULSE_WEBHOOK_SECRET: optionalStr,

  // Phase 5N: Confidence Router — deterministic lookup-table routing with fast/strong/external upgrade loop
  FEATURE_CONFIDENCE_ROUTER: envBoolean(false),

  // Human + PM Integration Phase 1: Pulse-standalone human work items (tickets, approvals, reviews)
  FEATURE_HUMAN_WORK_ITEMS: envBoolean(false),

  // External PM sync: mirror human work items to Linear / Asana / Trello / Monday
  FEATURE_PM_SYNC: envBoolean(false),
  FEATURE_PM_SYNC_RECONCILE: envBoolean(true),

  // Linear Agents API: two-way agent collaboration surface via Linear's Agents API
  FEATURE_LINEAR_AGENT: envBoolean(false),

  // Dedicated Runtime (set when running as a dedicated runtime, not SaaS worker)
  LUCID_ENGINE: z.enum(['openclaw', 'hermes']).default('openclaw'),
  LUCID_DEDICATED_TRANSPORT_MODE: z.enum(['relay', 'native_pulse']).default('relay'),
  LUCID_RUNTIME_ID: z.string().uuid().optional(),
  LUCID_RUNTIME_KEY: z.string().optional(),
  LUCID_CONTROL_PLANE_URL: optionalUrl,
  LUCID_RUNTIME_GENERATION: z.coerce.number().int().min(1).default(1),


  // Channel Architecture: REST message relay (dedicated runtimes drop Supabase credentials)
  FEATURE_REST_MESSAGE_RELAY: envBoolean(false),

  // Channel Architecture: Native runtime-owned channels on dedicated runtimes (C2a self-sovereign)
  FEATURE_NATIVE_CHANNELS: envBoolean(false),
  LUCID_CHANNEL_CONFIG: z.string().optional(), // JSON config for engine-agnostic runtime-native channel adapters
  OPENCLAW_CHANNEL_CONFIG: z.string().optional(), // legacy alias for native channel adapter config

  // Phase 4N-c: StepRunPacket protocol — dedicated runtimes claim DAG-internal steps
  STEP_PROTOCOL_ENABLED: envBoolean(false),

  // Agent Ops Browser Operator: optional engine-neutral browser-control endpoint.
  // When unset, Browser Operator steps fall back to normal agent execution with
  // browser-specific instructions instead of failing the workflow.
  BROWSER_QA_PROVIDER: optionalStr,
  BROWSER_QA_CONTROL_URL: optionalUrl,
  BROWSER_QA_CONTROL_TOKEN: optionalStr,
  BROWSER_QA_CONTROL_PASSWORD: optionalStr,
  BROWSER_QA_PROFILE: optionalStr,
  BROWSER_QA_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  BROWSER_QA_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  BROWSER_QA_MAX_CONCURRENCY_PER_ORG: z.coerce.number().int().min(0).max(100).default(2),
  BROWSER_QA_LEASE_WAIT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  BROWSER_QA_MEMORY_PRESSURE_LIMIT_MB: z.coerce.number().int().min(0).default(0),
  BROWSER_QA_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  BROWSER_QA_MAX_SESSIONS_PER_RUN: z.coerce.number().int().min(0).default(50),
  BROWSER_QA_MAX_SCREENSHOTS_PER_RUN: z.coerce.number().int().min(0).default(200),
  BROWSER_QA_GATEWAY_TOKEN: optionalStr,
  BROWSER_QA_HEADLESS: envBoolean(true),
  BROWSER_QA_ALLOW_PRIVATE_NETWORK: envBoolean(false),
  BROWSER_QA_MAX_SCREENSHOT_BYTES: z.coerce.number().int().min(1024).default(5 * 1024 * 1024),
  BROWSER_QA_ARTIFACT_STORE: z.enum(['local', 'supabase']).default('local'),
  BROWSER_QA_ARTIFACT_BUCKET: z.string().min(1).default('agent-ops-browser-qa'),
  BROWSER_QA_ARTIFACT_DIR: z.string().min(1).default('/tmp/lucid-browser-qa-artifacts'),
  BROWSER_QA_ARTIFACT_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  BROWSER_QA_PUBLIC_BASE_URL: optionalUrl,
  BROWSER_QA_GATEWAY_PROVIDER: z.enum(['playwright', 'browserless', 'browserbase', 'steel', 'remote-cdp']).optional(),
  BROWSER_OPERATOR_DEFAULT_PROVIDER: z.enum(['playwright', 'browserless', 'browserbase', 'steel', 'remote-cdp']).default('playwright'),
  BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED: envBoolean(false),
  BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED: envBoolean(false),
  BROWSER_OPERATOR_PREMIUM_FALLBACK_ENABLED: envBoolean(false),
  BROWSER_QA_ACTION_LAYER: z.enum(['none', 'stagehand', 'browser-use']).default('none'),
  STEEL_BROWSER_URL: optionalUrl,
  STEEL_API_KEY: optionalStr,
  STEEL_CDP_WS_URL: optionalUrl,
  BROWSERBASE_WS_URL: optionalUrl,
  BROWSERBASE_API_KEY: optionalStr,
  BROWSERLESS_WS_URL: optionalUrl,
  BROWSERLESS_TOKEN: optionalStr,
  REMOTE_CDP_WS_URL: optionalUrl,
  REMOTE_CDP_TOKEN: optionalStr,
  STAGEHAND_CONTROL_URL: optionalUrl,
  STAGEHAND_API_KEY: optionalStr,
  BROWSER_USE_CONTROL_URL: optionalUrl,
  BROWSER_USE_API_KEY: optionalStr,
  BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED: envBoolean(false),
  BROWSER_OPERATOR_FEATURE_FLAGS: optionalStr,

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Worker process mode. `all` is intended for local/dev and simple preview
  // deployments; production should split channels, worker, automation, and
  // browser workloads so sockets, queues, maintenance, and Playwright do not
  // share a failure domain.
  WORKER_MODE: z.enum(['worker', 'channels', 'discord', 'slack', 'browser', 'all']).default('all'),
  WORKER_ROLE: z.enum(['interactive', 'interactive_gateway', 'automation', 'gateway', 'all']).default('all'),
})

export type Config = z.infer<typeof envSchema>

let config: Config | null = null

function parseConfig(): Config {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    throw new ConfigValidationError(result.error.issues)
  }

  return result.data
}

function enforceRuntimeModeDependencies(nextConfig: Config): void {
  if (nextConfig.FEATURE_REST_MESSAGE_RELAY) {
    const missing: string[] = []
    if (!nextConfig.LUCID_RUNTIME_ID) missing.push('LUCID_RUNTIME_ID')
    if (!nextConfig.LUCID_RUNTIME_KEY) missing.push('LUCID_RUNTIME_KEY')
    if (!nextConfig.LUCID_CONTROL_PLANE_URL) missing.push('LUCID_CONTROL_PLANE_URL')
    if (missing.length > 0) {
      throw new Error(
        `FEATURE_REST_MESSAGE_RELAY=true requires: ${missing.join(', ')}`,
      )
    }
  }

  if (nextConfig.LUCID_DEDICATED_TRANSPORT_MODE === 'native_pulse') {
    const missing: string[] = []
    if (!nextConfig.LUCID_RUNTIME_ID) missing.push('LUCID_RUNTIME_ID')
    if (!nextConfig.LUCID_RUNTIME_KEY) missing.push('LUCID_RUNTIME_KEY')
    if (!nextConfig.LUCID_CONTROL_PLANE_URL) missing.push('LUCID_CONTROL_PLANE_URL')
    if (!nextConfig.FEATURE_PULSE) missing.push('FEATURE_PULSE=true')
    if (missing.length > 0) {
      throw new Error(
        `LUCID_DEDICATED_TRANSPORT_MODE=native_pulse requires: ${missing.join(', ')}`,
      )
    }
  }
}

export class ConfigValidationError extends Error {
  constructor(issues: z.ZodIssue[]) {
    const details = issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    super(`Invalid environment configuration:\n${details}`)
    this.name = 'ConfigValidationError'
  }
}

export function getConfig(): Config {
  if (!config) {
    try {
      config = parseConfig()
      enforceRuntimeModeDependencies(config)
    } catch (err) {
      if (process.env.NODE_ENV === 'test' || process.env.VITEST) throw err
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  return config
}

export function refreshConfigFromEnv(): Config {
  const nextConfig = parseConfig()
  enforceRuntimeModeDependencies(nextConfig)

  if (config) {
    Object.assign(config, nextConfig)
    return config
  }

  config = nextConfig
  return config
}

// Validate on import (skipped in test — validated lazily on first getConfig() call)
if (!process.env.VITEST) {
  getConfig()
}
