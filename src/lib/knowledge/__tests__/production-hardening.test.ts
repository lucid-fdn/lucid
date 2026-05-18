import { describe, expect, it } from 'vitest'

import { fuseKnowledgeCandidates, type KnowledgeFusionCandidate } from '../hybrid-retrieval'
import { buildKnowledgePromptPacket } from '../prompt-packet'
import {
  KNOWLEDGE_PRODUCTION_RUNBOOKS,
  KNOWLEDGE_REQUIRED_PRODUCTION_MIGRATIONS,
  buildKnowledgeDegradedDependencyCheck,
  buildKnowledgeDuplicateSuppressionCheck,
  buildKnowledgeMigrationRlsCheck,
  buildKnowledgeProductionHardeningReport,
  buildKnowledgeQueueBackpressureCheck,
  buildKnowledgeRetrievalLoadCheck,
  buildKnowledgeRunbookCheck,
} from '../production-hardening'
import type { KnowledgeLayer } from '../types'

describe('Knowledge production hardening gates', () => {
  it('stress-checks mixed retrieval while keeping prompt packets bounded', () => {
    const candidates = buildMixedCandidates(600)
    const fusion = fuseKnowledgeCandidates(candidates, {
      limit: 40,
      graphExpansions: [
        { entityId: 'entity-1', entityType: 'project', canonicalName: 'Checkout', relationshipCount: 5, confidence: 0.9 },
      ],
    })
    const packet = buildKnowledgePromptPacket({
      orgId: 'org-1',
      projectId: 'project-1',
      teamId: 'team-1',
      assistantId: 'assistant-1',
      scopedUserId: 'org:user',
      query: 'checkout browser qa policy',
      budget: {
        maxPromptTokens: 900,
        maxItemsPerLayer: 4,
      },
    }, fusion.items, {
      durationMs: 72,
      retrievalCounts: fusion.telemetry.layerCounts,
    })

    const check = buildKnowledgeRetrievalLoadCheck({
      packet,
      durationMs: 72,
      maxDurationMs: 180,
      expectedLayers: ['assistant_memory', 'team_brain', 'project_brain', 'org_brain', 'rag'],
    })

    expect(fusion.telemetry.inputCount).toBe(600)
    expect(packet.items.length).toBeLessThanOrEqual(20)
    expect(packet.costControls?.exceeded).toBe(false)
    expect(check.status).toBe('pass')
  })

  it('blocks production readiness when migrations or runbooks are missing', () => {
    const migrationCheck = buildKnowledgeMigrationRlsCheck(KNOWLEDGE_REQUIRED_PRODUCTION_MIGRATIONS.slice(0, -1))
    const runbookCheck = buildKnowledgeRunbookCheck(KNOWLEDGE_PRODUCTION_RUNBOOKS.slice(0, -1))
    const report = buildKnowledgeProductionHardeningReport([migrationCheck, runbookCheck])

    expect(migrationCheck.status).toBe('manual_required')
    expect(runbookCheck.status).toBe('fail')
    expect(report.status).toBe('fail')
    expect(report.blockingChecks.map((check) => check.slug)).toEqual(expect.arrayContaining([
      'migration-rls-staging-readiness',
      'knowledge-production-runbooks',
    ]))
  })

  it('recognizes noisy-channel duplicate suppression and queue pressure', () => {
    expect(buildKnowledgeDuplicateSuppressionCheck({
      externalMessageReplayDeduped: true,
      inboundReplayDeduped: true,
      duplicateInsertHandled: true,
    }).status).toBe('pass')

    const queueCheck = buildKnowledgeQueueBackpressureCheck({
      backlogDepth: 620,
      retryPressure: 0.31,
      oldestPendingAgeMs: 45 * 60 * 1000,
      deadLetterCount: 0,
    })

    expect(queueCheck.status).toBe('warn')
    expect(queueCheck.evidence.join(' ')).toContain('retry_pressure_high')
  })

  it('allows degraded dependencies only when hot recall remains bounded', () => {
    const degradedPacket = buildKnowledgePromptPacket({
      orgId: 'org-1',
      query: 'policy',
      budget: { maxLatencyMs: 180, maxPromptTokens: 500, maxItemsPerLayer: 3 },
    }, [candidate('fallback', 'org_brain', 'board_memory', 0.9, 'Org policy requires source citations.')], {
      durationMs: 95,
      fallbackUsed: true,
      retrievalCounts: { org_brain: 1 },
    })

    const warning = buildKnowledgeDegradedDependencyCheck({
      embeddingUnavailable: true,
      ragTimedOut: true,
      l2Unavailable: true,
      packet: degradedPacket,
    })
    expect(warning.status).toBe('warn')

    const blocked = buildKnowledgeDegradedDependencyCheck({
      l2Unavailable: true,
      packet: buildKnowledgePromptPacket({
        orgId: 'org-1',
        query: 'policy',
        budget: { maxLatencyMs: 180, maxPromptTokens: 500, maxItemsPerLayer: 3 },
      }, [], {
        durationMs: 500,
        timedOut: true,
        fallbackUsed: true,
      }),
    })
    expect(blocked.status).toBe('fail')
  })
})

function buildMixedCandidates(count: number): KnowledgeFusionCandidate[] {
  const layers: Array<{
    layer: KnowledgeLayer
    source: KnowledgeFusionCandidate['retrievalSource']
  }> = [
    { layer: 'assistant_memory', source: 'assistant_semantic' },
    { layer: 'team_brain', source: 'compiled_truth' },
    { layer: 'project_brain', source: 'compiled_truth' },
    { layer: 'org_brain', source: 'board_memory' },
    { layer: 'rag', source: 'rag_hybrid' },
  ]

  return Array.from({ length: count }, (_, index) => {
    const entry = layers[index % layers.length]!
    return candidate(
      `${entry.layer}-${index}`,
      entry.layer,
      entry.source,
      1 - (index % 50) / 100,
      `${entry.layer} checkout browser qa policy evidence ${index}`,
    )
  })
}

function candidate(
  id: string,
  layer: KnowledgeLayer,
  retrievalSource: KnowledgeFusionCandidate['retrievalSource'],
  score: number,
  content: string,
): KnowledgeFusionCandidate {
  return {
    id,
    layer,
    content,
    score,
    citations: [{ kind: 'run', runId: `run-${id}` }],
    trustLevel: layer === 'org_brain' ? 'system' : 'observed',
    freshness: 'fresh',
    tokenCost: Math.ceil(content.length / 4),
    retrievalSource,
    keywordScore: 0.8,
    metadata: { dedupKey: `${layer}:${id}` },
  }
}
