import type {
  KnowledgeLayer,
  KnowledgePromptPacket,
  KnowledgePromptPacketItem,
  RetrievedKnowledge,
  RetrieveKnowledgeContextInput,
} from './types'
import { enrichKnowledgePromptPacket, scoreKnowledgePromptItem } from './memory-moat'

export const KNOWLEDGE_PROMPT_PACKET_VERSION = '2026-05-06.knowledge-prompt-packet.v1' as const

const DEFAULT_MAX_LATENCY_MS = 180
const DEFAULT_MAX_PROMPT_TOKENS = 1200
const DEFAULT_MAX_ITEMS_PER_LAYER = 5

function estimateTokenCost(content: string): number {
  return Math.ceil(content.length / 4)
}

function layerLabel(layer: KnowledgeLayer): string {
  return layer.replace(/_/g, ' ')
}

function safeKnowledgeContent(content: string): string {
  return content
    .replace(/<\/knowledge_context>/gi, '')
    .replace(/<\/org_knowledge>/gi, '')
    .trim()
}

export function buildKnowledgePromptPacket(
  input: RetrieveKnowledgeContextInput,
  retrieved: RetrievedKnowledge[],
  telemetry?: Partial<KnowledgePromptPacket['telemetry']>,
): KnowledgePromptPacket {
  const maxPromptTokens = input.budget?.maxPromptTokens ?? DEFAULT_MAX_PROMPT_TOKENS
  const maxItemsPerLayer = input.budget?.maxItemsPerLayer ?? DEFAULT_MAX_ITEMS_PER_LAYER
  const retrievalCounts: Partial<Record<KnowledgeLayer, number>> = {}
  const perLayerCounts: Partial<Record<KnowledgeLayer, number>> = {}
  const omitted = new Map<KnowledgeLayer, { reason: 'budget' | 'timeout' | 'policy' | 'unavailable' | 'empty'; count: number }>()
  const items: KnowledgePromptPacketItem[] = []
  let usedTokens = 0

  for (const item of retrieved) {
    retrievalCounts[item.layer] = (retrievalCounts[item.layer] ?? 0) + 1

    const layerCount = perLayerCounts[item.layer] ?? 0
    if (layerCount >= maxItemsPerLayer) {
      const current = omitted.get(item.layer)
      omitted.set(item.layer, { reason: 'budget', count: (current?.count ?? 0) + 1 })
      continue
    }

    const safeContent = safeKnowledgeContent(item.content)
    if (!safeContent) continue

    const tokenCost = item.tokenCost || estimateTokenCost(safeContent)
    if (usedTokens + tokenCost > maxPromptTokens) {
      const current = omitted.get(item.layer)
      omitted.set(item.layer, { reason: 'budget', count: (current?.count ?? 0) + 1 })
      continue
    }

    usedTokens += tokenCost
    perLayerCounts[item.layer] = layerCount + 1
    items.push({
      id: item.id,
      layer: item.layer,
      label: layerLabel(item.layer),
      content: safeContent,
      citations: item.citations,
      citationKeys: item.citations.map((citation, index) => buildCitationKey(citation, index)),
      sourceLabel: item.source?.label ?? item.source?.type ?? null,
      freshness: item.freshness ?? 'unknown',
      trustLevel: item.trustLevel,
      tokenCost,
      confidence: scoreKnowledgePromptItem({
        trustLevel: item.trustLevel,
        freshness: item.freshness ?? 'unknown',
        citations: item.citations,
      }),
    })
  }

  return enrichKnowledgePromptPacket({
    version: KNOWLEDGE_PROMPT_PACKET_VERSION,
    generatedAt: new Date().toISOString(),
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    teamId: input.teamId ?? null,
    assistantId: input.assistantId ?? null,
    scopedUserId: input.scopedUserId ?? null,
    mode: input.mode ?? 'summary',
    budget: {
      maxLatencyMs: input.budget?.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS,
      maxPromptTokens,
      maxItemsPerLayer,
    },
    items,
    omitted: Array.from(omitted.entries()).map(([layer, entry]) => ({
      layer,
      reason: entry.reason,
      count: entry.count,
    })),
    telemetry: {
      durationMs: telemetry?.durationMs ?? 0,
      timedOut: telemetry?.timedOut ?? false,
      fallbackUsed: telemetry?.fallbackUsed ?? false,
      retrievalCounts: {
        ...retrievalCounts,
        ...telemetry?.retrievalCounts,
      },
    },
  }, {
    contextLadder: input.contextLadder,
    hotPacket: input.hotPacket,
  })
}

export function renderKnowledgePromptPacket(packet: KnowledgePromptPacket): string {
  if (packet.items.length === 0) return ''

  const lines = ['<knowledge_context>']
  for (const item of packet.items) {
    const source = item.sourceLabel ? `; source=${item.sourceLabel}` : ''
    const freshness = item.freshness && item.freshness !== 'unknown' ? `; freshness=${item.freshness}` : ''
    const citations = item.citationKeys.length > 0 ? `; citations=${item.citationKeys.join(',')}` : ''
    const confidence = typeof item.confidence === 'number' ? `; confidence=${Math.round(item.confidence * 100)}%` : ''
    lines.push(`- [${item.label}; trust=${item.trustLevel}${confidence}${source}${freshness}${citations}] ${item.content}`)
  }
  lines.push('</knowledge_context>')
  return lines.join('\n')
}

function buildCitationKey(citation: RetrievedKnowledge['citations'][number], index: number): string {
  if (citation.id) return citation.id
  if (citation.runId) return `run:${citation.runId}`
  if (citation.channelEventId) return `channel:${citation.channelEventId}`
  if (citation.messageId) return `message:${citation.messageId}`
  if (citation.artifactId) return `artifact:${citation.artifactId}`
  if (citation.url) return `url:${citation.url}`
  if (citation.l2ReceiptId) return `l2:${citation.l2ReceiptId}`
  return `${citation.kind}:${index + 1}`
}
