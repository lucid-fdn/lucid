/**
 * Lucid Assistant Worker — main entry
 *
 * Loaded by index.ts AFTER dotenv and config-bootstrap have run.
 * process.env is fully populated before any module here calls getConfig().
 *
 * OTel MUST be initialized BEFORE any other imports — do not move initTracing().
 */

// OTel MUST be initialized BEFORE any other imports
import { initTracing, createExpressTracingMiddleware } from './observability/tracing.js'
await initTracing()

import express from 'express'
import type { Request, Response } from 'express'
import pLimit from 'p-limit'
import { getConfig } from './config.js'
import { createSupabaseClient } from './adapters/supabase.js'
import { EncryptionService } from './crypto/encryption-service.js'
import { wrapConsole } from './utils/pii-redactor.js'
import { DiscordGatewayManager } from './channels/discord/DiscordGatewayManager.js'
import { DiscordHostedVoiceManager } from './channels/discord/voice-manager.js'
import { setDiscordHostedVoiceManager } from './channels/discord/runtime.js'
import { SlackGatewayManager } from './channels/slack/SlackGatewayManager.js'
import { buildReadinessResponse, buildWorkerReadinessState } from './readiness.js'
import { getWorkerRuntimeAdapter } from './runtime-adapters/index.js'
import { captureMessage } from './monitoring/sentry.js'
import { recordInteractiveBacklog } from './observability/metrics.js'
import { defaultWorkerRunExecutor } from './core/runtime/worker-run-executor.js'
import {
  describeWorkerRole,
  isChannelAdminHttpMode,
  isAutomationRole,
  isDagStepRole,
  isInteractiveRole,
  isMaintenanceRole,
  isProductionAllMode,
  isPulseRecoveryRole,
  isPulseSweepRole,
  isWorkerHttpMode,
  shouldRegisterBrowserGateway,
  shouldStartDiscordGateway,
  shouldStartSlackGateway,
} from './worker-role.js'

const config = getConfig()
const mode = config.WORKER_MODE
const workerRole = config.WORKER_ROLE

// Set empty OpenClaw runtime config so loadConfig() works in SaaS mode.
// OpenClaw's channel send/edit functions call loadConfig() internally — this
// provides a safe empty config instead of trying to read YAML files from disk.
const openClawRuntime = await import('@lucid/openclaw-runtime')
if (typeof openClawRuntime.setRuntimeConfigSnapshot === 'function') {
  openClawRuntime.setRuntimeConfigSnapshot({})
}

// Initialize Sentry error tracking (must be early, before any error-throwing code)
import { initSentry } from './monitoring/sentry.js'
initSentry()

// Activate PII redaction BEFORE any other logging
wrapConsole(config.PII_REDACT_LOGS)
const supabase = createSupabaseClient()

// Phase 1B: Per-tenant encryption service
const encryptionService = new EncryptionService(supabase, config.MESSAGE_ENCRYPTION_MASTER_KEY)

/**
 * Exponential backoff check for the relay polling path.
 * Skip 1, 2, 4, 8... cycles (capped at 30) on consecutive failures.
 */
function shouldBackoff(failures: number): boolean {
  if (failures === 0) return false
  const skipCycles = Math.min(Math.pow(2, failures - 1), 30)
  return Math.random() > (1 / skipCycles)
}

// Concurrency limiters
const inboundLimit = pLimit(config.MAX_CONCURRENT_INBOUND)
const outboundLimit = pLimit(config.MAX_CONCURRENT_OUTBOUND)

// Shutdown support
import type { Server } from 'http'
let httpServer: Server | null = null
let startupErrorMessage: string | null = null
const shutdownCallbacks: Array<() => Promise<void>> = []
let discordGatewayManager: DiscordGatewayManager | null = null
let discordHostedVoiceManager: DiscordHostedVoiceManager | null = null
let discordPresenceTimer: ReturnType<typeof setInterval> | null = null
let slackGatewayManager: SlackGatewayManager | null = null
let browserQaGateway: { close(): Promise<void> } | null = null
// Polling timers are managed by the polling fallback module (worker/src/polling/fallback.ts).
// Only relayInboundTimer is kept here for the relay path (dedicated runtimes with REST relay).
import type { RunningCron } from './cron/registry.js'
let cronTimers: RunningCron[] = []

// Dedicated runtime flag
const IS_DEDICATED_RUNTIME = !!config.LUCID_RUNTIME_ID
const DEDICATED_TRANSPORT_MODE = IS_DEDICATED_RUNTIME
  ? config.LUCID_DEDICATED_TRANSPORT_MODE
  : null

// Relay polling timer (dedicated runtimes with REST relay — separate from fallback module)
let relayInboundTimer: ReturnType<typeof setTimeout> | undefined

// Phase 4N-c: Relay step protocol loop handle (dedicated runtimes with DAG steps)
import type { RelayStepLoopHandle } from './processors/relay-step.js'
let relayStepLoop: RelayStepLoopHandle | null = null

// Pulse worker references (set when FEATURE_PULSE=true)
import type { InboundWorker } from './pulse/workers/inbound-worker.js'
import type { OutboundWorker } from './pulse/workers/outbound-worker.js'
import type { ScheduledWorker } from './pulse/workers/scheduled-worker.js'
import type { OrphanDetector } from './pulse/orphan-detector.js'
import type { RedisHealthProbe } from './pulse/redis-health.js'
let pulseInboundWorker: InboundWorker | null = null
let pulseOutboundWorker: OutboundWorker | null = null
let pulseScheduledWorker: ScheduledWorker | null = null
let pulseOrphanDetector: OrphanDetector | null = null
let pulseSweepTimer: ReturnType<typeof setInterval> | null = null
let pulseWakeScannerTimer: ReturnType<typeof setInterval> | null = null
let pulseHealthProbe: RedisHealthProbe | null = null
import type { AvatarGenerationWorkerHandle } from './jobs/avatar-generation.js'
let avatarGenerationWorker: AvatarGenerationWorkerHandle | null = null

// Pulse v2: Retry drainer (transfers delayed retries from ZSET → Stream)
import type { RetryDrainer } from './pulse/retry-drainer.js'
let pulseRetryDrainer: RetryDrainer | null = null

// Shared Pulse queue instance (reused across /trigger, /metrics, workers)
import type { PulseQueue as PulseQueueType } from './pulse/queue.js'
import { startPulseWake, stopPulseWake, publishPulseWake } from './pulse/wake-signal.js'
import { startDagAdvanceListener, stopDagAdvanceListener } from './pulse/dag/dag-advance-listener.js'
let pulseQueue: PulseQueueType | null = null
// Pulse orchestration mode: 'pulse' (Redis healthy) or 'polling' (Redis down, fallback)
let pulseOrchestrationMode: 'pulse' | 'polling' | 'off' = 'off'
// Transition mutex — prevents concurrent mode switches from circuit breaker callbacks
let pulseTransitioning = false
const runtimeAdapter = getWorkerRuntimeAdapter(config)
const readinessState = buildWorkerReadinessState(runtimeAdapter.id, workerRole)

