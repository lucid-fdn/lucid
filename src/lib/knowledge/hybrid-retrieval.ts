import crypto from 'node:crypto'

import { graphExpansionBoost, type GraphExpansionCandidate } from './graph'
import type { KnowledgeLayer, RetrievedKnowledge } from './types'

export interface KnowledgeFusionCandidate extends RetrievedKnowledge {
  retrievalSource: 'assistant_semantic' | 'compiled_truth' | 'claims' | 'rag_hybrid' | 'board_memory'
  sourcePolicyMultiplier?: number
  keywordScore?: number
}

export interface KnowledgeFusionResult {
  items: RetrievedKnowledge[]
  telemetry: {
    inputCount: number
    outputCount: number
    dedupedCount: number
    sourceCounts: Record<string, number>
    layerCounts: Partial<Record<KnowledgeLayer, number>>
  }
}

const RRF_K = 60

export function fuseKnowledgeCandidates(
  candidates: KnowledgeFusionCandidate[],
  options: { limit?: number; graphExpansions?: GraphExpansionCandidate[] } = {},
): KnowledgeFusionResult {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50)
  const sourceCounts: Record<string, number> = {}
  const layerCounts: Partial<Record<KnowledgeLayer, number>> = {}
  const bySource = new Map<KnowledgeFusionCandidate['retrievalSource'], KnowledgeFusionCandidate[]>()

  for (const candidate of candidates.filter((item) => item.content.trim().length > 0)) {
    sourceCounts[candidate.retrievalSource] = (sourceCounts[candidate.retrievalSource] ?? 0) + 1
    layerCounts[candidate.layer] = (layerCounts[candidate.layer] ?? 0) + 1
    const list = bySource.get(candidate.retrievalSource) ?? []
    list.push(candidate)
    bySource.set(candidate.retrievalSource, list)
  }

  const fused = new Map<string, KnowledgeFusionCandidate & { fusionScore: number }>()
  for (const list of bySource.values()) {
    list
      .sort((a, b) => b.score - a.score)
      .forEach((candidate, index) => {
        const dedupKey = buildDedupKey(candidate)
        const existing = fused.get(dedupKey)
        const rankScore = 1 / (RRF_K + index + 1)
        const keywordBoost = Math.min(candidate.keywordScore ?? 0, 1) * 0.04
        const scoreBoost = Math.min(Math.max(candidate.score, 0), 1) * 0.02
        const sourceMultiplier = candidate.sourcePolicyMultiplier ?? 1
        const fusionScore = (existing?.fusionScore ?? 0) + ((rankScore + keywordBoost + scoreBoost) * sourceMultiplier)

        if (!existing || candidate.score > existing.score) {
          fused.set(dedupKey, { ...candidate, fusionScore })
        } else {
          existing.fusionScore = fusionScore
        }
      })
  }

  const items = Array.from(fused.values())
    .map(({ retrievalSource: _retrievalSource, sourcePolicyMultiplier: _sourcePolicyMultiplier, keywordScore: _keywordScore, fusionScore, ...item }) => {
      const baseScore = Number(fusionScore.toFixed(6))
      return {
        ...item,
        score: graphExpansionBoost({ ...item, score: baseScore }, options.graphExpansions ?? []),
        metadata: {
          ...(item.metadata ?? {}),
          fusionScore: baseScore,
          graphBoosted: Boolean(options.graphExpansions?.length),
        },
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return {
    items,
    telemetry: {
      inputCount: candidates.length,
      outputCount: items.length,
      dedupedCount: Math.max(candidates.length - fused.size, 0),
      sourceCounts,
      layerCounts,
    },
  }
}

export function keywordScore(query: string, content: string): number {
  const queryTerms = tokenize(query)
  if (queryTerms.length === 0) return 0
  const contentTerms = new Set(tokenize(content))
  const matches = queryTerms.filter((term) => contentTerms.has(term)).length
  return Number((matches / queryTerms.length).toFixed(4))
}

function buildDedupKey(candidate: RetrievedKnowledge): string {
  const canonical = candidate.metadata?.dedupKey
  if (typeof canonical === 'string' && canonical.trim()) {
    return canonical
  }

  const explicit = candidate.metadata?.pageId
    ?? candidate.metadata?.documentId
    ?? candidate.metadata?.memoryId
    ?? candidate.id
  if (typeof explicit === 'string' && explicit.trim()) {
    return `${candidate.layer}:${explicit}`
  }
  return `${candidate.layer}:${crypto.createHash('sha256').update(normalize(candidate.content)).digest('hex')}`
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((term) => term.length >= 3)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
