import type {
  AppArtifact,
  AppDeployment,
  AppDeploymentEvent,
  AppExternalDeployment,
  AppFrontendGeneration,
  AppPublicUsageBucket,
} from '@contracts/app-service'
import {
  originFromUrl,
  publicRuntimeDayRange,
  publicRuntimeMonthRange,
} from './public-runtime-core'
import { redactAppServiceMetadata, redactAppServiceText } from './security-redaction'

export interface OperatorArtifactSummary {
  id: string
  kind: AppArtifact['kind']
  version: number
  checksum: string
  storage_url?: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export interface AppAllowedOriginSummary {
  origin: string
  source: string
  created_at: string
}

export interface OperatorUsageMetricSummary {
  bucket_start: string
  current: number
  limit: number | null
  remaining: number | null
  percent: number | null
}

export interface OperatorUsageSummary {
  daily_public_requests: OperatorUsageMetricSummary
  monthly_chat_cost_cents: OperatorUsageMetricSummary
  monthly_chat_completions: {
    bucket_start: string
    current: number
  }
}

export interface OperatorAbuseMetricSummary {
  current_24h: number
  last_event_at: string | null
}

export interface OperatorAbuseSummary {
  status: 'clear' | 'watch' | 'blocked'
  window_start: string
  denied_origins_24h: OperatorAbuseMetricSummary
  rate_limited_24h: OperatorAbuseMetricSummary
  cost_cap_hits_24h: OperatorAbuseMetricSummary
  unsafe_feedback_24h: OperatorAbuseMetricSummary
  blocked_public_runtime_24h: number
  recommended_actions: string[]
}

export interface AppLaunchReadinessIssue {
  code: string
  label: string
  detail: string
}

export interface AppLaunchReadiness {
  status: 'ready' | 'warning' | 'blocked'
  blockers: AppLaunchReadinessIssue[]
  warnings: AppLaunchReadinessIssue[]
}

export interface AppServiceOperatorVisibility {
  health: {
    app_status: AppDeployment['status']
    frontend_status?: AppFrontendGeneration['status']
    external_deployment_status?: AppExternalDeployment['status']
    validation_passed?: boolean
    sandbox_passed?: boolean
    has_failed_provider_step: boolean
    last_event_at?: string
  }
  links: {
    preview_url?: string | null
    public_url?: string | null
    provider_web_url?: string | null
    provider_preview_url?: string | null
    external_url?: string | null
  }
  latest: {
    frontend_generation: AppFrontendGeneration | null
    external_deployment: AppExternalDeployment | null
    source_archive: OperatorArtifactSummary | null
    eval_report: OperatorArtifactSummary | null
    build_log: OperatorArtifactSummary | null
    deployment_receipt: OperatorArtifactSummary | null
  }
  usage: OperatorUsageSummary
  abuse: OperatorAbuseSummary
  launch_readiness: AppLaunchReadiness
  allowed_origins: AppAllowedOriginSummary[]
  artifacts: OperatorArtifactSummary[]
  timeline: AppDeploymentEvent[]
  frontend_generations: AppFrontendGeneration[]
  external_deployments: AppExternalDeployment[]
}

function stableRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function timestampOrNull(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function manifestNumberLimit(app: AppDeployment, key: string): number | null {
  const manifest = stableRecord(app.frontend_manifest)
  const limits = stableRecord(manifest.limits)
  return numberOrNull(limits[key])
}

function manifestCapabilities(app: AppDeployment): string[] {
  const manifest = stableRecord(app.frontend_manifest)
  const capabilities = manifest.capabilities
  if (Array.isArray(capabilities) && capabilities.every((item) => typeof item === 'string')) {
    return capabilities
  }
  return app.assistant_ids.length > 0 ? ['status', 'chat'] : ['status']
}

function percentUsed(current: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null
  return Math.min(100, Math.round((current / limit) * 100))
}

function usageMetric(input: {
  buckets: AppPublicUsageBucket[]
  bucketKind: AppPublicUsageBucket['bucket_kind']
  metric: AppPublicUsageBucket['metric']
  bucketStart: string
  limit: number | null
}): OperatorUsageMetricSummary {
  const bucket = input.buckets.find((item) => (
    item.bucket_kind === input.bucketKind
    && item.metric === input.metric
    && item.bucket_start === input.bucketStart
  ))
  const current = bucket?.count_value ?? 0
  return {
    bucket_start: input.bucketStart,
    current,
    limit: input.limit,
    remaining: input.limit === null ? null : Math.max(0, input.limit - current),
    percent: percentUsed(current, input.limit),
  }
}

function summarizeUsage(
  app: AppDeployment,
  usageBuckets: AppPublicUsageBucket[],
  now = new Date(),
): OperatorUsageSummary {
  const day = publicRuntimeDayRange(now)
  const month = publicRuntimeMonthRange(now)
  const dailyPublicRequests = usageMetric({
    buckets: usageBuckets,
    bucketKind: 'day',
    metric: 'public_requests',
    bucketStart: day.start,
    limit: manifestNumberLimit(app, 'public_requests_per_day'),
  })
  const monthlyChatCost = usageMetric({
    buckets: usageBuckets,
    bucketKind: 'month',
    metric: 'public_chat_cost_cents',
    bucketStart: month.start,
    limit: manifestNumberLimit(app, 'monthly_cost_cents'),
  })
  const monthlyChatCompletions = usageMetric({
    buckets: usageBuckets,
    bucketKind: 'month',
    metric: 'public_chat_completions',
    bucketStart: month.start,
    limit: null,
  })

  return {
    daily_public_requests: dailyPublicRequests,
    monthly_chat_cost_cents: monthlyChatCost,
    monthly_chat_completions: {
      bucket_start: monthlyChatCompletions.bucket_start,
      current: monthlyChatCompletions.current,
    },
  }
}

function summarizeSourceFiles(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined

  return value.map((entry) => {
    const file = stableRecord(entry)
    return {
      path: stringOrNull(file.path),
      bytes: typeof file.bytes === 'number' ? file.bytes : undefined,
      sha256: stringOrNull(file.sha256),
      locked: typeof file.locked === 'boolean' ? file.locked : undefined,
    }
  })
}

export function summarizeArtifactForOperator(artifact: AppArtifact): OperatorArtifactSummary {
  const metadata = redactAppServiceMetadata(stableRecord(artifact.metadata))
  const safeMetadata: Record<string, unknown> = {
    provider: metadata.provider,
    phase: metadata.phase,
    passed: metadata.passed,
    total_bytes: metadata.total_bytes,
    file_count: metadata.file_count,
    source_checksum: metadata.source_checksum,
    provider_version_id: metadata.provider_version_id,
    provider_deployment_id: metadata.provider_deployment_id,
    external_deployment_id: metadata.external_deployment_id,
    external_url: metadata.external_url,
    next_since: metadata.next_since,
  }

  if (artifact.kind === 'source_archive') {
    safeMetadata.files = summarizeSourceFiles(metadata.files)
  }

  if (artifact.kind === 'build_log') {
    safeMetadata.logs = Array.isArray(metadata.logs) ? metadata.logs.slice(-100) : undefined
    safeMetadata.errors = metadata.errors
  }

  if (artifact.kind === 'eval_report') {
    safeMetadata.findings = metadata.findings
  }

  if (artifact.kind === 'deployment_receipt') {
    safeMetadata.environment = metadata.environment
    safeMetadata.build_log_artifact_id = metadata.build_log_artifact_id
  }

  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
    checksum: artifact.checksum,
    storage_url: artifact.storage_url,
    created_at: artifact.created_at,
    metadata: Object.fromEntries(
      Object.entries(safeMetadata).filter(([, value]) => value !== undefined),
    ),
  }
}

function latestArtifact(
  artifacts: OperatorArtifactSummary[],
  kind: AppArtifact['kind'],
): OperatorArtifactSummary | null {
  return artifacts.find((artifact) => artifact.kind === kind) ?? null
}

function sanitizeEvent(event: AppDeploymentEvent): AppDeploymentEvent {
  return {
    ...event,
    message: event.message ? redactAppServiceText(event.message) : event.message,
    external_id: event.external_id ? redactAppServiceText(event.external_id) : event.external_id,
    payload: redactAppServiceMetadata(stableRecord(event.payload)),
  }
}

function sanitizeFrontendGeneration(generation: AppFrontendGeneration): AppFrontendGeneration {
  return {
    ...generation,
    brief: redactAppServiceMetadata(generation.brief),
    result: redactAppServiceMetadata(generation.result),
    error_message: generation.error_message ? redactAppServiceText(generation.error_message) : generation.error_message,
  }
}

function sanitizeExternalDeployment(deployment: AppExternalDeployment): AppExternalDeployment {
  return {
    ...deployment,
    metadata: redactAppServiceMetadata(deployment.metadata),
  }
}

const ABUSE_EVENT_TYPES: {
  deniedOrigins: ReadonlySet<string>
  rateLimited: ReadonlySet<string>
  costCap: ReadonlySet<string>
} = {
  deniedOrigins: new Set(['public_origin_denied']),
  rateLimited: new Set(['public_request_rate_limited', 'public_turnstile_failed']),
  costCap: new Set(['public_chat_cost_cap_reached', 'public_chat_turn_cap_reached']),
} as const

export const PUBLIC_RUNTIME_ABUSE_EVENT_TYPES = [
  'public_origin_denied',
  'public_request_rate_limited',
  'public_turnstile_failed',
  'public_chat_cost_cap_reached',
  'public_chat_turn_cap_reached',
  'public_feedback_reported',
] as const

function isUnsafeFeedback(event: AppDeploymentEvent): boolean {
  return event.event_type === 'public_feedback_reported'
    && stableRecord(event.payload).report_type === 'unsafe'
}

function abuseMetric(
  events: AppDeploymentEvent[],
  predicate: (event: AppDeploymentEvent) => boolean,
): OperatorAbuseMetricSummary {
  const matches = events.filter(predicate)
  return {
    current_24h: matches.length,
    last_event_at: matches
      .map((event) => event.created_at)
      .sort((a, b) => b.localeCompare(a))[0] ?? null,
  }
}

function summarizeAbuse(
  events: AppDeploymentEvent[],
  now = new Date(),
): OperatorAbuseSummary {
  const windowStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const windowStart = windowStartDate.toISOString()
  const windowStartTime = windowStartDate.getTime()
  const recentEvents = events.filter((event) => {
    const createdAt = timestampOrNull(event.created_at)
    return createdAt !== null && createdAt >= windowStartTime
  })

  const deniedOrigins = abuseMetric(
    recentEvents,
    (event) => ABUSE_EVENT_TYPES.deniedOrigins.has(event.event_type),
  )
  const rateLimited = abuseMetric(
    recentEvents,
    (event) => ABUSE_EVENT_TYPES.rateLimited.has(event.event_type),
  )
  const costCapHits = abuseMetric(
    recentEvents,
    (event) => ABUSE_EVENT_TYPES.costCap.has(event.event_type),
  )
  const unsafeFeedback = abuseMetric(recentEvents, isUnsafeFeedback)
  const blockedPublicRuntime = deniedOrigins.current_24h
    + rateLimited.current_24h
    + costCapHits.current_24h

  const recommendedActions: string[] = []
  if (deniedOrigins.current_24h > 0) recommendedActions.push('review_allowed_origins')
  if (rateLimited.current_24h > 0) recommendedActions.push('review_request_cap')
  if (costCapHits.current_24h > 0) recommendedActions.push('review_cost_cap')
  if (unsafeFeedback.current_24h > 0) recommendedActions.push('triage_unsafe_feedback')

  return {
    status: costCapHits.current_24h > 0 || rateLimited.current_24h > 0
      ? 'blocked'
      : blockedPublicRuntime > 0 || unsafeFeedback.current_24h > 0 ? 'watch' : 'clear',
    window_start: windowStart,
    denied_origins_24h: deniedOrigins,
    rate_limited_24h: rateLimited,
    cost_cap_hits_24h: costCapHits,
    unsafe_feedback_24h: unsafeFeedback,
    blocked_public_runtime_24h: blockedPublicRuntime,
    recommended_actions: recommendedActions,
  }
}

function issue(code: string, label: string, detail: string): AppLaunchReadinessIssue {
  return { code, label, detail }
}

function hasAllowedRuntimeOrigin(params: {
  origin: string | null
  app: AppDeployment
  allowedOrigins: AppAllowedOriginSummary[]
}) {
  const { origin, app, allowedOrigins } = params
  if (!origin) return true
  return origin === originFromUrl(app.public_url)
    || origin === originFromUrl(app.preview_url)
    || allowedOrigins.some((item) => item.origin === origin)
}

function summarizeLaunchReadiness(input: {
  app: AppDeployment
  latestFrontend: AppFrontendGeneration | null
  latestExternal: AppExternalDeployment | null
  validationPassed?: boolean
  sandboxPassed?: boolean
  usage: OperatorUsageSummary
  abuse: OperatorAbuseSummary
  allowedOrigins: AppAllowedOriginSummary[]
}): AppLaunchReadiness {
  const blockers: AppLaunchReadinessIssue[] = []
  const warnings: AppLaunchReadinessIssue[] = []
  const { app, latestExternal, usage, abuse } = input
  const capabilities = manifestCapabilities(app)
  const consent = stableRecord(stableRecord(app.frontend_manifest).consent)

  if (app.status === 'failed' || app.status === 'archived') {
    blockers.push(issue('app_not_launchable', 'App cannot launch', 'Failed or archived apps must be recovered before beta traffic.'))
  } else if (app.status !== 'active') {
    blockers.push(issue('app_not_active', 'Activate app', 'The app must be active before a customer-facing beta launch.'))
  }

  if (!app.public_url) {
    blockers.push(issue('public_url_missing', 'Public URL missing', 'A launchable generated app needs a stable public URL.'))
  }

  if (app.frontend_strategy !== 'manifest' && input.validationPassed !== true) {
    blockers.push(issue('source_validation_pending', 'Validate generated source', 'Generated code must pass source guard validation before launch.'))
  }

  if (app.frontend_strategy === 'generated_code' && input.sandboxPassed !== true) {
    blockers.push(issue('sandbox_build_pending', 'Pass sandbox build', 'Generated code must pass isolated sandbox build verification before launch.'))
  }

  if (app.deployment_target !== 'lucid_hosted' && latestExternal?.status !== 'ready') {
    blockers.push(issue('external_deploy_not_ready', 'External deploy not ready', 'The selected external deployment target must be ready before launch.'))
  }

  if (capabilities.includes('chat') && app.assistant_ids.length === 0) {
    blockers.push(issue('assistant_missing', 'Connect assistant', 'Chat-capable apps need at least one bound assistant.'))
  }

  if (usage.daily_public_requests.limit === null) {
    blockers.push(issue('daily_request_cap_missing', 'Set request cap', 'Set limits.public_requests_per_day before allowing public beta traffic.'))
  }

  if (capabilities.includes('chat') && usage.monthly_chat_cost_cents.limit === null) {
    blockers.push(issue('monthly_cost_cap_missing', 'Set cost cap', 'Set limits.monthly_cost_cents before enabling public chat.'))
  }

  const externalOrigin = originFromUrl(latestExternal?.external_url)
  if (
    externalOrigin
    && !hasAllowedRuntimeOrigin({ origin: externalOrigin, app, allowedOrigins: input.allowedOrigins })
  ) {
    blockers.push(issue('external_origin_not_allowed', 'Allow external origin', 'The external app origin must be allowed before it can call the public runtime API.'))
  }

  if (app.visibility === 'private') {
    warnings.push(issue('private_visibility', 'Private visibility', 'The app is still private, so external visitors cannot reach the public surface.'))
  }

  if (typeof consent.privacy_url !== 'string') {
    warnings.push(issue('privacy_url_missing', 'Privacy link missing', 'Add a privacy URL for visitor-facing beta traffic.'))
  }

  if ((usage.daily_public_requests.percent ?? 0) >= 80) {
    warnings.push(issue('daily_request_cap_near', 'Daily cap near limit', 'Public requests have used at least 80% of today\'s configured cap.'))
  }

  if ((usage.monthly_chat_cost_cents.percent ?? 0) >= 80) {
    warnings.push(issue('monthly_cost_cap_near', 'Cost cap near limit', 'Public chat has used at least 80% of this month\'s configured cost cap.'))
  }

  if (abuse.cost_cap_hits_24h.current_24h > 0) {
    blockers.push(issue('public_cost_cap_hit', 'Cost cap hit', 'Public runtime hit the monthly chat cost cap in the last 24 hours.'))
  }

  if (abuse.rate_limited_24h.current_24h > 0) {
    warnings.push(issue('public_rate_limited', 'Public requests limited', 'Public runtime denied requests because configured traffic limits were reached.'))
  }

  if (abuse.denied_origins_24h.current_24h > 0) {
    warnings.push(issue('origin_denials_detected', 'Origin denials detected', 'Review denied runtime origins before promoting external traffic.'))
  }

  if (abuse.unsafe_feedback_24h.current_24h > 0) {
    warnings.push(issue('unsafe_feedback_detected', 'Unsafe feedback reported', 'Review visitor reports before widening beta traffic.'))
  }

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready',
    blockers,
    warnings,
  }
}

