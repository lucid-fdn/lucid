import type { KnowledgeLayer } from './types'

export interface KnowledgeStagingLoadSample {
  query: string
  durationMs: number
  itemCount: number
  timedOut: boolean
  fallbackUsed: boolean
  retrievalCounts: Partial<Record<KnowledgeLayer, number>>
  error?: string | null
}

export interface KnowledgeStagingLoadThresholds {
  maxP95Ms: number
  maxFailureRate: number
  allowEmptyPackets?: boolean
  requiredLayers?: KnowledgeLayer[]
}

export interface KnowledgeStagingLoadReport {
  status: 'pass' | 'fail'
  sampleCount: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  failureRate: number
  emptyPackets: number
  timedOutPackets: number
  fallbackPackets: number
  layerCounts: Partial<Record<KnowledgeLayer, number>>
  missingRequiredLayers: KnowledgeLayer[]
  blockingReasons: string[]
}

export function buildKnowledgeStagingLoadReport(
  samples: KnowledgeStagingLoadSample[],
  thresholds: KnowledgeStagingLoadThresholds,
): KnowledgeStagingLoadReport {
  const sampleCount = samples.length
  const durations = samples.map((sample) => sample.durationMs).filter(Number.isFinite)
  const failures = samples.filter((sample) => Boolean(sample.error))
  const emptyPackets = samples.filter((sample) => !sample.error && sample.itemCount === 0).length
  const timedOutPackets = samples.filter((sample) => sample.timedOut).length
  const fallbackPackets = samples.filter((sample) => sample.fallbackUsed).length
  const layerCounts = mergeLayerCounts(samples)
  const missingRequiredLayers = (thresholds.requiredLayers ?? []).filter((layer) => !layerCounts[layer])
  const p95Ms = percentile(durations, 0.95)
  const failureRate = sampleCount === 0 ? 1 : failures.length / sampleCount
  const blockingReasons = [
    sampleCount === 0 ? 'no_samples' : null,
    p95Ms > thresholds.maxP95Ms ? 'p95_latency_over_budget' : null,
    failureRate > thresholds.maxFailureRate ? 'failure_rate_over_budget' : null,
    !thresholds.allowEmptyPackets && emptyPackets > 0 ? 'empty_packets_present' : null,
    timedOutPackets > 0 ? 'timeouts_present' : null,
    missingRequiredLayers.length > 0 ? `missing_layers:${missingRequiredLayers.join(',')}` : null,
  ].filter((reason): reason is string => Boolean(reason))

  return {
    status: blockingReasons.length > 0 ? 'fail' : 'pass',
    sampleCount,
    p50Ms: percentile(durations, 0.5),
    p95Ms,
    maxMs: durations.length ? Math.max(...durations) : 0,
    failureRate,
    emptyPackets,
    timedOutPackets,
    fallbackPackets,
    layerCounts,
    missingRequiredLayers,
    blockingReasons,
  }
}

function mergeLayerCounts(samples: KnowledgeStagingLoadSample[]): Partial<Record<KnowledgeLayer, number>> {
  const counts: Partial<Record<KnowledgeLayer, number>> = {}
  for (const sample of samples) {
    for (const [layer, count] of Object.entries(sample.retrievalCounts)) {
      counts[layer as KnowledgeLayer] = (counts[layer as KnowledgeLayer] ?? 0) + Number(count ?? 0)
    }
  }
  return counts
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[index] ?? 0
}
