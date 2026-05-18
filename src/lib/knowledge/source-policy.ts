import type {
  KnowledgeFederationPolicy,
  KnowledgeRefreshPolicy,
  KnowledgeRefreshStatus,
  KnowledgeRetentionPolicy,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  KnowledgeTrustLevel,
  KnowledgeVisibility,
  RetrievedKnowledge,
} from './types'

export interface KnowledgeSourcePolicyInput {
  id: string
  type: KnowledgeSourceType
  visibility: KnowledgeVisibility
  trustLevel: KnowledgeTrustLevel
  federationPolicy: KnowledgeFederationPolicy
  retentionPolicy: KnowledgeRetentionPolicy
  status: KnowledgeSourceStatus
  includeInRetrieval: boolean
  refreshPolicy: KnowledgeRefreshPolicy
  refreshStatus: KnowledgeRefreshStatus
  lastSeenAt?: string | null
  lastRefreshedAt?: string | null
  staleAfter?: string | null
}

export interface KnowledgeSourcePolicyDecision {
  sourceId: string
  eligible: boolean
  hardExcluded: boolean
  reasons: string[]
  freshness: NonNullable<RetrievedKnowledge['freshness']>
  trustWeight: number
  freshnessWeight: number
  federationWeight: number
  scoreMultiplier: number
}

const TRUST_WEIGHTS: Record<KnowledgeTrustLevel, number> = {
  unverified: 0.55,
  observed: 0.75,
  operator_approved: 1,
  system: 1.08,
  l2_verified: 1.15,
}

const FEDERATION_WEIGHTS: Record<KnowledgeFederationPolicy, number> = {
  isolated: 0.85,
  source_scoped: 1,
  org_federated: 1.05,
}

export function evaluateKnowledgeSourcePolicy(
  source: KnowledgeSourcePolicyInput,
  options: { now?: Date; allowIsolated?: boolean } = {},
): KnowledgeSourcePolicyDecision {
  const reasons: string[] = []
  if (source.status === 'archived') reasons.push('source_archived')
  if (source.status === 'paused') reasons.push('source_paused')
  if (source.status === 'errored') reasons.push('source_errored')
  if (!source.includeInRetrieval) reasons.push('retrieval_disabled')
  if (source.federationPolicy === 'isolated' && !options.allowIsolated) reasons.push('source_isolated')

  const freshness = getSourceFreshness(source, options.now)
  const freshnessWeight = getFreshnessWeight(freshness)
  const trustWeight = TRUST_WEIGHTS[source.trustLevel]
  const federationWeight = FEDERATION_WEIGHTS[source.federationPolicy]
  const hardExcluded = reasons.length > 0

  return {
    sourceId: source.id,
    eligible: !hardExcluded,
    hardExcluded,
    reasons,
    freshness,
    trustWeight,
    freshnessWeight,
    federationWeight,
    scoreMultiplier: hardExcluded ? 0 : Number((trustWeight * freshnessWeight * federationWeight).toFixed(4)),
  }
}

export function getSourceFreshness(
  source: Pick<KnowledgeSourcePolicyInput, 'status' | 'lastRefreshedAt' | 'lastSeenAt' | 'staleAfter'>,
  now = new Date(),
): NonNullable<RetrievedKnowledge['freshness']> {
  if (source.status === 'stale') return 'stale'
  if (source.staleAfter && Date.parse(source.staleAfter) <= now.getTime()) return 'stale'

  const reference = source.lastRefreshedAt ?? source.lastSeenAt
  if (!reference) return 'unknown'

  const ageMs = now.getTime() - Date.parse(reference)
  if (!Number.isFinite(ageMs)) return 'unknown'
  if (ageMs <= 1000 * 60 * 60 * 24 * 7) return 'fresh'
  if (ageMs <= 1000 * 60 * 60 * 24 * 45) return 'aging'
  return 'stale'
}

function getFreshnessWeight(freshness: NonNullable<RetrievedKnowledge['freshness']>): number {
  switch (freshness) {
    case 'fresh':
      return 1
    case 'aging':
      return 0.9
    case 'stale':
      return 0.65
    case 'unknown':
      return 0.8
  }
}
