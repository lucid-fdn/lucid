import type {
  KnowledgeContextLadder,
  KnowledgeHotPacket,
  KnowledgeLayer,
  KnowledgePromptPacket,
  KnowledgePromptPacketItem,
  KnowledgeTrustLevel,
  RetrievedKnowledge,
} from './types'

export type MemoryCorrectionAction =
  | 'forget'
  | 'correct'
  | 'promote'
  | 'demote'
  | 'archive'
  | 'make_verifiable'

export interface KnowledgeLayerUsage {
  layer: KnowledgeLayer
  itemCount: number
  citationCount: number
  averageConfidence: number
  freshness: NonNullable<RetrievedKnowledge['freshness']>
}

export interface KnowledgeContextExplanation {
  latestMessage: string | null
  currentRunOrTask: string | null
  project: string | null
  team: string | null
  orgPolicy: string | null
  owner: string | null
  blockers: string[]
  nextAction: string | null
  policyHints: string[]
}

export interface KnowledgeQualitySummary {
  confidence: number
  citationCoverage: number
  freshness: NonNullable<RetrievedKnowledge['freshness']>
  l2ProofCount: number
  contradictionCount: number
}

export interface KnowledgeCostControlReport {
  totalTokenCost: number
  perLayerTokenCost: Partial<Record<KnowledgeLayer, number>>
  maxPromptTokens: number
  budgetUtilization: number
  exceeded: boolean
  recommendedAction: 'ok' | 'tighten_layer_budget' | 'summarize_or_archive_sources'
}

export interface KnowledgeContradiction {
  key: string
  severity: 'warning' | 'critical'
  summary: string
  itemIds: string[]
  layers: KnowledgeLayer[]
}

export interface KnowledgeContinuityMatrix {
  channels: Record<string, 'shared_knowledge_api' | 'unsupported'>
  runtimes: Record<string, 'knowledge_prompt_packet' | 'unsupported'>
  leakageGuards: string[]
}

const TRUST_CONFIDENCE: Record<KnowledgeTrustLevel, number> = {
  unverified: 0.35,
  observed: 0.65,
  operator_approved: 0.9,
  system: 0.95,
  l2_verified: 0.98,
}

const FRESHNESS_CONFIDENCE: Record<NonNullable<RetrievedKnowledge['freshness']>, number> = {
  fresh: 1,
  aging: 0.85,
  stale: 0.45,
  unknown: 0.7,
}

export function enrichKnowledgePromptPacket(
  packet: KnowledgePromptPacket,
  input?: {
    contextLadder?: KnowledgeContextLadder
    hotPacket?: KnowledgeHotPacket
    contradictions?: KnowledgeContradiction[]
  },
): KnowledgePromptPacket {
  const items = packet.items.map((item) => ({
    ...item,
    confidence: item.confidence ?? scoreKnowledgePromptItem(item),
  }))
  const contradictions = input?.contradictions ?? detectKnowledgeContradictions(items)
  return {
    ...packet,
    items,
    layerUsage: buildKnowledgeLayerUsage(items),
    contextExplanation: buildKnowledgeContextExplanation(input?.contextLadder, input?.hotPacket),
    quality: buildKnowledgeQualitySummary(items, contradictions),
    costControls: buildKnowledgeCostControlReport({ ...packet, items }),
  }
}

export function scoreKnowledgePromptItem(item: Pick<KnowledgePromptPacketItem, 'trustLevel' | 'freshness' | 'citations'>): number {
  const trust = TRUST_CONFIDENCE[item.trustLevel]
  const freshness = FRESHNESS_CONFIDENCE[item.freshness ?? 'unknown']
  const citationBoost = item.citations.length > 0 ? 0.08 : -0.08
  return clamp01(Number((trust * 0.7 + freshness * 0.25 + citationBoost).toFixed(4)))
}

export function buildKnowledgeLayerUsage(items: KnowledgePromptPacketItem[]): KnowledgeLayerUsage[] {
  const byLayer = new Map<KnowledgeLayer, KnowledgePromptPacketItem[]>()
  for (const item of items) {
    byLayer.set(item.layer, [...(byLayer.get(item.layer) ?? []), item])
  }
  return Array.from(byLayer.entries()).map(([layer, layerItems]) => ({
    layer,
    itemCount: layerItems.length,
    citationCount: layerItems.reduce((sum, item) => sum + item.citations.length, 0),
    averageConfidence: average(layerItems.map((item) => item.confidence ?? scoreKnowledgePromptItem(item))),
    freshness: dominantFreshness(layerItems.map((item) => item.freshness ?? 'unknown')),
  }))
}

