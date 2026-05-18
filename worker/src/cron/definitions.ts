import type { CronJob } from './registry.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../config.js'
import type { PulseQueue } from '../pulse/queue.js'

export interface CronJobsOptions {
  pulseQueue?: PulseQueue | null
}

// Named intervals for readability
const SECONDS = 1_000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES
const DAYS = 24 * HOURS

export async function getCronJobs(supabase: SupabaseClient, config: ReturnType<typeof getConfig>, opts: CronJobsOptions = {}): Promise<CronJob[]> {
  // Lazy imports for each cron handler
  const { pollSummaryJobs } = await import('../jobs/summary-jobs.js')
  const { pollMemoryExtractionJobs } = await import('../jobs/memory-extraction-jobs.js')
  const { runKnowledgeBrainOps } = await import('../jobs/brain-ops.js')
  const { runKnowledgeSourceRefreshJobs } = await import('../jobs/knowledge-source-refresh.js')
  const { projectKnowledgeL2Outbox } = await import('../jobs/knowledge-l2-projections.js')
  const { runDailyIntelRollups } = await import('../jobs/daily-intel.js')
  const { EncryptionService } = await import('../crypto/encryption-service.js')
  const { cleanupStaleSessions } = await import('../agent/OpenClawAgent.js')
  const { runRevenueEpoch } = await import('./revenue-epoch.js')
  const { computeHealthScores } = await import('./health-scores.js')
  const { evaluateRemediationPolicies } = await import('./remediation.js')
  const { computeConversationIntelligence } = await import('./conversation-intelligence.js')
  const { runCostOptimizer } = await import('./cost-optimizer.js')
  const { runReconcilerSweep } = await import('./runtime-reconciler.js')
  const { syncPolymarketBalances } = await import('../skills/polymarket/crons/balance-sync.js')
  const { evaluateAutomationRules } = await import('../skills/polymarket/crons/automation.js')
  const { drainRuntimeStreams } = await import('./runtime-drain.js')
  const { checkIntegrationHealth } = await import('./integration-health.js')
  const { cleanupEventRetention } = await import('./event-retention.js')
  const { cleanupBrowserQaRetention } = await import('./browser-qa-retention.js')
  const { reconcilePmMirrors, sweepUnmirroredWorkItems } = await import('../pm-sync/reconcile.js')

  const epochInterval = Number(process.env.EPOCH_INTERVAL ?? 7 * DAYS)
  const encryptionService = new EncryptionService(supabase, config.MESSAGE_ENCRYPTION_MASTER_KEY)

  return [
    // Always-run (both shared and dedicated workers)
    { name: 'summary-jobs', intervalMs: 10 * SECONDS, sharedOnly: false, handler: () => pollSummaryJobs(supabase, config) },
    ...(config.LUCID_KNOWLEDGE_DURABLE_EXTRACTION_ENABLED
      ? [{ name: 'memory-extraction-jobs', intervalMs: config.MEMORY_EXTRACTION_JOB_INTERVAL_MS, sharedOnly: false, handler: () => pollMemoryExtractionJobs(supabase, config, encryptionService) }]
      : []),
    ...(config.LUCID_KNOWLEDGE_BRAIN_OPS_ENABLED
      ? [{ name: 'knowledge-brain-ops', intervalMs: config.KNOWLEDGE_BRAIN_OPS_INTERVAL_MS, sharedOnly: true, handler: () => runKnowledgeBrainOps(supabase, config) }]
      : []),
    ...(config.LUCID_KNOWLEDGE_SOURCE_REFRESH_ENABLED
      ? [{ name: 'knowledge-source-refresh', intervalMs: config.KNOWLEDGE_SOURCE_REFRESH_INTERVAL_MS, sharedOnly: true, handler: () => runKnowledgeSourceRefreshJobs(supabase, config) }]
      : []),
    ...(config.LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED
      ? [{ name: 'knowledge-l2-projections', intervalMs: config.KNOWLEDGE_L2_PROJECTION_INTERVAL_MS, sharedOnly: true, handler: () => projectKnowledgeL2Outbox(supabase, config) }]
      : []),
    ...(config.LUCID_DAILY_INTEL_ENABLED
      ? [{ name: 'daily-intel', intervalMs: config.DAILY_INTEL_INTERVAL_MS, sharedOnly: true, handler: () => runDailyIntelRollups(supabase, config) }]
      : []),
    { name: 'session-cleanup', intervalMs: 6 * HOURS, sharedOnly: false, handler: () => cleanupStaleSessions() },

    // Shared-only (global singletons — must not duplicate across dedicated runtimes)
    { name: 'revenue-epoch', intervalMs: epochInterval, sharedOnly: true, handler: () => runRevenueEpoch(supabase) },
    { name: 'health-scores', intervalMs: 1 * HOURS, sharedOnly: true, handler: () => computeHealthScores(supabase) },
    { name: 'remediation', intervalMs: 1 * MINUTES, sharedOnly: true, handler: () => evaluateRemediationPolicies(supabase, config) },
    { name: 'conversation-intel', intervalMs: 1 * DAYS, sharedOnly: true, handler: () => computeConversationIntelligence(supabase) },
    { name: 'cost-optimizer', intervalMs: 7 * DAYS, sharedOnly: true, handler: () => runCostOptimizer(supabase) },
    { name: 'runtime-reconciler', intervalMs: 1 * MINUTES, sharedOnly: true, handler: () => runReconcilerSweep(supabase) },
    { name: 'polymarket-balance-sync', intervalMs: 5 * MINUTES, sharedOnly: true, handler: () => syncPolymarketBalances(supabase) },
    { name: 'polymarket-automation', intervalMs: 1 * MINUTES, sharedOnly: true, handler: () => evaluateAutomationRules(supabase) },
    { name: 'integration-health', intervalMs: 1 * DAYS, sharedOnly: true, handler: () => checkIntegrationHealth(supabase) },
    { name: 'event-retention', intervalMs: 1 * DAYS, sharedOnly: true, handler: () => cleanupEventRetention(supabase) },
    { name: 'browser-qa-retention', intervalMs: 1 * DAYS, sharedOnly: true, handler: () => cleanupBrowserQaRetention(supabase, config) },

    // Redis Streams ingest drain (30s, lock-protected — safe to run on all workers)
    // 30s interval reduces Upstash HTTP requests by ~6x vs the previous 5s (avoids free-tier cap)
    { name: 'runtime-drain', intervalMs: 30 * SECONDS, sharedOnly: true, handler: () => drainRuntimeStreams(supabase, config.WORKER_ID) },

    // PM Sync reconciliation — drift detection for external PM tool mirrors (5 min, gated)
    ...(config.FEATURE_PM_SYNC && config.FEATURE_PM_SYNC_RECONCILE
      ? [{ name: 'pm-sync-reconcile', intervalMs: 5 * MINUTES, sharedOnly: true, handler: async () => {
          await reconcilePmMirrors(supabase)
          // Phase 6: sweep work items with external_mirror but no external ref yet.
          if (opts.pulseQueue) {
            await sweepUnmirroredWorkItems(supabase, opts.pulseQueue).catch((err) => {
              console.warn('[cron:pm-sync-reconcile] sweep failed:', err instanceof Error ? err.message : err)
            })
          }
        } }]
      : []),
  ]
}
