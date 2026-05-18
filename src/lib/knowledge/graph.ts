import type { KnowledgeEntityType, KnowledgeRelationshipType, RetrievedKnowledge } from './types'

export interface ExtractedKnowledgeEntity {
  type: KnowledgeEntityType
  canonicalName: string
  normalizedName: string
  aliases: string[]
  confidence: number
  metadata: Record<string, unknown>
}

export interface ExtractedKnowledgeRelationship {
  sourceNormalizedName: string
  targetNormalizedName: string
  relationType: KnowledgeRelationshipType
  confidence: number
  metadata: Record<string, unknown>
}

export interface GraphExpansionCandidate {
  entityId: string
  entityType: KnowledgeEntityType
  canonicalName: string
  relationshipCount: number
  confidence: number
}

const INTEGRATIONS = [
  'Slack',
  'Discord',
  'Telegram',
  'WhatsApp',
  'Teams',
  'iMessage',
  'Vercel',
  'Railway',
  'Supabase',
  'Stripe',
  'GitHub',
  'Linear',
  'OpenClaw',
  'Hermes',
  'Lucid-L2',
  'Browser Operator',
  'Agent Ops',
]

export function normalizeKnowledgeEntityName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9./#@:_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export function extractKnowledgeEntitiesFromText(text: string): ExtractedKnowledgeEntity[] {
  const entities = new Map<string, ExtractedKnowledgeEntity>()
  const add = (type: KnowledgeEntityType, name: string, confidence: number, metadata: Record<string, unknown> = {}) => {
    const canonicalName = name.trim().replace(/\s+/g, ' ').slice(0, 240)
    const normalizedName = normalizeKnowledgeEntityName(canonicalName)
    if (!canonicalName || !normalizedName) return
    const key = `${type}:${normalizedName}`
    const existing = entities.get(key)
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence)
      return
    }
    entities.set(key, {
      type,
      canonicalName,
      normalizedName,
      aliases: [],
      confidence,
      metadata,
    })
  }

  for (const match of text.matchAll(/https?:\/\/[^\s)]+/gi)) add('url', match[0], 0.92)
  for (const match of text.matchAll(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/g)) add('repo', match[0], 0.82)
  for (const match of text.matchAll(/\b(?:PR|pull request)\s*#?(\d{1,7})\b/gi)) add('pull_request', `PR #${match[1]}`, 0.78)
  for (const match of text.matchAll(/#[a-z0-9][a-z0-9_-]{1,80}\b/gi)) add('channel', match[0], 0.72)

  for (const name of INTEGRATIONS) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text)) {
      add(name.includes('Operator') || name.includes('Agent Ops') ? 'agent' : 'integration', name, 0.86)
    }
  }

  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3}\s+(?:Agent|Assistant|Specialist|Operator))\b/g)) {
    add('agent', match[1], 0.74)
  }

  for (const match of text.matchAll(/\b(?:decision|decided|we will|we chose|approved):?\s+([^.\n]{8,160})/gi)) {
    add('decision', match[1], 0.68)
  }

  return Array.from(entities.values())
}

export function inferKnowledgeRelationships(entities: ExtractedKnowledgeEntity[]): ExtractedKnowledgeRelationship[] {
  const relationships: ExtractedKnowledgeRelationship[] = []
  const unique = entities.filter((entity) => entity.normalizedName)
  for (const source of unique) {
    for (const target of unique) {
      if (source.normalizedName === target.normalizedName) continue
      const relationType = inferRelationshipType(source.type, target.type)
      if (!relationType) continue
      relationships.push({
        sourceNormalizedName: source.normalizedName,
        targetNormalizedName: target.normalizedName,
        relationType,
        confidence: Math.min(source.confidence, target.confidence, 0.72),
        metadata: { inferred: true },
      })
    }
  }
  return relationships.slice(0, 80)
}

export function graphExpansionBoost(
  item: RetrievedKnowledge,
  expansions: GraphExpansionCandidate[],
): number {
  if (expansions.length === 0) return item.score
  const normalized = normalizeKnowledgeEntityName(`${item.content} ${item.source?.label ?? ''}`)
  const boost = expansions.reduce((sum, entity) => {
    if (!normalized.includes(entity.canonicalName.toLowerCase()) && !normalized.includes(normalizeKnowledgeEntityName(entity.canonicalName))) {
      return sum
    }
    return sum + Math.min(0.08, entity.confidence * 0.04 + Math.min(entity.relationshipCount, 5) * 0.005)
  }, 0)
  return Number((item.score + boost).toFixed(6))
}

function inferRelationshipType(
  sourceType: KnowledgeEntityType,
  targetType: KnowledgeEntityType,
): KnowledgeRelationshipType | null {
  if (sourceType === 'agent' && targetType === 'integration') return 'uses'
  if (sourceType === 'agent' && targetType === 'project') return 'works_on'
  if (sourceType === 'decision') return 'mentions'
  if (sourceType === 'pull_request' && targetType === 'repo') return 'depends_on'
  if (sourceType === 'repo' && targetType === 'integration') return 'uses'
  if (sourceType === 'channel' && targetType === 'agent') return 'mentions'
  if (sourceType !== targetType) return 'relates_to'
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