export function buildKnowledgeContextExplanation(
  ladder?: KnowledgeContextLadder,
  hotPacket?: KnowledgeHotPacket,
): KnowledgeContextExplanation {
  const summaryByLayer = new Map((ladder?.summaries ?? []).map((summary) => [summary.layer, summary.text]))
  return {
    latestMessage: hotPacket?.latestMessage ?? null,
    currentRunOrTask: summaryByLayer.get('task') ?? summaryByLayer.get('workflow') ?? null,
    project: summaryByLayer.get('project') ?? null,
    team: summaryByLayer.get('team') ?? null,
    orgPolicy: summaryByLayer.get('org') ?? null,
    owner: ladder?.ownerUserId ?? null,
    blockers: hotPacket?.blockers ?? [],
    nextAction: hotPacket?.continuationSummary ?? hotPacket?.latestDelta ?? null,
    policyHints: ladder?.policyHints ?? [],
  }
}

export function buildKnowledgeQualitySummary(
  items: KnowledgePromptPacketItem[],
  contradictions: KnowledgeContradiction[] = detectKnowledgeContradictions(items),
): KnowledgeQualitySummary {
  const citationCoverage = items.length === 0 ? 1 : items.filter((item) => item.citations.length > 0).length / items.length
  return {
    confidence: average(items.map((item) => item.confidence ?? scoreKnowledgePromptItem(item))),
    citationCoverage,
    freshness: dominantFreshness(items.map((item) => item.freshness ?? 'unknown')),
    l2ProofCount: items.reduce((sum, item) => sum + item.citations.filter((citation) => citation.kind === 'l2_proof' || citation.l2ReceiptId).length, 0),
    contradictionCount: contradictions.length,
  }
}

export function buildKnowledgeCostControlReport(packet: Pick<KnowledgePromptPacket, 'items' | 'budget'>): KnowledgeCostControlReport {
  const perLayerTokenCost: Partial<Record<KnowledgeLayer, number>> = {}
  for (const item of packet.items) {
    perLayerTokenCost[item.layer] = (perLayerTokenCost[item.layer] ?? 0) + item.tokenCost
  }
  const totalTokenCost = packet.items.reduce((sum, item) => sum + item.tokenCost, 0)
  const budgetUtilization = packet.budget.maxPromptTokens <= 0 ? 1 : totalTokenCost / packet.budget.maxPromptTokens
  return {
    totalTokenCost,
    perLayerTokenCost,
    maxPromptTokens: packet.budget.maxPromptTokens,
    budgetUtilization,
    exceeded: totalTokenCost > packet.budget.maxPromptTokens,
    recommendedAction: budgetUtilization <= 0.75
      ? 'ok'
      : budgetUtilization <= 1
        ? 'tighten_layer_budget'
        : 'summarize_or_archive_sources',
  }
}

export function detectKnowledgeContradictions(items: KnowledgePromptPacketItem[]): KnowledgeContradiction[] {
  const claims = items.flatMap((item) => extractClaims(item).map((claim) => ({ ...claim, item })))
  const contradictions: KnowledgeContradiction[] = []
  for (const positive of claims.filter((claim) => claim.polarity === 'positive')) {
    const negatives = claims.filter((claim) => (
      claim.polarity === 'negative'
      && claim.key === positive.key
      && claim.item.id !== positive.item.id
    ))
    if (negatives.length === 0) continue
    const related = [positive, ...negatives]
    contradictions.push({
      key: positive.key,
      severity: related.some((claim) => claim.item.trustLevel === 'system' || claim.item.trustLevel === 'l2_verified') ? 'critical' : 'warning',
      summary: `Possible contradiction about "${positive.key}" across ${Array.from(new Set(related.map((claim) => claim.item.layer))).join(', ')}.`,
      itemIds: Array.from(new Set(related.map((claim) => claim.item.id))),
      layers: Array.from(new Set(related.map((claim) => claim.item.layer))),
    })
  }
  return dedupeContradictions(contradictions)
}

export function getMemoryCorrectionActions(input: {
  layer: KnowledgeLayer
  trustLevel?: KnowledgeTrustLevel
  hasL2Proof?: boolean
}): MemoryCorrectionAction[] {
  const actions = new Set<MemoryCorrectionAction>(['correct', 'archive'])
  if (input.layer === 'assistant_memory') actions.add('forget')
  if (input.layer === 'session' || input.layer === 'evidence') actions.add('promote')
  if (input.trustLevel === 'unverified' || input.trustLevel === 'observed') actions.add('demote')
  if (!input.hasL2Proof && input.layer !== 'session') actions.add('make_verifiable')
  return Array.from(actions)
}