function computeHostedDiscordPresence(): {
  status: 'online' | 'idle' | 'dnd'
  activity: string
  activityType: 3
} {
  if (startupErrorMessage) {
    return {
      status: 'dnd',
      activity: 'Worker degraded',
      activityType: 3,
    }
  }

  if (config.FEATURE_PULSE && pulseHealthProbe && !pulseHealthProbe.isHealthy()) {
    return {
      status: 'idle',
      activity: 'Recovering queue health',
      activityType: 3,
    }
  }

  return {
    status: 'online',
    activity: 'Lucid agents',
    activityType: 3,
  }
}

// Polling fallback (circuit breaker activates when Redis is down)
import { startPollingFallback, stopPollingFallback, triggerInboundPoll, triggerOutboundPoll } from './polling/fallback.js'
let interactiveBacklogMonitorTimer: ReturnType<typeof setInterval> | null = null
let lastInteractiveBacklogAlertAt = 0

// processScheduledTask is in worker/src/processors/scheduled.ts.

// =============================================================================
// HTTP SERVER (Health + Trigger)
// =============================================================================

const app = express()
app.use(express.json())
app.use(createExpressTracingMiddleware())

// Health check (includes embedded plugin runtime status)
import { getLoadedPlugins, embeddedServerCount } from './agent/embedded-registry.js'
import { getBundleVersion, FIRST_PARTY_PLUGIN_COUNT } from './agent/embedded-plugin-loader.js'

app.get('/health', (_req, res) => {
  const plugins = getLoadedPlugins()
  const health: Record<string, unknown> = {
    status: startupErrorMessage ? 'degraded' : 'ok',
    mode,
    role: workerRole,
    worker_id: config.WORKER_ID,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ...(startupErrorMessage ? { startup_error: startupErrorMessage } : {}),
    runtime: IS_DEDICATED_RUNTIME
      ? {
          runtime_id: config.LUCID_RUNTIME_ID,
          engine: config.LUCID_ENGINE,
          runtime_flavor: process.env.LUCID_RUNTIME_FLAVOR || null,
          dedicated_transport_mode: DEDICATED_TRANSPORT_MODE,
        }
      : null,
    embedded: {
      bundleVersion: getBundleVersion() || 'not-loaded',
      availablePlugins: FIRST_PARTY_PLUGIN_COUNT,
      loadedPlugins: embeddedServerCount(),
      connectedPlugins: plugins.filter(p => p.connected).length,
      plugins,
    },
    avatar_generation_worker: avatarGenerationWorker?.status() ?? null,
  }

  // Pulse + Redis circuit breaker status
  if (config.FEATURE_PULSE) {
    health.pulse = {
      orchestration_mode: pulseOrchestrationMode,
      redis_circuit: pulseHealthProbe?.getStatus() ?? null,
    }
  }

  res.json(health)
})

app.get('/ready', (_req, res) => {
  const response = buildReadinessResponse(readinessState)
  return res.status(response.statusCode).json(response.body)
})

if (shouldRegisterBrowserGateway(mode, workerRole)) {
  const { registerBrowserQaGatewayRoutes } = await import('./agent-ops/browser-qa/gateway/routes.js')
  browserQaGateway = registerBrowserQaGatewayRoutes(app, config, supabase)
  shutdownCallbacks.push(async () => {
    await browserQaGateway?.close()
    browserQaGateway = null
  })
}

// Polymarket dashboard endpoints (read-only + cancel)
import { registerPolymarketRoutes } from './skills/polymarket/routes.js'

// Direct streaming endpoint for web chat (industry-standard SSE proxy)
import { createAgentStreamHandler } from './routes/agentStream.js'
import { createCapabilitySurfaceInspectionHandler } from './routes/capabilitySurface.js'
import { createInternalAgentRunHandler } from './routes/internalAgentRun.js'

if (isWorkerHttpMode(mode)) {
  app.post('/stream', (req, res, next) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  }, createAgentStreamHandler(supabase, config))

  app.post('/inspect/capability-surface', (req, res, next) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  }, createCapabilitySurfaceInspectionHandler(supabase, config))

  app.post('/internal/agents/run', (req, res, next) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  }, createInternalAgentRunHandler(supabase, config))
}

if (isChannelAdminHttpMode(mode)) {
  app.get('/discord/status', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!discordGatewayManager) {
      return res.status(503).json({ error: 'Discord gateway unavailable' })
    }
    return res.json({
      ...discordGatewayManager.getAdminStatus(),
      voiceSessions: discordHostedVoiceManager?.status() ?? [],
    })
  })

  app.post('/discord/probe', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!discordGatewayManager) {
      return res.status(503).json({ error: 'Discord gateway unavailable' })
    }
    const probe = await discordGatewayManager.probeHostedBot()
    return res.json({
      ...discordGatewayManager.getAdminStatus(),
      probe,
      voiceSessions: discordHostedVoiceManager?.status() ?? [],
    })
  })

  app.get('/discord/guild-channels', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!discordGatewayManager) {
      return res.status(503).json({ error: 'Discord gateway unavailable' })
    }

    const guildId =
      typeof req.query?.guildId === 'string' && req.query.guildId.trim().length > 0
        ? req.query.guildId.trim()
        : ''
    if (!guildId) {
      return res.status(400).json({ error: 'guildId is required' })
    }

    try {
      const channels = await discordGatewayManager.getGuildChannels(guildId)
      return res.json({ guildId, channels })
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to load Discord guild channels',
      })
    }
  })

  app.get('/slack/status', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!slackGatewayManager) {
      return res.status(503).json({ error: 'Slack gateway unavailable' })
    }
    return res.json(slackGatewayManager.getAdminStatus())
  })

  app.post('/slack/probe', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!slackGatewayManager) {
      return res.status(503).json({ error: 'Slack gateway unavailable' })
    }
    const probe = await slackGatewayManager.probeHostedBot()
    return res.json({
      ...slackGatewayManager.getAdminStatus(),
      probe,
    })
  })

  app.get('/discord/voice', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!discordHostedVoiceManager) {
      return res.status(503).json({ error: 'Discord voice unavailable' })
    }
    return res.json({ sessions: discordHostedVoiceManager.status() })
  })

  app.post('/discord/voice', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!discordHostedVoiceManager) {
      return res.status(503).json({ error: 'Discord voice unavailable' })
    }

    const action = typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : ''
    const guildId = typeof req.body?.guildId === 'string' ? req.body.guildId : ''
    const channelId = typeof req.body?.channelId === 'string' ? req.body.channelId : ''

    if (action === 'join') {
      const result = await discordHostedVoiceManager.join({ guildId, channelId })
      return res.status(result.ok ? 200 : 400).json(result)
    }

    if (action === 'leave') {
      const result = await discordHostedVoiceManager.leave({ guildId })
      return res.status(result.ok ? 200 : 400).json(result)
    }

    if (action === 'status') {
      return res.json({ sessions: discordHostedVoiceManager.status() })
    }

    return res.status(400).json({ error: 'Unsupported Discord voice action' })
  })
}

