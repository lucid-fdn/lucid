import type { KnowledgeLayer, KnowledgePromptPacket } from './types'

export type KnowledgeProductionArea =
  | 'retrieval_load'
  | 'queue_backpressure'
  | 'migration_rls'
  | 'duplicate_suppression'
  | 'degraded_dependency'
  | 'runbook'

export type KnowledgeProductionStatus = 'pass' | 'warn' | 'fail' | 'manual_required'

export interface KnowledgeProductionCheck {
  slug: string
  area: KnowledgeProductionArea
  status: KnowledgeProductionStatus
  summary: string
  evidence: string[]
  nextAction?: string
}

export interface KnowledgeProductionHardeningReport {
  status: Exclude<KnowledgeProductionStatus, 'manual_required'> | 'manual_required'
  checks: KnowledgeProductionCheck[]
  blockingChecks: KnowledgeProductionCheck[]
}

export interface KnowledgeRetrievalLoadInput {
  packet: KnowledgePromptPacket
  durationMs: number
  maxDurationMs: number
  expectedLayers: KnowledgeLayer[]
}

export interface KnowledgeQueuePressureInput {
  backlogDepth: number
  retryPressure: number
  oldestPendingAgeMs: number
  deadLetterCount: number
}

export interface KnowledgeDegradedDependencyInput {
  embeddingUnavailable?: boolean
  ragTimedOut?: boolean
  l2Unavailable?: boolean
  dbPoolPressure?: boolean
  packet: KnowledgePromptPacket
}

export const KNOWLEDGE_REQUIRED_PRODUCTION_MIGRATIONS = [
  '20260506120000_assistant_memory_knowledge_safety.sql',
  '20260506123000_memory_extraction_jobs.sql',
  '20260506130000_knowledge_team_project_brain.sql',
  '20260506133000_knowledge_source_federation_policy.sql',
  '20260506140000_knowledge_entity_relationship_graph.sql',
  '20260506143000_knowledge_brain_ops_maintenance.sql',
  '20260506150000_knowledge_operation_events.sql',
  '20260506153000_knowledge_retrieval_evals.sql',
  '20260506160000_knowledge_l2_projection_bridge.sql',
  '20260506163000_knowledge_engine_home_projection_candidates.sql',
  '20260507130000_external_agent_os_foundations.sql',
  '20260507132000_knowledge_claim_brain_ops_maintenance.sql',
  '20260507136000_knowledge_embedding_doctor_stats.sql',
  '20260508100000_knowledge_claim_semantic_governance.sql',
  '20260508101000_lucid_pack_fork_uninstall_audit.sql',
] as const

export const KNOWLEDGE_PRODUCTION_RUNBOOKS = [
  'knowledge-source-cleanup',
  'knowledge-eval-regression',
  'knowledge-l2-projection-failure',
  'accidental-memory-capture',
] as const

export function buildKnowledgeRetrievalLoadCheck(input: KnowledgeRetrievalLoadInput): KnowledgeProductionCheck {
  const seenLayers = new Set(input.packet.telemetry.retrievalCounts
    ? Object.entries(input.packet.telemetry.retrievalCounts)
      .filter(([, count]) => Number(count) > 0)
      .map(([layer]) => layer as KnowledgeLayer)
    : input.packet.items.map((item) => item.layer))
  const missingLayers = input.expectedLayers.filter((layer) => !seenLayers.has(layer))
  const overBudget = Boolean(input.packet.costControls?.exceeded)
  const slow = input.durationMs > input.maxDurationMs
  const status: KnowledgeProductionStatus = missingLayers.length || overBudget || slow ? 'fail' : 'pass'

  return {
    slug: 'mixed-retrieval-load',
    area: 'retrieval_load',
    status,
    summary: status === 'pass'
      ? 'Mixed Knowledge retrieval stays bounded across memory, brain, RAG, and graph inputs.'
      : 'Mixed Knowledge retrieval is missing layers, too slow, or over prompt budget.',
    evidence: [
      `durationMs=${input.durationMs}`,
      `maxDurationMs=${input.maxDurationMs}`,
      `items=${input.packet.items.length}`,
      `budgetExceeded=${overBudget}`,
      `missingLayers=${missingLayers.join(',') || 'none'}`,
    ],
    nextAction: status === 'pass' ? undefined : 'Reduce per-layer budgets, inspect slow dependencies, or restore missing retrieval layers.',
  }
}

export function buildKnowledgeQueueBackpressureCheck(input: KnowledgeQueuePressureInput): KnowledgeProductionCheck {
  const reasons: string[] = []
  if (input.deadLetterCount > 0) reasons.push('dead_letter_present')
  if (input.oldestPendingAgeMs > 30 * 60 * 1000) reasons.push('oldest_pending_over_30m')
  if (input.retryPressure >= 0.25) reasons.push('retry_pressure_high')
  if (input.backlogDepth > 500) reasons.push('backlog_over_500')

  const status: KnowledgeProductionStatus = input.deadLetterCount > 0 || input.oldestPendingAgeMs > 60 * 60 * 1000
    ? 'fail'
    : reasons.length
      ? 'warn'
      : 'pass'

  return {
    slug: 'durable-memory-queue-backpressure',
    area: 'queue_backpressure',
    status,
    summary: status === 'pass'
      ? 'Durable extraction and consolidation queues are within safe pressure bounds.'
      : 'Durable extraction or consolidation queues need throttling, retry triage, or dead-letter review.',
    evidence: [
      `backlogDepth=${input.backlogDepth}`,
      `retryPressure=${input.retryPressure}`,
      `oldestPendingAgeMs=${input.oldestPendingAgeMs}`,
      `deadLetterCount=${input.deadLetterCount}`,
      `reasons=${reasons.join(',') || 'none'}`,
    ],
    nextAction: status === 'pass' ? undefined : 'Throttle workers, inspect failed jobs, and clear dead letters before increasing concurrency.',
  }
}

