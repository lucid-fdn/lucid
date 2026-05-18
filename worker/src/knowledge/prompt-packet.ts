import type {
  KnowledgeContextLadder,
  KnowledgeHotPacket,
  KnowledgeLayer,
  KnowledgePromptPacket,
  KnowledgePromptPacketItem,
} from './types.js'

const VERSION = '2026-05-06.knowledge-prompt-packet.v1' as const
const DEFAULT_MAX_PROMPT_TOKENS = 1200
const DEFAULT_MAX_ITEMS_PER_LAYER = 8
const DEFAULT_MAX_LATENCY_MS = 180

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

function safeKnowledgeContent(content: string): string {
  return content
    .replace(/<\/knowledge_context>/gi, '')
    .replace(/<\/org_knowledge>/gi, '')
    .trim()
}

function layerLabel(layer: KnowledgeLayer): string {
  return layer.replace(/_/g, ' ')
}

function scorePromptItem(item: Pick<KnowledgePromptPacketItem, 'trustLevel' | 'freshness' | 'citations'>): number {
  const trust = item.trustLevel === 'system' || item.trustLevel === 'l2_verified'
    ? 0.95
    : item.trustLevel === 'operator_approved'
      ? 0.9
      : item.trustLevel === 'observed'
        ? 0.65
        : 0.35
  const freshness = item.freshness === 'fresh'
    ? 1
    : item.freshness === 'aging'
      ? 0.85
      : item.freshness === 'stale'
        ? 0.45
        : 0.7
  const citationBoost = item.citations.length > 0 ? 0.08 : -0.08
  return Math.max(0, Math.min(1, Number((trust * 0.7 + freshness * 0.25 + citationBoost).toFixed(4))))
}

function itemFromLegacyMemory(layer: KnowledgeLayer, content: string, index: number): KnowledgePromptPacketItem | null {
  const safe = safeKnowledgeContent(content)
  if (!safe) return null
  return {
    id: `${layer}:${index}`,
    layer,
    label: layerLabel(layer),
    content: safe,
    citations: [],
    citationKeys: [],
    sourceLabel: null,
    freshness: 'unknown',
    trustLevel: layer === 'org_brain' ? 'system' : 'observed',
    tokenCost: estimateTokens(safe),
    confidence: scorePromptItem({
      trustLevel: layer === 'org_brain' ? 'system' : 'observed',
      freshness: 'unknown',
      citations: [],
    }),
  }
}

export function buildKnowledgeContextLadder(input: {
  orgId: string
  assistantId?: string | null
  channelType?: string | null
  channelId?: string | null
  conversationId?: string | null
}): KnowledgeContextLadder {
  return {
    orgId: input.orgId,
    assistantId: input.assistantId ?? null,
    channelType: input.channelType ?? null,
    channelId: input.channelId ?? null,
    conversationId: input.conversationId ?? null,
    policyHints: [],
  }
}

export function buildKnowledgeHotPacket(input: {
  sourceEventId?: string | null
  latestMessage?: string | null
}): KnowledgeHotPacket {
  return {
    sourceEventId: input.sourceEventId ?? null,
    latestMessage: input.latestMessage?.trim() || null,
    fallbackFetchRequired: false,
  }
}

