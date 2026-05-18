import crypto from 'node:crypto'
import type { KnowledgePromptPacket } from './types'

export type KnowledgeRetrievalEvalCategory =
  | 'preference'
  | 'project_fact'
  | 'org_policy'
  | 'source_conflict'
  | 'evidence_heavy'

export type KnowledgeRetrievalFailureType =
  | 'missing_source'
  | 'wrong_source'
  | 'stale_fact'
  | 'cross_scope_leak'
  | 'no_citation'
  | 'bad_citation'
  | 'slow_retrieval'

export interface KnowledgeRetrievalExpectations {
  expectedItemIds?: string[]
  expectedCitationKeys?: string[]
  baselineTopItemId?: string | null
  baselineLatencyMs?: number | null
  maxLatencyMs?: number | null
}

export interface KnowledgeRetrievalEvalMetrics {
  precisionAtK: number | null
  recallAtK: number | null
  mrr: number | null
  ndcg: number | null
  citationAccuracy: number | null
  top1Stable: boolean | null
  latencyDeltaMs: number | null
  failureTypes: KnowledgeRetrievalFailureType[]
}

export function evaluateKnowledgeRetrieval(
  packet: KnowledgePromptPacket,
  expectations: KnowledgeRetrievalExpectations,
): KnowledgeRetrievalEvalMetrics {
  const resultIds = packet.items.map((item) => item.id)
  const expectedIds = new Set(expectations.expectedItemIds ?? [])
  const expectedCitationKeys = new Set(expectations.expectedCitationKeys ?? [])
  const citationKeys = new Set(packet.items.flatMap((item) => item.citationKeys))
  const hits = resultIds.filter((id) => expectedIds.has(id))

  const precisionAtK = expectedIds.size > 0
    ? safeRatio(hits.length, Math.max(resultIds.length, 1))
    : null
  const recallAtK = expectedIds.size > 0
    ? safeRatio(hits.length, expectedIds.size)
    : null
  const mrr = expectedIds.size > 0
    ? reciprocalRank(resultIds, expectedIds)
    : null
  const ndcg = expectedIds.size > 0
    ? normalizedDiscountedCumulativeGain(resultIds, expectedIds)
    : null
  const citationHits = Array.from(expectedCitationKeys).filter((key) => citationKeys.has(key))
  const citationAccuracy = expectedCitationKeys.size > 0
    ? safeRatio(citationHits.length, expectedCitationKeys.size)
    : packet.items.length > 0
      ? safeRatio(packet.items.filter((item) => item.citationKeys.length > 0).length, packet.items.length)
      : null
  const top1Stable = expectations.baselineTopItemId
    ? resultIds[0] === expectations.baselineTopItemId
    : null
  const latencyDeltaMs = expectations.baselineLatencyMs == null
    ? null
    : packet.telemetry.durationMs - expectations.baselineLatencyMs

  const failureTypes = classifyKnowledgeRetrievalFailures({
    packet,
    expectedIds,
    expectedCitationKeys,
    precisionAtK,
    recallAtK,
    citationAccuracy,
    maxLatencyMs: expectations.maxLatencyMs,
  })

  return {
    precisionAtK,
    recallAtK,
    mrr,
    ndcg,
    citationAccuracy,
    top1Stable,
    latencyDeltaMs,
    failureTypes,
  }
}

export function scrubKnowledgeEvalQuery(query: string): { hash: string; preview: string } {
  const scrubbed = query
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[phone]')
    .replace(/\b(?:sk|pk|rk|xox[baprs]|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, '[secret]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[hash]')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    hash: crypto.createHash('sha256').update(scrubbed.toLowerCase()).digest('hex'),
    preview: scrubbed.slice(0, 240),
  }
}

export function summarizeKnowledgeRetrievalEvalResults(results: KnowledgeRetrievalEvalMetrics[]): {
  caseCount: number
  precisionAtK: number | null
  recallAtK: number | null
  mrr: number | null
  ndcg: number | null
  citationAccuracy: number | null
  top1Stability: number | null
  failureCounts: Record<KnowledgeRetrievalFailureType, number>
} {
  const failureCounts = {} as Record<KnowledgeRetrievalFailureType, number>
  for (const result of results) {
    for (const failure of result.failureTypes) {
      failureCounts[failure] = (failureCounts[failure] ?? 0) + 1
    }
  }

  return {
    caseCount: results.length,
    precisionAtK: averageNullable(results.map((result) => result.precisionAtK)),
    recallAtK: averageNullable(results.map((result) => result.recallAtK)),
    mrr: averageNullable(results.map((result) => result.mrr)),
    ndcg: averageNullable(results.map((result) => result.ndcg)),
    citationAccuracy: averageNullable(results.map((result) => result.citationAccuracy)),
    top1Stability: averageNullable(results.map((result) => result.top1Stable == null ? null : result.top1Stable ? 1 : 0)),
    failureCounts,
  }
}

function classifyKnowledgeRetrievalFailures(input: {
  packet: KnowledgePromptPacket
  expectedIds: Set<string>
  expectedCitationKeys: Set<string>
  precisionAtK: number | null
  recallAtK: number | null
  citationAccuracy: number | null
  maxLatencyMs?: number | null
}): KnowledgeRetrievalFailureType[] {
  const failures = new Set<KnowledgeRetrievalFailureType>()
  if (input.expectedIds.size > 0 && (input.recallAtK ?? 0) === 0) failures.add('missing_source')
  if (input.expectedIds.size > 0 && (input.precisionAtK ?? 1) < 0.5) failures.add('wrong_source')
  if (input.packet.items.some((item) => item.freshness === 'stale')) failures.add('stale_fact')
  if (input.packet.items.some((item) => item.citations.length === 0)) failures.add('no_citation')
  if (input.expectedCitationKeys.size > 0 && (input.citationAccuracy ?? 0) < 1) failures.add('bad_citation')
  if (input.maxLatencyMs && input.packet.telemetry.durationMs > input.maxLatencyMs) failures.add('slow_retrieval')
  return Array.from(failures)
}

function reciprocalRank(resultIds: string[], expectedIds: Set<string>): number {
  const index = resultIds.findIndex((id) => expectedIds.has(id))
  return index === -1 ? 0 : 1 / (index + 1)
}

function normalizedDiscountedCumulativeGain(resultIds: string[], expectedIds: Set<string>): number {
  const dcg = resultIds.reduce((sum, id, index) => {
    if (!expectedIds.has(id)) return sum
    return sum + 1 / Math.log2(index + 2)
  }, 0)
  const idealLength = Math.min(expectedIds.size, resultIds.length)
  const idcg = Array.from({ length: idealLength }).reduce<number>((sum, _value, index) => (
    sum + 1 / Math.log2(index + 2)
  ), 0)
  return idcg === 0 ? 0 : dcg / idcg
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator
}

function averageNullable(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}