if (isWorkerHttpMode(mode)) {
  // Webhook trigger endpoint (called by Vercel webhooks)
  app.post('/trigger', async (req: import('express').Request, res: import('express').Response) => {
    // Verify secret
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { event_type } = req.body

    // Respond immediately (fire-and-forget)
    res.json({ triggered: true })

    // Pulse path: enqueue to Redis instead of triggering poll
    const eventId = req.body.event_id as string | undefined
    const assistantId = req.body.assistant_id as string | undefined
    const orgId = (req.body.org_id as string) || ''
    const externalMessageId = req.body.external_message_id as string | null | undefined

    if (event_type === 'knowledge_brain_ops') {
      const { runKnowledgeBrainOps } = await import('./jobs/brain-ops.js')
      void runKnowledgeBrainOps(supabase, config, { orgId: orgId || null }).catch((error) => {
        console.warn('[brain-ops] manual trigger failed:', error instanceof Error ? error.message : error)
      })
      return
    }

    if (event_type === 'knowledge_source_refresh') {
      const { runKnowledgeSourceRefreshJobs } = await import('./jobs/knowledge-source-refresh.js')
      void runKnowledgeSourceRefreshJobs(supabase, config, fetch, { orgId: orgId || null }).catch((error) => {
        console.warn('[knowledge-source-refresh] manual trigger failed:', error instanceof Error ? error.message : error)
      })
      return
    }

    if (config.FEATURE_PULSE && pulseOrchestrationMode === 'pulse' && pulseQueue) {
      // Pulse mode: prefer precise event enqueue when callers provide IDs.
      // For older webhook callers that only send { event_type }, sweep pending
      // DB rows immediately instead of relying on the 30s safety-net timer.
      const { enqueueInboundEvent, sweepPendingInboundEvents } = await import('./pulse/enqueue/inbound.js')
      const { enqueueOutboundEvent, sweepPendingOutboundEvents } = await import('./pulse/enqueue/outbound.js')

      if (event_type === 'inbound') {
        let enqueued = false
        if (eventId && assistantId) {
          enqueued = await enqueueInboundEvent(pulseQueue, {
            id: eventId,
            assistant_id: assistantId,
            org_id: orgId,
            external_message_id: externalMessageId,
          })
        } else {
          const swept = await sweepPendingInboundEvents(pulseQueue, supabase)
          enqueued = swept > 0
        }

        if (enqueued) {
          pulseInboundWorker?.resetBackoff()
          publishPulseWake('inbound')
        } else if (pulseHealthProbe) {
          pulseHealthProbe.recordFailure()
        }
      } else if (event_type === 'outbound') {
        let enqueued = false
        if (eventId && assistantId) {
          enqueued = await enqueueOutboundEvent(pulseQueue, { id: eventId, channel_id: assistantId }, orgId)
        } else {
          const swept = await sweepPendingOutboundEvents(pulseQueue, supabase)
          enqueued = swept > 0
        }

        if (enqueued) {
          pulseOutboundWorker?.resetBackoff()
          publishPulseWake('outbound')
        } else if (pulseHealthProbe) {
          pulseHealthProbe.recordFailure()
        }
      }
      return
    }

    // Polling fallback path: trigger immediate poll
    if (event_type === 'inbound') triggerInboundPoll()
    else if (event_type === 'outbound') triggerOutboundPoll()
  })

  // Polymarket dashboard endpoints (positions, search, orderbook, cancel)
  // Auth middleware applied per-route via prefix matching
  app.use('/polymarket', (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const authHeader = req.headers.authorization
    if (config.WORKER_TRIGGER_SECRET && authHeader !== `Bearer ${config.WORKER_TRIGGER_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })
  registerPolymarketRoutes(app, '/polymarket')
}

// Metrics endpoint (optional)
app.get('/metrics', async (_req, res) => {
  const base: Record<string, unknown> = {
    worker_id: config.WORKER_ID,
    worker_role: workerRole,
    pulse_enabled: config.FEATURE_PULSE,
    dedicated_runtime: IS_DEDICATED_RUNTIME,
    runtime_engine: IS_DEDICATED_RUNTIME ? config.LUCID_ENGINE : null,
    runtime_flavor: IS_DEDICATED_RUNTIME ? process.env.LUCID_RUNTIME_FLAVOR || null : null,
    dedicated_transport_mode: DEDICATED_TRANSPORT_MODE,
    inbound_pending: inboundLimit.pendingCount,
    inbound_active: inboundLimit.activeCount,
    outbound_pending: outboundLimit.pendingCount,
    outbound_active: outboundLimit.activeCount,
    avatar_generation_worker: avatarGenerationWorker?.status() ?? null,
    loop_ownership: {
      worker_http: isWorkerHttpMode(mode),
      channel_admin_http: isChannelAdminHttpMode(mode),
      discord_gateway: shouldStartDiscordGateway(mode, workerRole),
      slack_gateway: shouldStartSlackGateway(mode, workerRole),
      browser_gateway: shouldRegisterBrowserGateway(mode, workerRole),
      interactive_workers: isInteractiveRole(workerRole),
      automation_workers: isAutomationRole(workerRole),
      dag_steps: isDagStepRole(workerRole),
      recovery: isPulseRecoveryRole(workerRole),
      sweep: isPulseSweepRole(workerRole),
      maintenance: isMaintenanceRole(workerRole),
      avatar_generation_jobs: isAutomationRole(workerRole),
    },
  }

  // Add Pulse metrics if enabled (includes circuit breaker state)
  if (config.FEATURE_PULSE) {
    base.pulse_orchestration_mode = pulseOrchestrationMode
    base.pulse_redis_circuit = pulseHealthProbe?.getStatus() ?? null
    try {
      const q = pulseQueue
      if (!q) throw new Error('No Pulse queue')
      const [pulseMetrics, inboundBacklog, outboundBacklog, scheduledBacklog, activeRuns] = await Promise.all([
        q.getMetrics(),
        q.getQueueBacklog('inbound'),
        q.getQueueBacklog('outbound'),
        q.getQueueBacklog('scheduled'),
        q.getActiveRunCount(),
      ])
      base.pulse = {
        ...pulseMetrics,
        // Legacy names remain stream-history length for compatibility.
        queue_depth_inbound: inboundBacklog.streamLength,
        queue_depth_outbound: outboundBacklog.streamLength,
        queue_depth_scheduled: scheduledBacklog.streamLength,
        queue_stream_length_inbound: inboundBacklog.streamLength,
        queue_stream_length_outbound: outboundBacklog.streamLength,
        queue_stream_length_scheduled: scheduledBacklog.streamLength,
        queue_pending_inbound: inboundBacklog.pending,
        queue_pending_outbound: outboundBacklog.pending,
        queue_pending_scheduled: scheduledBacklog.pending,
        queue_lag_inbound: inboundBacklog.lag,
        queue_lag_outbound: outboundBacklog.lag,
        queue_lag_scheduled: scheduledBacklog.lag,
        queue_backlog_inbound: inboundBacklog.backlog,
        queue_backlog_outbound: outboundBacklog.backlog,
        queue_backlog_scheduled: scheduledBacklog.backlog,
        queue_consumers_inbound: inboundBacklog.consumers,
        queue_consumers_outbound: outboundBacklog.consumers,
        queue_consumers_scheduled: scheduledBacklog.consumers,
        queue_group_missing_streams_inbound: inboundBacklog.groupMissingStreams,
        queue_group_missing_streams_outbound: outboundBacklog.groupMissingStreams,
        queue_group_missing_streams_scheduled: scheduledBacklog.groupMissingStreams,
        active_runs: activeRuns,
      }
    } catch {
      base.pulse = { error: 'unavailable' }
    }
  }

  res.json(base)
})

// =============================================================================
// STARTUP
// =============================================================================

async function main(): Promise<void> {
  const configured = (value: unknown) => value ? 'configured' : 'not configured'
  const hostedTelegramAuthStatus = configured(config.TELEGRAM_HOSTED_BOT_TOKEN)
  const hostedDiscordAuthStatus = configured(config.DISCORD_HOSTED_BOT_TOKEN)
  const legacyChannelCryptoStatus = configured(config.ENCRYPTION_KEY)
  const triggerAuthStatus = configured(config.WORKER_TRIGGER_SECRET)

  if (isProductionAllMode(mode, config.NODE_ENV)) {
    console.warn(
      '[startup] WORKER_MODE=all is a development/preview mode. Production should run split services: channels, worker, automation, browser.',
    )
  }

  console.log(`🚀 Lucid Assistant Worker starting... (mode=${mode})`)
  console.log(`   Worker ID: ${config.WORKER_ID}`)
  console.log(`   Worker role: ${describeWorkerRole(workerRole)}`)
  console.log(`   Control plane storage: ${configured(config.SUPABASE_URL)}`)
  console.log(`   Inference gateway: ${configured(config.LUCID_API_BASE_URL)}`)
  console.log(`   Max concurrent inbound: ${config.MAX_CONCURRENT_INBOUND}`)
  console.log(`   Max concurrent outbound: ${config.MAX_CONCURRENT_OUTBOUND}`)
  console.log(`   Hosted Telegram auth: ${hostedTelegramAuthStatus}`)
  console.log(`   Hosted Discord auth: ${hostedDiscordAuthStatus}`)
  console.log(`   Legacy channel crypto: ${legacyChannelCryptoStatus}`)
  console.log(`   Control-plane trigger auth: ${triggerAuthStatus}`)
  console.log(`   Agent runtime: ${config.FEATURE_AGENT_RUNTIME ? '✅ enabled' : '❌ disabled'}`)
  console.log(`   Rate limit: ${config.DEFAULT_RATE_LIMIT_PER_MIN}/min`)
  console.log(`   Dedup TTL: ${config.DEDUP_TTL_HOURS}h`)
  console.log(`   Agent compaction: threshold=${config.AGENT_COMPACTION_THRESHOLD}, keepRecent=${config.AGENT_KEEP_RECENT}`)
  console.log(`   PII redaction: ${config.PII_REDACT_LOGS ? '✅ enabled' : '❌ disabled'}`)
  console.log(`   Message encryption: ${encryptionService.isAvailable() ? '✅ available (HKDF)' : '⚠️ not configured'}`)
  console.log(`   OpenTelemetry: ${process.env.OTEL_ENABLED === 'true' ? '✅ enabled' : '❌ disabled'}`)
  console.log(`   Pulse orchestration: ${config.FEATURE_PULSE ? '✅ enabled' : '❌ disabled'}`)
  console.log(`   Avatar generation worker: ${config.AI_AVATAR_JOB_WORKER_ENABLED ? '✅ enabled' : '❌ disabled'}`)
  if (shouldRegisterBrowserGateway(mode, workerRole)) {
    console.log(`   Browser QA gateway: ✅ registered (headless=${config.BROWSER_QA_HEADLESS})`)
  }
  if (IS_DEDICATED_RUNTIME) {
    console.log(`   Dedicated transport: ${DEDICATED_TRANSPORT_MODE}`)
  }

  // Bind early so Cloud Run sees a listening container while the worker
  // finishes runtime checks and channel startup. /ready continues to report
  // 503 until initialization succeeds.
  if (!httpServer) {
    httpServer = app.listen(config.PORT, () => {
      console.log(`[${mode}] HTTP server listening on port ${config.PORT}`)
    })
  }

  console.log(`   Runtime adapter: ${runtimeAdapter.id}`)
  console.log('   Runtime readiness: verifying...')
  readinessState.readiness = await runtimeAdapter.checkReadiness()
  if (!readinessState.readiness.required) {
    console.log(`   Runtime readiness: skipped (${runtimeAdapter.id})`)
  } else if (readinessState.readiness.ready) {
    console.log(`   Runtime readiness: ✅ available (${runtimeAdapter.id})`)
  } else {
    console.error(`   Runtime readiness: ❌ verification failed (${runtimeAdapter.id})`)
    throw new Error(readinessState.readiness.error || `Runtime adapter ${runtimeAdapter.id} is not ready`)
  }

  // Initialize Web3 Operator (DI: RPC resolver, tool cache, snapshot store).
  // This enriches tooling, but it is not required for shared chat delivery.
  // If the optional workspace package is unavailable in a given image, keep the
  // worker serving traffic and surface the issue via health/telemetry instead of
  // killing startup.
  try {
    const { initWeb3 } = await import('./agent/web3-init.js')
    initWeb3()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[startup] Web3 operator unavailable: ${message}`)
    captureMessage('Worker web3 operator unavailable at startup', 'warning', {
      error: message,
    })
  }

  // Dedicated Runtime: init DataSink + heartbeat + event reporter
  if (IS_DEDICATED_RUNTIME) {
        const { createDataSink, startHeartbeat, initEventReporter, stopHeartbeat, stopEventReporter, flushEvents, sendShutdownHeartbeat } = await import('./runtime/index.js')
        const dataSink = createDataSink()
        if (dataSink) {
          console.log('[runtime] Dedicated runtime mode enabled')

      // Start heartbeat (30s interval)
      startHeartbeat(
        dataSink,
        config.LUCID_RUNTIME_ID!,
        config.LUCID_RUNTIME_GENERATION,
        () => 0 // TODO: track active agent count
      )

      // Start event reporter (5s batch window)
      initEventReporter(dataSink)

      // Register shutdown callbacks: flush events, send final heartbeat, then stop timers
      shutdownCallbacks.push(async () => {
        await flushEvents()
        await sendShutdownHeartbeat(dataSink, config.LUCID_RUNTIME_ID!, config.LUCID_RUNTIME_GENERATION)
        stopHeartbeat()
        stopEventReporter()
      })
    }
  }

  // C2a: Native channel adapters (dedicated runtimes running engine-aware channel loops)
  if (IS_DEDICATED_RUNTIME && config.FEATURE_NATIVE_CHANNELS) {
    const { NativeChannelManager } = await import('./channels/native/NativeChannelManager.js')
    const {
      getRuntimeNativeTransport,
      registerRuntimeNativeTransport,
      supportsRuntimeNativeTransport,
    } = await import(
      './channels/runtime-native/index.js'
    )

    // Register first-party native adapters before NativeChannelManager.start()
    // reads them. Each adapter owns its own transport — Discord uses raw WS,
    // Slack uses @slack/bolt Socket Mode (WS). Registration order doesn't matter.
    const { discordNativeAdapter } = await import('./channels/discord/DiscordNativeAdapter.js')
    registerRuntimeNativeTransport(discordNativeAdapter)

    const { slackNativeAdapter } = await import('./channels/slack/SlackNativeAdapter.js')
    registerRuntimeNativeTransport(slackNativeAdapter)

    const { teamsNativeAdapter } = await import('./channels/msteams/TeamsNativeAdapter.js')
    registerRuntimeNativeTransport(teamsNativeAdapter)

    // Adapter wiring precheck. The previous silent no-op was a P0 bug (the
    // manager reported "connected" while ignoring every message). The new
    // contract throws if no adapter is registered for a configured channel,
    // which would surface as a per-channel error event at start time. Validate
    // up front so the failure mode is a single loud startup error instead of
    // N hidden per-channel errors after the worker is already serving traffic.
    const nativeChannelConfigJson = config.LUCID_CHANNEL_CONFIG ?? config.OPENCLAW_CHANNEL_CONFIG
    let nativeChannelsWired = supportsRuntimeNativeTransport(config.LUCID_ENGINE)
    if (!nativeChannelsWired) {
      console.error(
        `[native-channels] ❌ FATAL: FEATURE_NATIVE_CHANNELS=true but engine "${config.LUCID_ENGINE}" ` +
        `does not support runtime_native channels. Disable FEATURE_NATIVE_CHANNELS or switch to lucid_relay.`,
      )
    }
    if (nativeChannelConfigJson) {
      try {
        const configured = JSON.parse(nativeChannelConfigJson) as Array<{ channelType?: string }>
        if (Array.isArray(configured)) {
          const missing = Array.from(new Set(
            configured
              .map(c => c?.channelType)
              .filter((t): t is string => typeof t === 'string' && !getRuntimeNativeTransport(t)),
          ))
          if (missing.length > 0) {
            console.error(
              `[native-channels] ❌ FATAL: LUCID_CHANNEL_CONFIG references channel types with ` +
              `no registered adapter: ${missing.join(', ')}. ` +
              `Register adapters via registerRuntimeNativeTransport() before enabling ` +
              `FEATURE_NATIVE_CHANNELS, or unset the env var. Skipping native channel manager init.`,
            )
            nativeChannelsWired = false
          }
        }
      } catch {
        // Invalid JSON — manager.start() handles this with its own warning.
      }
    }

    if (nativeChannelsWired) {
      const agentRunner: import('./channels/native/NativeChannelManager.js').AgentRunner = async (params) => {
        const crypto = await import('node:crypto')
        const runId = crypto.randomUUID()

        // Load assistant config from DB for native channel processing
        const { data: assistant } = await supabase
          .from('ai_assistants')
          .select('id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, policy_config, passport_id, approval_required_tools, agent_wallets(chain_type, privy_wallet_id, address, status)')
          .eq('id', params.assistantId)
          .single()

        if (!assistant) throw new Error(`Assistant ${params.assistantId} not found`)

        const assistantConfig = assistant as {
          engine?: 'openclaw' | 'hermes' | null
          org_id?: string | null
          policy_config?: Record<string, unknown> | null
          passport_id?: string | null
          wallet_enabled?: boolean | null
          agent_wallets?: Array<{
            chain_type: string
            privy_wallet_id: string
            address: string
            status: string
          }> | null
        }

        const result = await defaultWorkerRunExecutor.execute({
          assistant: {
            ...assistant,
            engine: assistantConfig.engine ?? 'openclaw',
            org_id: assistantConfig.org_id || null,
            policy_config: assistantConfig.policy_config || null,
            passport_id: assistantConfig.passport_id ?? null,
            wallet_enabled: assistantConfig.wallet_enabled ?? false,
            agent_wallets: assistantConfig.agent_wallets || [],
          },
          conversationId: `native-${params.channelType}-${params.chatId}`,
          messages: [],
          memories: [],
          userMessage: params.messageText,
          budget: {
            maxLlmCalls: config.DEFAULT_MAX_LLM_CALLS,
            maxToolCalls: config.DEFAULT_MAX_TOOL_CALLS,
            maxWallTimeMs: config.DEFAULT_MAX_WALL_TIME_MS,
          },
          runId,
          userId: params.userId,
          llmConfig: {
            baseUrl: config.LUCID_API_BASE_URL,
            apiKey: config.LUCID_API_KEY || '',
          },
          supabase,
        })

        return { responseText: result.text?.trim() || '' }
      }

      const nativeManager = new NativeChannelManager(config, agentRunner)
      await nativeManager.start()

      shutdownCallbacks.push(async () => {
        await nativeManager.stop()
      })

      console.log(`[native-channels] Manager initialized`)
    } else {
      console.warn('[native-channels] Skipping NativeChannelManager — runtime-native transport unavailable')
    }
  }

  async function enqueueGatewayInboundEvent(
    label: 'discord' | 'slack',
    event: {
      id: string
      assistant_id: string
      org_id?: string
      external_message_id?: string | null
    },
  ): Promise<void> {
    let enrichedEvent = event
    if (!enrichedEvent.org_id) {
      const { data: assistantRow, error: assistantError } = await supabase
        .from('ai_assistants')
        .select('org_id')
        .eq('id', enrichedEvent.assistant_id)
        .single()

      if (assistantError || !assistantRow?.org_id) {
        console.error(
          `[${label}] Failed to resolve org_id for inbound event enqueue:`,
          assistantError || { assistant_id: enrichedEvent.assistant_id },
        )
        return
      }

      enrichedEvent = {
        ...enrichedEvent,
        org_id: assistantRow.org_id as string,
      }
    }

    if (config.FEATURE_PULSE && pulseOrchestrationMode === 'pulse' && pulseQueue) {
      const { enqueueInboundEvent, sweepPendingInboundEvents } = await import('./pulse/enqueue/inbound.js')
      const enqueued = await enqueueInboundEvent(pulseQueue, enrichedEvent)
      if (enqueued) {
        console.log(`[${label}] Enqueued inbound event into Pulse`, {
          eventId: enrichedEvent.id,
          assistantId: enrichedEvent.assistant_id,
          externalMessageId: enrichedEvent.external_message_id ?? null,
        })
        pulseInboundWorker?.resetBackoff()
        publishPulseWake('inbound')
      } else {
        console.warn(`[${label}] Direct Pulse enqueue returned false; sweeping pending inbound rows`, {
          eventId: enrichedEvent.id,
          assistantId: enrichedEvent.assistant_id,
          externalMessageId: enrichedEvent.external_message_id ?? null,
        })
        const swept = await sweepPendingInboundEvents(pulseQueue, supabase)
        if (swept > 0) {
          console.log(`[${label}] Sweep recovered pending inbound rows`, {
            eventId: enrichedEvent.id,
            swept,
          })
          pulseInboundWorker?.resetBackoff()
          publishPulseWake('inbound')
        } else if (pulseHealthProbe) {
          pulseHealthProbe.recordFailure()
        }
      }
      return
    }

    triggerInboundPoll()
  }

  // Discord Gateway — socket process only; production should prefer mode=channels.
  if (shouldStartDiscordGateway(mode, workerRole)) {
    if (config.ENCRYPTION_KEY) {
      discordGatewayManager = new DiscordGatewayManager(
        supabase,
        config.ENCRYPTION_KEY,
        config.DISCORD_HOSTED_BOT_TOKEN,
        async (event) => enqueueGatewayInboundEvent('discord', event),
      )
      await discordGatewayManager.start()
      discordHostedVoiceManager = new DiscordHostedVoiceManager({
        supabase,
        config,
        gatewayManager: discordGatewayManager,
        onInboundQueued: async (event) => enqueueGatewayInboundEvent('discord', event),
      })
      setDiscordHostedVoiceManager(discordHostedVoiceManager)
      discordGatewayManager.setPresence(computeHostedDiscordPresence())
      discordPresenceTimer = setInterval(() => {
        if (!discordGatewayManager) return
        discordGatewayManager.setPresence(computeHostedDiscordPresence())
      }, 30_000)
      console.log('[discord] Discord Gateway Manager started')
    }
    if (discordGatewayManager) {
      shutdownCallbacks.push(async () => {
        if (discordPresenceTimer) {
          clearInterval(discordPresenceTimer)
          discordPresenceTimer = null
        }
        setDiscordHostedVoiceManager(null)
        try { await discordHostedVoiceManager?.destroy() } catch { /* ignore */ }
        discordHostedVoiceManager = null
        try { await discordGatewayManager!.stop() } catch { /* ignore */ }
      })
    }
  }

  // Slack Gateway — socket process only; production should prefer mode=channels.
  if (shouldStartSlackGateway(mode, workerRole)) {
    if (config.ENCRYPTION_KEY) {
      slackGatewayManager = new SlackGatewayManager(
        supabase,
        config.ENCRYPTION_KEY,
        async (event) => enqueueGatewayInboundEvent('slack', event),
      )
      await slackGatewayManager.start()
      console.log('[slack] Slack Gateway Manager started')
    }
    if (slackGatewayManager) {
      shutdownCallbacks.push(async () => {
        try { await slackGatewayManager!.stop() } catch { /* ignore */ }
        slackGatewayManager = null
      })
    }
  }

  // Work orchestration — queue workers, automation, and fallback polling.
  if (isAutomationRole(workerRole)) {
    const { startAvatarGenerationWorker } = await import('./jobs/avatar-generation.js')
    avatarGenerationWorker = startAvatarGenerationWorker(config)
    if (avatarGenerationWorker) {
      shutdownCallbacks.push(async () => {
        avatarGenerationWorker?.stop()
        avatarGenerationWorker = null
      })
    }
  }

  // Work orchestration — queue workers, automation, and fallback polling.
  if (isWorkerHttpMode(mode)) {
    // Check if REST relay mode is active (dedicated runtimes drop Supabase credentials)
    if (IS_DEDICATED_RUNTIME && DEDICATED_TRANSPORT_MODE === 'relay') {
      // Lazy-import DataSink from runtime init block (already created above)
      const { createDataSink: createRelaySink } = await import('./runtime/data-sink.js')
      const relaySink = createRelaySink()

      if (relaySink?.claimInboundEvents) {
        console.log('[relay] Dedicated relay transport enabled — using control plane claim/complete APIs')
        const { processRelayPacket } = await import('./processors/relay-inbound.js')

        let relayInboundFailures = 0
        let relayInboundRunning = true

        async function pollInboundViaRelay(): Promise<void> {
          if (!relayInboundRunning) return

          try {
            const packets = await relaySink!.claimInboundEvents!(
              config.INBOUND_BATCH_SIZE,
              config.RELAY_CLAIM_WAIT_MS,
            )
            relayInboundFailures = 0
            if (packets.length) {
              console.log(`[relay] Processing ${packets.length} events`)
              const results = await Promise.allSettled(
                packets.map(p => inboundLimit(() => processRelayPacket(p, relaySink!, config)))
              )
              const ok = results.filter(r => r.status === 'fulfilled').length
              const fail = results.filter(r => r.status === 'rejected').length
              console.log(`[relay] Batch complete: ${ok} ok, ${fail} failed`)
            }

            if (relayInboundRunning) {
              relayInboundTimer = setTimeout(() => {
                void pollInboundViaRelay()
              }, packets.length > 0 ? 0 : config.INBOUND_POLL_INTERVAL)
            }
          } catch (err) {
            relayInboundFailures++
            console.error(`[relay] Claim error (failure #${relayInboundFailures}):`, err)
            const delayMs = shouldBackoff(relayInboundFailures)
              ? Math.min(config.INBOUND_POLL_INTERVAL * relayInboundFailures, 30_000)
              : config.INBOUND_POLL_INTERVAL
            if (relayInboundRunning) {
              relayInboundTimer = setTimeout(() => {
                void pollInboundViaRelay()
              }, delayMs)
            }
          }
        }

        void pollInboundViaRelay()

        shutdownCallbacks.push(async () => {
          relayInboundRunning = false
          if (relayInboundTimer) {
            clearTimeout(relayInboundTimer)
            relayInboundTimer = undefined
          }
        })
        // NOTE: outbound polling is NOT started — control plane delivers in complete-inbound

        // Phase 4N-c: start parallel relay-step loop for DAG-internal steps.
        // Disjoint claim domain from relay-inbound (different table, different DataSink methods).
        if (config.STEP_PROTOCOL_ENABLED && relaySink.claimNextStep) {
          console.log('[relay-step] STEP_PROTOCOL_ENABLED — starting DAG step claim loop')
          const { startRelayStepLoop } = await import('./processors/relay-step.js')
          const { createRelayStepExecutor } = await import('./agent-ops/relay-step-executor.js')
          relayStepLoop = startRelayStepLoop({
            dataSink: relaySink,
            executor: createRelayStepExecutor(config, relaySink),
          })
        }
      } else {
        console.warn('[relay] Dedicated relay transport selected but DataSink relay methods are unavailable')
      }
    } else if (config.FEATURE_PULSE) {
      // ─── Pulse Mode: Event-driven priority queue with Redis circuit breaker ───
      // Circuit breaker (Hystrix pattern): CLOSED → OPEN → HALF_OPEN → CLOSED.
      console.log('[pulse] Starting Pulse orchestration engine with circuit breaker...')

      const { PulseQueue } = await import('./pulse/queue.js')
      const { InboundWorker: InboundWorkerClass } = await import('./pulse/workers/inbound-worker.js')
      const { OutboundWorker: OutboundWorkerClass } = await import('./pulse/workers/outbound-worker.js')
      const { ScheduledWorker: ScheduledWorkerClass } = await import('./pulse/workers/scheduled-worker.js')
      const { OrphanDetector: OrphanDetectorClass } = await import('./pulse/orphan-detector.js')
      const { RedisHealthProbe: RedisHealthProbeClass } = await import('./pulse/redis-health.js')
      const { RetryDrainer: RetryDrainerClass } = await import('./pulse/retry-drainer.js')
      const { bootstrapConsumerGroups, getPulseRedis } = await import('./pulse/redis.js')
      const { sweepPendingInboundEvents } = await import('./pulse/enqueue/inbound.js')
      const { registerOutboundDispatcher, sweepPendingOutboundEvents } = await import('./pulse/enqueue/outbound.js')
      const { scanAndEnqueueScheduledTasks } = await import('./pulse/enqueue/scheduled.js')

      // Initialize agent_runs DB wiring (best-effort observability)
      const { initAgentRuns } = await import('./pulse/agent-runs.js')
      initAgentRuns(supabase)

      const pulseConfig = {
        leaseTtlSeconds: config.PULSE_LEASE_TTL_SECONDS,
        claimBatchSize: config.PULSE_CLAIM_BATCH_SIZE,
        maxConcurrentPerAgent: config.PULSE_MAX_CONCURRENT_PER_AGENT,
        blockTimeoutMs: config.PULSE_BLOCK_TIMEOUT_MS,
      }
      const queue = new PulseQueue(pulseConfig)
      pulseQueue = queue

      // ─── Helper: Start Pulse workers (Redis is healthy) ───
      async function startPulseWorkers(): Promise<void> {
        if (pulseOrchestrationMode === 'pulse' || pulseTransitioning) return
        pulseTransitioning = true

        try {
          // Bootstrap consumer groups FIRST — workers need groups to exist for XREADGROUP
          const redis = await getPulseRedis()
          if (redis) {
            try {
              await bootstrapConsumerGroups(redis)
            } catch (err) {
              // BUSYGROUP = already exists (safe). Other errors: workers will retry on NOGROUP.
              console.warn('[pulse] Bootstrap consumer groups:', err instanceof Error ? err.message : err)
            }
          }

          // DAG scheduler — must be created before workers so it can be injected
          let dagScheduler: InstanceType<typeof import('./pulse/dag/scheduler.js').IncrementalScheduler> | undefined
          try {
            const { IncrementalScheduler } = await import('./pulse/dag/scheduler.js')
            const { DagStepCreator } = await import('./pulse/dag/dag-step-creator.js')
            dagScheduler = new IncrementalScheduler(supabase, new DagStepCreator(supabase))
            // Phase 6: DAG advance listener — picks up children promoted by
            // webhook-triggered completions on the control plane.
            startDagAdvanceListener(supabase, dagScheduler)
          } catch (err) {
            console.warn('[pulse] DAG scheduler failed to start (non-fatal):', err instanceof Error ? err.message : err)
          }

          if (!IS_DEDICATED_RUNTIME && isDagStepRole(workerRole) && !relayStepLoop) {
            const { createSharedWorkerStepDataSink } = await import('./runtime/data-sink.js')
            const sharedStepSink = createSharedWorkerStepDataSink()
            if (sharedStepSink?.claimNextStep && sharedStepSink.completeStep && sharedStepSink.failStep) {
              console.log('[shared-step] Starting shared Agent Ops DAG step loop')
              const { startRelayStepLoop } = await import('./processors/relay-step.js')
              const { createRelayStepExecutor } = await import('./agent-ops/relay-step-executor.js')
              relayStepLoop = startRelayStepLoop({
                dataSink: sharedStepSink,
                executor: createRelayStepExecutor(config, sharedStepSink),
              })
            } else {
              console.warn('[shared-step] Shared Agent Ops DAG step loop not configured')
            }
          }

          // Start retry drainer (transfers delayed retries from ZSET → Stream)
          if (isPulseRecoveryRole(workerRole) && !pulseRetryDrainer) {
            pulseRetryDrainer = new RetryDrainerClass()
            pulseRetryDrainer.start(2000)
          }

          if (isInteractiveRole(workerRole)) {
            pulseInboundWorker = new InboundWorkerClass(queue, config.WORKER_ID, supabase, config, encryptionService, pulseConfig, undefined, dagScheduler)
            pulseOutboundWorker = new OutboundWorkerClass(queue, config.WORKER_ID, supabase, config, pulseConfig, undefined, dagScheduler)
            pulseInboundWorker.start()
            pulseOutboundWorker.start()
          }
          if (isAutomationRole(workerRole)) {
            pulseScheduledWorker = new ScheduledWorkerClass(queue, config.WORKER_ID, supabase, config, pulseConfig, undefined, dagScheduler)
            pulseScheduledWorker.start()
          }

          // Start recovery loops only on automation-capable workers. These scan
          // DB state and should not share the channel gateway latency budget.
          if (isPulseRecoveryRole(workerRole)) {
            pulseOrphanDetector = new OrphanDetectorClass(queue, supabase)
            pulseOrphanDetector.start(60_000)
          }

          // Start sweep safety nets (30s interval)
          if (isPulseSweepRole(workerRole)) {
            pulseSweepTimer = setInterval(async () => {
              try {
                await sweepPendingInboundEvents(queue, supabase)
                await sweepPendingOutboundEvents(queue, supabase)
              } catch (err) {
                console.error('[pulse:sweep] Error:', err instanceof Error ? err.message : err)
              }
            }, 30_000)
          }

          // Start wake scanner for scheduled tasks (10s interval)
          if (isAutomationRole(workerRole)) {
            const runWakeScanner = async () => {
              try {
                await scanAndEnqueueScheduledTasks(queue, supabase)
              } catch (err) {
                console.error('[pulse:wake] Error:', err instanceof Error ? err.message : err)
              }
            }
            runWakeScanner()
            pulseWakeScannerTimer = setInterval(runWakeScanner, 10_000)
          }

          // Fleet-wide wake bus — peer replicas reset their backoff on enqueue
          startPulseWake(supabase, {
            onInbound: () => pulseInboundWorker?.resetBackoff(),
            onOutbound: () => pulseOutboundWorker?.resetBackoff(),
            onScheduled: () => pulseScheduledWorker?.resetBackoff(),
          })

          registerOutboundDispatcher(queue, () => {
            pulseOutboundWorker?.resetBackoff()
            publishPulseWake('outbound')
          })

          if (isInteractiveRole(workerRole)) {
            interactiveBacklogMonitorTimer = setInterval(async () => {
              try {
                const [inboundBacklog, outboundBacklog] = await Promise.all([
                  queue.getQueueBacklog('inbound'),
                  queue.getQueueBacklog('outbound'),
                ])
                const inboundDepth = inboundBacklog.backlog
                const outboundDepth = outboundBacklog.backlog
                recordInteractiveBacklog(inboundDepth, 'inbound')
                recordInteractiveBacklog(outboundDepth, 'outbound')
                if (
                  inboundDepth >= config.INTERACTIVE_BACKLOG_WARN_DEPTH &&
                  Date.now() - lastInteractiveBacklogAlertAt > 5 * 60_000
                ) {
                  lastInteractiveBacklogAlertAt = Date.now()
                  captureMessage('Interactive inbound backlog exceeded threshold', 'warning', {
                    workerRole,
                    inboundDepth,
                    outboundDepth,
                  })
                }
              } catch (err) {
                console.error('[pulse:interactive-backlog] Error:', err instanceof Error ? err.message : err)
              }
            }, 30_000)
          }

          pulseOrchestrationMode = 'pulse'
          console.log('[pulse] Pulse workers STARTED (Redis healthy)')
        } finally {
          pulseTransitioning = false
        }
      }

      // ─── Circuit Breaker: monitor Redis health, fallback to polling ───
      async function activatePollingFallback() {
        if (pulseTransitioning) return
        pulseTransitioning = true
        try {
          // Stop Pulse workers
          if (pulseOrchestrationMode === 'pulse') {
            if (pulseSweepTimer) { clearInterval(pulseSweepTimer); pulseSweepTimer = null }
            if (pulseWakeScannerTimer) { clearInterval(pulseWakeScannerTimer); pulseWakeScannerTimer = null }
            if (interactiveBacklogMonitorTimer) { clearInterval(interactiveBacklogMonitorTimer); interactiveBacklogMonitorTimer = null }
            pulseRetryDrainer?.stop(); pulseRetryDrainer = null
            pulseOrphanDetector?.stop()
            registerOutboundDispatcher(null, null)
            await Promise.all([
              pulseInboundWorker?.stop(),
              pulseOutboundWorker?.stop(),
              pulseScheduledWorker?.stop(),
            ])
          }
          // Start polling fallback
          stopPollingFallback()
          startPollingFallback({
            supabase, config, encryptionService,
            inboundLimit, outboundLimit,
            runInteractive: isInteractiveRole(workerRole),
            runAutomation: isAutomationRole(workerRole),
            runMaintenance: isMaintenanceRole(workerRole),
          })
          pulseOrchestrationMode = 'polling'
          console.warn('[pulse:circuit] Polling fallback ACTIVATED')
        } finally {
          pulseTransitioning = false
        }
      }

      pulseHealthProbe = new RedisHealthProbeClass(
        {
          failureThreshold: 3,
          successThreshold: 3,
          probeIntervalMs: 10_000,
          openCooldownMs: 30_000,
        },
        (oldState, newState) => {
          console.log(`[pulse:circuit] State change: ${oldState} → ${newState}`)

          if (newState === 'open') {
            console.error('[pulse:circuit] Redis circuit OPEN — activating polling fallback')
            void activatePollingFallback()
          } else if (newState === 'closed' && oldState !== 'closed') {
            console.log('[pulse:circuit] Redis circuit CLOSED — switching back to Pulse')
            // Guard: don't stop polling if another transition is in progress,
            // since startPulseWorkers would return early leaving us with no workers.
            if (!pulseTransitioning && pulseOrchestrationMode !== 'pulse') {
              stopPollingFallback()
              void startPulseWorkers()
            }
          }
        },
      )

      // Initial probe: await one definitive probe before deciding mode
      try {
        await pulseHealthProbe.probeOnce()
      } catch {
        // Probe failure is already recorded internally
      }

      // Start periodic probing after the initial check
      pulseHealthProbe.start()

      if (pulseHealthProbe.isHealthy()) {
        await startPulseWorkers()
      } else {
        console.warn('[pulse:circuit] Redis unreachable on startup — starting in polling fallback mode')
        await activatePollingFallback()
      }

      // Register shutdown callbacks
      shutdownCallbacks.push(async () => {
        pulseHealthProbe?.stop()
        pulseHealthProbe = null

        // Stop retry drainer
        pulseRetryDrainer?.stop()
        pulseRetryDrainer = null

        if (pulseOrchestrationMode === 'pulse') {
          if (pulseSweepTimer) clearInterval(pulseSweepTimer)
          if (pulseWakeScannerTimer) clearInterval(pulseWakeScannerTimer)
          if (interactiveBacklogMonitorTimer) clearInterval(interactiveBacklogMonitorTimer)
          stopDagAdvanceListener()
          pulseOrphanDetector?.stop()
          await Promise.all([
            pulseInboundWorker?.stop(),
            pulseOutboundWorker?.stop(),
            pulseScheduledWorker?.stop(),
          ])
        }
        // Polling timers are cleared in the main gracefulShutdown
        console.log('[pulse] Pulse orchestrator stopped')
      })

      console.log(`[pulse] Orchestration engine started (mode=${pulseOrchestrationMode}, circuit=${pulseHealthProbe.getState()})`)
    } else {
      // Standard mode: Supabase polling (no Redis)
      startPollingFallback({
        supabase, config, encryptionService,
        inboundLimit, outboundLimit,
        runInteractive: isInteractiveRole(workerRole),
        runAutomation: isAutomationRole(workerRole),
        runMaintenance: isMaintenanceRole(workerRole),
      })
      pulseOrchestrationMode = 'polling'
    }

    // Register PM sync adapters when FEATURE_PM_SYNC is enabled (side-effect import)
    if (config.FEATURE_PM_SYNC && isAutomationRole(workerRole)) {
      await import('./pm-sync/bootstrap.js')
    }

    // Start cron jobs only on automation-capable workers. Interactive/gateway
    // workers should not duplicate global maintenance scans, especially when
    // channel gateways and job workers share the same Supabase project.
    if (isAutomationRole(workerRole)) {
      const { getCronJobs } = await import('./cron/definitions.js')
      const { startCronJobs } = await import('./cron/registry.js')
      const jobs = await getCronJobs(supabase, config, { pulseQueue })
      cronTimers = startCronJobs(jobs, IS_DEDICATED_RUNTIME)
    } else {
      console.log(`[cron] Skipping cron registry for worker role ${workerRole}`)
    }

    // Pulse and relay modes handle their own first claims.
  }

  console.log(`[${mode}] Worker ready`)
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, starting graceful shutdown...`)

  // 1. Stop accepting new connections and new work
  if (httpServer) {
    httpServer.close()
  }
  stopPollingFallback()
  stopPulseWake()
  stopDagAdvanceListener()
  if (relayInboundTimer) clearTimeout(relayInboundTimer)
  if (relayStepLoop) {
    try { await relayStepLoop.stop() } catch { /* ignore */ }
    relayStepLoop = null
  }
  for (const cron of cronTimers) clearInterval(cron.timer)

  // 2. Wait for in-flight work to drain (max 10s)
  const drainStart = Date.now()
  const DRAIN_TIMEOUT = 10_000
  while (
    (inboundLimit.activeCount > 0 || outboundLimit.activeCount > 0) &&
    Date.now() - drainStart < DRAIN_TIMEOUT
  ) {
    await new Promise(r => setTimeout(r, 500))
  }
  if (inboundLimit.activeCount > 0 || outboundLimit.activeCount > 0) {
    console.warn(`Drain timeout: ${inboundLimit.activeCount} inbound, ${outboundLimit.activeCount} outbound still active`)
  }

  // 3. Run shutdown callbacks (Discord, etc.)
  for (const cb of shutdownCallbacks) {
    try { await cb() } catch { /* ignore */ }
  }

  // 4. Close Redis connection (ioredis TCP needs graceful disconnect)
  const { shutdownPulseRedis } = await import('./pulse/redis.js')
  await shutdownPulseRedis()

  // 5. Close embedded MCP clients
  const { closeAllEmbedded } = await import('./agent/embedded-registry.js')
  await closeAllEmbedded()

  // 6. Flush telemetry
  try {
    const { flush } = await import('./monitoring/sentry.js')
    await flush(2000)
  } catch { /* ignore */ }

  // 7. Give OTel batch processor time to flush (it has its own SIGTERM handler)
  await new Promise(r => setTimeout(r, 1000))

  console.log('Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Start
main().catch((err) => {
  console.error('❌ Fatal error:', err)
  startupErrorMessage = err instanceof Error ? err.message : String(err)
  readinessState.readiness = {
    ready: false,
    required: true,
    status: 'unavailable',
    error: startupErrorMessage,
  }
  if (!httpServer) {
    process.exit(1)
  }
})
