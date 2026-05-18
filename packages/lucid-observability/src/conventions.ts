/**
 * @lucid/observability — Global Conventions
 *
 * Single source of truth for service names, span names, attribute keys,
 * and environment naming across ALL Lucid services.
 *
 * Every repo imports these constants instead of hardcoding strings.
 * This prevents drift and ensures OTel data is queryable/joinable.
 */

/* ─── Canonical Service Names ─────────────────────────── */

/**
 * Stable, canonical service names for `service.name` resource attribute.
 * These MUST match across OTel, Sentry, and log fields.
 *
 * Adding a new service? Add it here first, then reference it.
 */
export const SERVICE_NAMES = {
  /** Next.js frontend + API routes (Vercel) */
  LUCID_WEB: 'lucid-web',
  /** Event processor for AI assistants (Railway) */
  LUCID_WORKER: 'lucid-worker',
  /** Unified LLM gateway / model router */
  LUCID_L2: 'lucid-l2',
  /** Platform core / shared backend services */
  LUCID_CORE: 'lucid-core',
  /** TrustGate - LLM gateway with metering (lucid-plateform-core) */
  TRUSTGATE: 'lucid-trustgate',
  /** MCPGate - MCP tool gateway (lucid-plateform-core) */
  MCPGATE: 'lucid-mcpgate',
  /** Control Plane - multi-tenant governance (lucid-plateform-core) */
  CONTROL_PLANE: 'lucid-control-plane',
} as const

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES]

/* ─── Environment Names ───────────────────────────────── */

/**
 * Canonical environment names. Shared across OTel, Sentry, and log fields.
 * Must match `deployment.environment.name` in OTel and Sentry `environment`.
 *
 * ⚠️  IMPORTANT: Use LUCID_ENV, NOT NODE_ENV.
 * NODE_ENV is often "production" even in preview/staging environments.
 * Set LUCID_ENV explicitly in every deployment target.
 *
 * Env var: LUCID_ENV=production|staging|development|test
 */
export const ENVIRONMENTS = {
  PRODUCTION: 'production',
  STAGING: 'staging',
  DEVELOPMENT: 'development',
  TEST: 'test',
} as const

export type Environment = (typeof ENVIRONMENTS)[keyof typeof ENVIRONMENTS]

/**
 * Read the canonical environment. Falls back to NODE_ENV if LUCID_ENV is unset.
 * All services MUST call this instead of reading NODE_ENV directly.
 */
export function getLucidEnv(): Environment {
  const env = process.env.LUCID_ENV || process.env.NODE_ENV || 'development'
  // Normalize common aliases
  if (env === 'prod') return ENVIRONMENTS.PRODUCTION
  if (env === 'dev') return ENVIRONMENTS.DEVELOPMENT
  if (env === 'stage' || env === 'preview') return ENVIRONMENTS.STAGING
  return env as Environment
}

/* ─── Standard OTel Resource Attributes ───────────────── */

/**
 * Resource attribute keys that every service MUST set on SDK init.
 * These improve filtering/grouping in Tempo, Honeycomb, Jaeger, etc.
 */
export const RESOURCE_ATTRS = {
  /** OTel standard: service.name (e.g., 'lucid-worker') */
  SERVICE_NAME: 'service.name',
  /** OTel standard: service.version — use SENTRY_RELEASE or git SHA */
  SERVICE_VERSION: 'service.version',
  /** OTel standard: deployment.environment.name — use getLucidEnv() */
  DEPLOYMENT_ENVIRONMENT: 'deployment.environment.name',
  /** OTel standard: service.namespace — always 'lucid' for our platform */
  SERVICE_NAMESPACE: 'service.namespace',
} as const

/** Fixed namespace for all Lucid services */
export const SERVICE_NAMESPACE = 'lucid'

/* ─── Required Span Names ─────────────────────────────── */

/**
 * The 5 baseline spans defined in OPENCLAW_AUDIT_PLAN_V3.md §P2 #18.
 * All Lucid services producing these spans MUST use these exact names
 * so dashboards/alerts can query them consistently.
 *
 * Naming convention: `<domain>.<operation>`
 */