export function buildKnowledgePromptPacketFromLegacyContext(input: {
  orgId: string
  assistantId?: string | null
  scopedUserId?: string | null
  memories: string[]
  boardMemories: string[]
  contextLadder?: KnowledgeContextLadder
  hotPacket?: KnowledgeHotPacket
  budget?: {
    maxLatencyMs?: number
    maxPromptTokens?: number
    maxItemsPerLayer?: number
  }
}): KnowledgePromptPacket {
  const maxPromptTokens = input.budget?.maxPromptTokens ?? DEFAULT_MAX_PROMPT_TOKENS
  const maxItemsPerLayer = input.budget?.maxItemsPerLayer ?? DEFAULT_MAX_ITEMS_PER_LAYER
  const rawItems = [
    ...input.memories.map((memory, index) => itemFromLegacyMemory('assistant_memory', memory, index)),
    ...input.boardMemories.map((memory, index) => itemFromLegacyMemory('org_brain', memory, index)),
  ].filter((item): item is KnowledgePromptPacketItem => Boolean(item))

  const items: KnowledgePromptPacketItem[] = []
  const omitted = new Map<KnowledgeLayer, number>()
  const perLayer = new Map<KnowledgeLayer, number>()
  let usedTokens = 0

  for (const item of rawItems) {
    const layerCount = perLayer.get(item.layer) ?? 0
    if (layerCount >= maxItemsPerLayer || usedTokens + item.tokenCost > maxPromptTokens) {
      omitted.set(item.layer, (omitted.get(item.layer) ?? 0) + 1)
      continue
    }

    perLayer.set(item.layer, layerCount + 1)
    usedTokens += item.tokenCost
    items.push(item)
  }

  const packet: KnowledgePromptPacket = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    orgId: input.orgId,
    assistantId: input.assistantId ?? null,
    scopedUserId: input.scopedUserId ?? null,
    mode: 'summary',
    budget: {
      maxLatencyMs: input.budget?.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS,
      maxPromptTokens,
      maxItemsPerLayer,
    },
    items,
    omitted: Array.from(omitted.entries()).map(([layer, count]) => ({
      layer,
      reason: 'budget' as const,
      count,
    })),
    telemetry: {
      durationMs: 0,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: {
        assistant_memory: input.memories.length,
        org_brain: input.boardMemories.length,
      },
    },
  }
  const totalTokenCost = items.reduce((sum, item) => sum + item.tokenCost, 0)
  const perLayerTokenCost: Partial<Record<KnowledgeLayer, number>> = {}
  for (const item of items) perLayerTokenCost[item.layer] = (perLayerTokenCost[item.layer] ?? 0) + item.tokenCost
  return {
    ...packet,
    layerUsage: Array.from(perLayer.entries()).map(([layer, itemCount]) => {
      const layerItems = items.filter((item) => item.layer === layer)
      return {
        layer,
        itemCount,
        citationCount: layerItems.reduce((sum, item) => sum + item.citations.length, 0),
        averageConfidence: layerItems.reduce((sum, item) => sum + (item.confidence ?? 0), 0) / Math.max(layerItems.length, 1),
        freshness: layerItems.some((item) => item.freshness === 'stale') ? 'stale' : layerItems.some((item) => item.freshness === 'fresh') ? 'fresh' : 'unknown',
      }
    }),
    contextExplanation: {
      latestMessage: input.hotPacket?.latestMessage ?? null,
      currentRunOrTask: null,
      project: null,
      team: null,
      orgPolicy: null,
      owner: null,
      blockers: [],
      nextAction: null,
      policyHints: input.contextLadder?.policyHints ?? [],
    },
    quality: {
      confidence: items.reduce((sum, item) => sum + (item.confidence ?? 0), 0) / Math.max(items.length, 1),
      citationCoverage: items.length === 0 ? 1 : items.filter((item) => item.citations.length > 0).length / items.length,
      freshness: items.some((item) => item.freshness === 'stale') ? 'stale' : items.some((item) => item.freshness === 'fresh') ? 'fresh' : 'unknown',
      l2ProofCount: 0,
      contradictionCount: 0,
    },
    costControls: {
      totalTokenCost,
      perLayerTokenCost,
      maxPromptTokens,
      budgetUtilization: maxPromptTokens <= 0 ? 1 : totalTokenCost / maxPromptTokens,
      exceeded: totalTokenCost > maxPromptTokens,
      recommendedAction: totalTokenCost <= maxPromptTokens * 0.75 ? 'ok' : totalTokenCost <= maxPromptTokens ? 'tighten_layer_budget' : 'summarize_or_archive_sources',
    },
  }
}

export function renderKnowledgePromptPacket(packet: KnowledgePromptPacket): string {
  if (packet.items.length === 0) return ''

  const lines = ['\n\n## Knowledge Context', '<knowledge_context>']
  for (const item of packet.items) {
    const source = item.sourceLabel ? `; source=${item.sourceLabel}` : ''
    const freshness = item.freshness && item.freshness !== 'unknown' ? `; freshness=${item.freshness}` : ''
    const citations = item.citationKeys?.length ? `; citations=${item.citationKeys.join(',')}` : ''
    const confidence = typeof item.confidence === 'number' ? `; confidence=${Math.round(item.confidence * 100)}%` : ''
    lines.push(`- [${item.label}; trust=${item.trustLevel}${confidence}${source}${freshness}${citations}] ${item.content}`)
  }
  lines.push('</knowledge_context>')
  return lines.join('\n')
}

export function packetItemsForPromptMemory(packet: KnowledgePromptPacket): string[] {
  return packet.items.map((item) => {
    const source = item.sourceLabel ? `; source=${item.sourceLabel}` : ''
    const freshness = item.freshness && item.freshness !== 'unknown' ? `; freshness=${item.freshness}` : ''
    const citations = item.citationKeys?.length ? `; citations=${item.citationKeys.join(',')}` : ''
    const confidence = typeof item.confidence === 'number' ? `; confidence=${Math.round(item.confidence * 100)}%` : ''
    return `[${item.label}; trust=${item.trustLevel}${confidence}${source}${freshness}${citations}] ${item.content}`
  })
}