export function buildKnowledgeMigrationRlsCheck(appliedMigrations: string[]): KnowledgeProductionCheck {
  const applied = new Set(appliedMigrations)
  const missing = KNOWLEDGE_REQUIRED_PRODUCTION_MIGRATIONS.filter((migration) => !applied.has(migration))
  const status: KnowledgeProductionStatus = missing.length ? 'manual_required' : 'pass'

  return {
    slug: 'migration-rls-staging-readiness',
    area: 'migration_rls',
    status,
    summary: status === 'pass'
      ? 'All required Knowledge migrations are present in the checked environment.'
      : 'Staging/prod migration and RLS state must be verified before production promotion.',
    evidence: [
      `required=${KNOWLEDGE_REQUIRED_PRODUCTION_MIGRATIONS.length}`,
      `missing=${missing.join(',') || 'none'}`,
      'RLS must be verified with service-role write paths and member/admin read/write paths in staging.',
    ],
    nextAction: status === 'pass' ? undefined : 'Apply missing migrations and run the staging RLS checklist in the runbook.',
  }
}

export function buildKnowledgeDuplicateSuppressionCheck(input: {
  externalMessageReplayDeduped: boolean
  inboundReplayDeduped: boolean
  duplicateInsertHandled: boolean
}): KnowledgeProductionCheck {
  const failures = [
    input.externalMessageReplayDeduped ? null : 'external_message_replay',
    input.inboundReplayDeduped ? null : 'inbound_replay',
    input.duplicateInsertHandled ? null : 'duplicate_insert',
  ].filter((failure): failure is string => Boolean(failure))

  return {
    slug: 'noisy-channel-duplicate-memory-writes',
    area: 'duplicate_suppression',
    status: failures.length ? 'fail' : 'pass',
    summary: failures.length
      ? 'Noisy channel replays can still create duplicate memory work.'
      : 'Noisy channel replays are idempotent before memory extraction writes.',
    evidence: [`failures=${failures.join(',') || 'none'}`],
    nextAction: failures.length ? 'Fix idempotency keys or duplicate insert handling before production rollout.' : undefined,
  }
}

export function buildKnowledgeDegradedDependencyCheck(input: KnowledgeDegradedDependencyInput): KnowledgeProductionCheck {
  const degraded = [
    input.embeddingUnavailable ? 'embedding_unavailable' : null,
    input.ragTimedOut ? 'rag_timeout' : null,
    input.l2Unavailable ? 'l2_unavailable' : null,
    input.dbPoolPressure ? 'db_pool_pressure' : null,
  ].filter((entry): entry is string => Boolean(entry))
  const hotPathBlockedOnL2 = input.l2Unavailable && input.packet.telemetry.timedOut && input.packet.items.length === 0
  const overLatency = input.packet.telemetry.durationMs > input.packet.budget.maxLatencyMs
  const status: KnowledgeProductionStatus = hotPathBlockedOnL2 || (overLatency && input.packet.items.length === 0)
    ? 'fail'
    : degraded.length
      ? 'warn'
      : 'pass'

  return {
    slug: 'degraded-dependency-latency-budget',
    area: 'degraded_dependency',
    status,
    summary: status === 'pass'
      ? 'Knowledge recall is within latency budget with dependencies healthy.'
      : status === 'warn'
        ? 'Knowledge recall degraded gracefully and preserved bounded local context.'
        : 'Knowledge recall blocked or returned empty context under degraded dependencies.',
    evidence: [
      `degraded=${degraded.join(',') || 'none'}`,
      `durationMs=${input.packet.telemetry.durationMs}`,
      `maxLatencyMs=${input.packet.budget.maxLatencyMs}`,
      `items=${input.packet.items.length}`,
      `fallbackUsed=${input.packet.telemetry.fallbackUsed}`,
    ],
    nextAction: status === 'fail' ? 'Keep recent/local fallback active and ensure L2/proof backends stay off the hot recall path.' : undefined,
  }
}

export function buildKnowledgeRunbookCheck(availableRunbooks: string[]): KnowledgeProductionCheck {
  const available = new Set(availableRunbooks)
  const missing = KNOWLEDGE_PRODUCTION_RUNBOOKS.filter((runbook) => !available.has(runbook))

  return {
    slug: 'knowledge-production-runbooks',
    area: 'runbook',
    status: missing.length ? 'fail' : 'pass',
    summary: missing.length
      ? 'Knowledge production runbooks are incomplete.'
      : 'Knowledge production runbooks cover cleanup, eval regression, L2 failures, and accidental memory capture.',
    evidence: [`missing=${missing.join(',') || 'none'}`],
    nextAction: missing.length ? 'Add missing runbook sections before production promotion.' : undefined,
  }
}

export function buildKnowledgeProductionHardeningReport(
  checks: KnowledgeProductionCheck[],
): KnowledgeProductionHardeningReport {
  const blockingChecks = checks.filter((check) => check.status === 'fail' || check.status === 'manual_required')
  const hasManual = blockingChecks.some((check) => check.status === 'manual_required')
  const hasFail = blockingChecks.some((check) => check.status === 'fail')
  const hasWarn = checks.some((check) => check.status === 'warn')

  return {
    status: hasFail ? 'fail' : hasManual ? 'manual_required' : hasWarn ? 'warn' : 'pass',
    checks,
    blockingChecks,
  }
}