export const SPAN_NAMES = {
  /** Full inbound message pipeline: dedup → lock → rate limit → LLM → encrypt → store */
  INBOUND_PIPELINE: 'inbound.pipeline',
  /** Single LLM provider invocation (child of inbound.pipeline) */
  LLM_CALL: 'llm.call',
  /** Single tool execution (child of inbound.pipeline) */
  TOOL_EXECUTE: 'tool.execute',
  /** Message encryption (child of inbound.pipeline) */
  ENCRYPT_MESSAGE: 'encrypt.message',
  /** Memory extraction pipeline (child of inbound.pipeline) */
  MEMORY_EXTRACT: 'memory.extract',

  /* ── TrustGate spans ── */
  /** TrustGate chat completion request */
  CHAT_COMPLETION: 'trustgate.chat_completion',
  /** TrustGate embedding request */
  EMBEDDING: 'trustgate.embedding',
  /** TrustGate LLM proxy call to LiteLLM */
  LLM_PROXY: 'trustgate.llm_proxy',

  /* ── MCPGate spans ── */
  /** MCPGate tool discovery */
  TOOL_DISCOVER: 'mcpgate.tool_discover',
  /** MCPGate tool execution */
  MCP_TOOL_EXECUTE: 'mcpgate.tool_execute',
  /** MCPGate server health check */
  MCP_SERVER_HEALTH: 'mcpgate.server_health',

  /* ── Shared gateway spans ── */
  /** API key / auth verification */
  AUTH_VERIFY: 'auth.verify',
  /** Quota enforcement check */
  QUOTA_CHECK: 'quota.check',
  /** Policy enforcement check */
  POLICY_CHECK: 'policy.check',
  /** Metering event insertion */
  METERING_INSERT: 'metering.insert',

  /* ── Additional spans (added as services grow) ── */
  /** Outbound message delivery */
  OUTBOUND_DELIVER: 'outbound.deliver',
  /** HTTP request to Lucid-L2 gateway */
  L2_PROXY_CALL: 'l2.proxy.call',
  /** Database query (Supabase) */
  DB_QUERY: 'db.query',
  /** Rate limiter check */
  RATE_LIMIT_CHECK: 'rate_limit.check',
  /** Deduplication check */
  DEDUP_CHECK: 'dedup.check',
} as const

export type SpanName = (typeof SPAN_NAMES)[keyof typeof SPAN_NAMES]

/* ─── Attribute Keys (Allowlisted) ────────────────────── */

/**
 * Every span attribute key used across Lucid services.
 * The allowlist enforcer (`isAllowedAttribute`) checks against this set.
 *
 * Rules:
 *  - Identity keys MUST be hashed (use hashForTelemetry())
 *  - UUIDs (message_id, run_id, conversation_id) are OK raw in traces/logs (not PII)
 *  - ⚠️  UUIDs are HIGH CARDINALITY — NEVER use them as metric labels/dimensions.
 *    They are safe for traces and logs only.
 *  - Content (plaintext, ciphertext, prompts, tool args) is NEVER an attribute
 */