export function summarizeAppServiceOperatorVisibility(input: {
  app: AppDeployment
  frontendGenerations: AppFrontendGeneration[]
  externalDeployments: AppExternalDeployment[]
  artifacts: AppArtifact[]
  events: AppDeploymentEvent[]
  abuseEvents?: AppDeploymentEvent[]
  usageBuckets?: AppPublicUsageBucket[]
  allowedOrigins?: AppAllowedOriginSummary[]
  now?: Date
}): AppServiceOperatorVisibility {
  const frontendGenerations = input.frontendGenerations.map(sanitizeFrontendGeneration).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const externalDeployments = input.externalDeployments.map(sanitizeExternalDeployment).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const timeline = input.events.map(sanitizeEvent).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const artifacts = input.artifacts
    .map(summarizeArtifactForOperator)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const latestFrontend = frontendGenerations[0] ?? null
  const latestExternal = externalDeployments[0] ?? null
  const validation = stableRecord(latestFrontend?.result.validation)
  const sandbox = stableRecord(latestFrontend?.result.sandbox)
  const latestEvent = timeline[0]
  const usage = summarizeUsage(input.app, input.usageBuckets ?? [], input.now)
  const abuse = summarizeAbuse(input.abuseEvents ?? input.events, input.now)
  const allowedOrigins = [...(input.allowedOrigins ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const validationPassed = booleanOrUndefined(validation.passed)
  const sandboxPassed = booleanOrUndefined(sandbox.passed)
  const launchReadiness = summarizeLaunchReadiness({
    app: input.app,
    latestFrontend,
    latestExternal,
    validationPassed,
    sandboxPassed,
    usage,
    abuse,
    allowedOrigins,
  })

  return {
    health: {
      app_status: input.app.status,
      frontend_status: latestFrontend?.status,
      external_deployment_status: latestExternal?.status,
      validation_passed: validationPassed,
      sandbox_passed: sandboxPassed,
      has_failed_provider_step: Boolean(
        latestFrontend?.status === 'failed'
        || latestExternal?.status === 'failed'
        || timeline.some((event) => event.severity === 'error'),
      ),
      last_event_at: latestEvent?.created_at,
    },
    links: {
      preview_url: input.app.preview_url,
      public_url: input.app.public_url,
      provider_web_url: latestFrontend?.web_url,
      provider_preview_url: latestFrontend?.preview_url,
      external_url: latestExternal?.external_url,
    },
    latest: {
      frontend_generation: latestFrontend,
      external_deployment: latestExternal,
      source_archive: latestArtifact(artifacts, 'source_archive'),
      eval_report: latestArtifact(artifacts, 'eval_report'),
      build_log: latestArtifact(artifacts, 'build_log'),
      deployment_receipt: latestArtifact(artifacts, 'deployment_receipt'),
    },
    usage,
    abuse,
    launch_readiness: launchReadiness,
    allowed_origins: allowedOrigins,
    artifacts,
    timeline,
    frontend_generations: frontendGenerations,
    external_deployments: externalDeployments,
  }
}