export function buildKnowledgeContinuityMatrix(): KnowledgeContinuityMatrix {
  return {
    channels: {
      discord: 'shared_knowledge_api',
      telegram: 'shared_knowledge_api',
      slack: 'shared_knowledge_api',
      whatsapp: 'shared_knowledge_api',
      teams: 'shared_knowledge_api',
      web: 'shared_knowledge_api',
      imessage: 'shared_knowledge_api',
      future: 'shared_knowledge_api',
    },
    runtimes: {
      openclaw: 'knowledge_prompt_packet',
      hermes: 'knowledge_prompt_packet',
      browser_operator: 'knowledge_prompt_packet',
      shared: 'knowledge_prompt_packet',
      dedicated: 'knowledge_prompt_packet',
      byo_c2a: 'knowledge_prompt_packet',
      future: 'knowledge_prompt_packet',
    },
    leakageGuards: [
      'scopedUserId is required for assistant semantic memory',
      'source policy excludes archived, paused, errored, retrieval-disabled, and isolated sources',
      'engines receive KnowledgePromptPacket, not direct DB/RAG/L2 handles',
      'engine-home snapshots produce review candidates, not hot-path memory',
    ],
  }
}

export function buildKnowledgeBenchmarkSuite(): Array<{
  slug: string
  category: 'recall_quality' | 'evidence' | 'correction' | 'continuity' | 'latency'
  baseline: string
  lucidAssertion: string
}> {
  return [
    {
      slug: 'cross-channel-user-memory',
      category: 'continuity',
      baseline: 'Single-channel assistant memory only',
      lucidAssertion: 'Approved scoped memory is recalled through the same Knowledge API across Discord, Telegram, Slack, WhatsApp, Teams, web, and future channels without cross-user leakage.',
    },
    {
      slug: 'evidence-backed-project-fact',
      category: 'evidence',
      baseline: 'Uncited assistant recall',
      lucidAssertion: 'Project Brain answers include layer, source label, citation keys, freshness, trust, and confidence.',
    },
    {
      slug: 'safe-correction-loop',
      category: 'correction',
      baseline: 'Overwrite or append memory blindly',
      lucidAssertion: 'Forget, correct, promote, demote, archive, and make-verifiable actions preserve provenance, role gates, and audit state.',
    },
    {
      slug: 'degraded-proof-backend',
      category: 'latency',
      baseline: 'Memory recall blocks on proof backend availability',
      lucidAssertion: 'Hot recall remains local-first while Lucid-L2 projection and verification run asynchronously.',
    },
  ]
}

function extractClaims(item: KnowledgePromptPacketItem): Array<{ key: string; polarity: 'positive' | 'negative' }> {
  const normalized = item.content.toLowerCase().replace(/[^\w\s:-]/g, ' ').replace(/\s+/g, ' ').trim()
  const patterns = [
    /\b(.{3,80}?)\s+(?:is|are|uses|use|has|have|supports|support|requires|require)\s+not\b/g,
    /\b(.{3,80}?)\s+(?:does|do|can|should|must)\s+not\b/g,
    /\b(.{3,80}?)\s+(?:is|are|uses|use|has|have|supports|support|requires|require)\b/g,
  ]
  const claims: Array<{ key: string; polarity: 'positive' | 'negative' }> = []
  for (const [index, pattern] of patterns.entries()) {
    for (const match of normalized.matchAll(pattern)) {
      const key = normalizeClaimKey(match[1] ?? '')
      if (key.length >= 3) claims.push({ key, polarity: index < 2 ? 'negative' : 'positive' })
    }
  }
  return claims
}

function normalizeClaimKey(value: string): string {
  return value
    .replace(/\b(the|a|an|this|that|project|team|user|agent|lucid)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-80)
}

function dedupeContradictions(contradictions: KnowledgeContradiction[]): KnowledgeContradiction[] {
  const seen = new Set<string>()
  return contradictions.filter((contradiction) => {
    const key = `${contradiction.key}:${contradiction.itemIds.sort().join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dominantFreshness(values: Array<NonNullable<RetrievedKnowledge['freshness']>>): NonNullable<RetrievedKnowledge['freshness']> {
  if (values.includes('stale')) return 'stale'
  if (values.includes('aging')) return 'aging'
  if (values.includes('fresh')) return 'fresh'
  return 'unknown'
}

function average(values: number[]): number {
  const numeric = values.filter((value) => Number.isFinite(value))
  if (numeric.length === 0) return 0
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(4))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