export const ATTR_KEYS = {
  // ── Identity (ALWAYS hashed via hashForTelemetry) ──
  TENANT_KEY_HASH: 'lucid.tenant_key_hash',
  SESSION_KEY_HASH: 'lucid.session_key_hash',
  USER_KEY_HASH: 'lucid.user_key_hash',

  // ── Identifiers (UUIDs — not PII) ──
  RUN_ID: 'lucid.run_id',
  CONVERSATION_ID: 'lucid.conversation_id',
  MESSAGE_ID: 'lucid.message_id',

  // ── Channel / routing ──
  CHANNEL_TYPE: 'lucid.channel_type',

  // ── LLM ──
  LLM_PROVIDER: 'lucid.llm.provider',
  LLM_MODEL: 'lucid.llm.model',
  LLM_ATTEMPT: 'lucid.llm.attempt',
  LLM_STATUS_CODE: 'lucid.llm.status_code',
  LLM_DURATION_MS: 'lucid.llm.duration_ms',
  LLM_ERROR_TYPE: 'lucid.llm.error_type',

  // ── Tool ──
  TOOL_NAME: 'lucid.tool.name',
  TOOL_CATEGORY: 'lucid.tool.category',
  TOOL_ALLOWED: 'lucid.tool.allowed',
  TOOL_DURATION_MS: 'lucid.tool.duration_ms',
  TOOL_ERROR_TYPE: 'lucid.tool.error_type',

  // ── Encryption ──
  ENCRYPT_MODE: 'lucid.encrypt.mode',
  ENCRYPT_PAYLOAD_BYTES: 'lucid.encrypt.payload_bytes',
  ENCRYPT_ALGO: 'lucid.encrypt.algo',
  ENCRYPT_KEY_VERSION: 'lucid.encrypt.key_version',
  ENCRYPT_DURATION_MS: 'lucid.encrypt.duration_ms',

  // ── Memory ──
  MEMORY_EXTRACTED_COUNT: 'lucid.memory.extracted_count',
  MEMORY_STORED_COUNT: 'lucid.memory.stored_count',
  MEMORY_EMBED_CALLS: 'lucid.memory.embed_calls',
  MEMORY_DURATION_MS: 'lucid.memory.duration_ms',
  MEMORY_ERROR_TYPE: 'lucid.memory.error_type',

  // ── TrustGate / MCPGate ──
  TENANT_ID: 'lucid.tenant_id',
  LLM_PROMPT_TOKENS: 'lucid.llm.prompt_tokens',
  LLM_COMPLETION_TOKENS: 'lucid.llm.completion_tokens',
  LLM_TOTAL_TOKENS: 'lucid.llm.total_tokens',
  SERVICE: 'lucid.service',
  FEATURE: 'lucid.feature',
  ENVIRONMENT: 'lucid.environment',
  HTTP_METHOD: 'http.method',
  HTTP_ROUTE: 'http.route',
  HTTP_STATUS_CODE: 'http.status_code',

  // ── Generic ──
  ERROR_TYPE: 'error.type',
  OTEL_STATUS_CODE: 'otel.status_code',

  // ── Cross-linking (Sentry ↔ OTel) ──
  SENTRY_TRACE_ID: 'sentry.trace_id',
  SENTRY_EVENT_ID: 'sentry.event_id',
} as const

export type AttrKey = (typeof ATTR_KEYS)[keyof typeof ATTR_KEYS]

/* ─── Allowlist Set (for runtime enforcement) ─────────── */

/** Set of all allowed attribute keys for runtime validation. */
export const ALLOWED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(
  Object.values(ATTR_KEYS)
)

/* ─── Correlation Field Names ─────────────────────────── */

/**
 * Field names for structured logs that enable log ↔ trace ↔ error correlation.
 * All services MUST include these in structured log output.
 */
export const LOG_FIELDS = {
  /** OTel trace ID (32-char hex) — links logs to traces */
  TRACE_ID: 'trace_id',
  /** OTel span ID (16-char hex) — links logs to specific span */
  SPAN_ID: 'span_id',
  /** Lucid run ID (UUID) — idempotency key for metering */
  RUN_ID: 'run_id',
  /** Service name — matches OTel service.name */
  SERVICE: 'service',
  /** Environment — matches OTel deployment.environment.name */
  ENVIRONMENT: 'environment',
} as const

/* ─── Sampling Defaults ───────────────────────────────── */

/**
 * Default HEAD sampling ratios per environment.
 * Override via OTEL_TRACES_SAMPLER_ARG env var.
 *
 * ⚠️  Head sampling CANNOT guarantee error traces are kept.
 * For 100% error trace retention, configure TAIL SAMPLING at the
 * collector/backend level (e.g., Grafana Tempo, Honeycomb, etc.).
 *
 * Recommended tail-sampling rules (configure in collector):
 *  - Keep 100% of traces containing error spans
 *  - Keep 100% of traces with latency > p99 threshold
 *  - Keep 100% of traces with specific span.status = ERROR
 */
export const SAMPLING_DEFAULTS: Record<string, number> = {
  production: 0.1,   // 10% head sampling in prod (cost control)
  staging: 1.0,      // 100% in staging (full visibility)
  development: 1.0,  // 100% in dev
  test: 0.0,         // 0% in test (no noise)
}
