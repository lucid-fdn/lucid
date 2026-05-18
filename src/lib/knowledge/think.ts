import 'server-only'

import { globalSearch } from '@/lib/search/global-search'
import { createKnowledgeClaim, listKnowledgeClaims } from '@/lib/db/knowledge-claims'
import { queryBrain } from '@/lib/brain/query'
import type { KnowledgeLayer, KnowledgePromptPacket } from './types'

export interface KnowledgeThinkInput {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
  query: string
  mode?: 'answer' | 'compare' | 'decision' | 'risk'
  persistClaim?: boolean
  createdByUserId?: string | null
}

export interface KnowledgeThinkResult {
  query: string
  mode: NonNullable<KnowledgeThinkInput['mode']>
  summary: string
  findings: Array<{
    title: string
    body: string
    confidence: number
    citations: string[]
  }>
  claims: Awaited<ReturnType<typeof listKnowledgeClaims>>
  packet: KnowledgePromptPacket
  globalMatches: Awaited<ReturnType<typeof globalSearch>>['results']
  persistedClaimId: string | null
  telemetry: {
    durationMs: number
    packetDurationMs: number
    globalSearchDurationMs: number
    claimCount: number
    itemCount: number
    partial: boolean
  }
}

const DEFAULT_LAYERS: KnowledgeLayer[] = [
  'assistant_memory',
  'team_brain',
  'project_brain',
  'org_brain',
  'claims',
  'rag',
  'evidence',
  'l2',
]

export async function thinkWithKnowledge(input: KnowledgeThinkInput): Promise<KnowledgeThinkResult> {
  const started = Date.now()
  const mode = input.mode ?? 'answer'

  const [packet, claims, search] = await Promise.all([
    queryBrain({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      team_id: input.teamId ?? null,
      assistant_id: input.assistantId ?? null,
      scoped_user_id: input.scopedUserId ?? null,
      query: input.query,
      mode: 'evidence',
      budget: {
        max_latency_ms: 1200,
        max_prompt_tokens: 3200,
        max_items_per_layer: 6,
      },
      actorUserId: input.createdByUserId ?? null,
      surface: 'app_api',
      audit: false,
      knowledgeLayers: DEFAULT_LAYERS,
      proofMode: 'optional',
    }).then((result) => result.packet),
    listKnowledgeClaims({
      orgId: input.orgId,
      projectId: input.projectId,
      teamId: input.teamId,
      assistantId: input.assistantId,
      query: input.query,
      status: 'active',
      limit: 12,
    }),
    globalSearch({
      orgId: input.orgId,
      query: input.query,
      scopes: ['knowledge', 'claims', 'sources', 'runs', 'evidence'],
      projectId: input.projectId ?? null,
      teamId: input.teamId ?? null,
      limit: 20,
    }),
  ])

  const findings = buildFindings(packet, claims, search.results)
  const summary = buildSummary(input.query, mode, findings, packet)
  const persistedClaimId = input.persistClaim
    ? await persistThinkClaim(input, summary, findings).catch(() => null)
    : null

  return {
    query: input.query,
    mode,
    summary,
    findings,
    claims,
    packet,
    globalMatches: search.results,
    persistedClaimId,
    telemetry: {
      durationMs: Date.now() - started,
      packetDurationMs: packet.telemetry.durationMs,
      globalSearchDurationMs: search.durationMs,
      claimCount: claims.length,
      itemCount: packet.items.length,
      partial: packet.telemetry.fallbackUsed || search.partial,
    },
  }
}

function buildFindings(
  packet: KnowledgePromptPacket,
  claims: Awaited<ReturnType<typeof listKnowledgeClaims>>,
  matches: Awaited<ReturnType<typeof globalSearch>>['results'],
): KnowledgeThinkResult['findings'] {
  const fromPacket = packet.items.slice(0, 6).map((item) => ({
    title: item.label,
    body: item.content,
    confidence: item.confidence ?? confidenceFromTrust(item.trustLevel),
    citations: item.citationKeys,
  }))
  const fromClaims = claims.slice(0, 4).map((claim) => ({
    title: claim.subject,
    body: claim.claim,
    confidence: claim.confidence,
    citations: claim.evidence.map((evidence) => evidence.label ?? evidence.url ?? evidence.runId ?? evidence.kind),
  }))
  const fromMatches = matches.slice(0, 4).map((match) => ({
    title: match.title,
    body: match.snippet ?? match.subtitle ?? match.href,
    confidence: Math.min(Math.max(match.score / 2, 0.2), 0.95),
    citations: [match.href],
  }))

  return dedupeFindings([...fromPacket, ...fromClaims, ...fromMatches]).slice(0, 10)
}

function buildSummary(
  query: string,
  mode: NonNullable<KnowledgeThinkInput['mode']>,
  findings: KnowledgeThinkResult['findings'],
  packet: KnowledgePromptPacket,
): string {
  if (findings.length === 0) {
    return `No durable Knowledge evidence was found for "${query}".`
  }

  const strongest = findings[0]
  const qualifier = packet.telemetry.fallbackUsed
    ? 'with partial recall'
    : 'with available recall'
  return `${modeLabel(mode)} ${qualifier}: ${strongest.body.slice(0, 360)}`
}

async function persistThinkClaim(
  input: KnowledgeThinkInput,
  summary: string,
  findings: KnowledgeThinkResult['findings'],
): Promise<string> {
  const claim = await createKnowledgeClaim({
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    teamId: input.teamId ?? null,
    assistantId: input.assistantId ?? null,
    claimType: input.mode === 'risk' ? 'risk' : input.mode === 'decision' ? 'decision' : 'claim',
    subject: input.query.slice(0, 240),
    claim: summary,
    holderType: 'system',
    holderId: 'knowledge_think',
    confidence: average(findings.map((finding) => finding.confidence)) ?? 0.5,
    weight: 0.6,
    status: 'active',
    evidence: findings.flatMap((finding) => finding.citations.map((citation) => ({
      kind: citation.startsWith('http') ? 'url' as const : 'message' as const,
      label: finding.title,
      url: citation.startsWith('http') ? citation : null,
      messageId: citation.startsWith('http') ? null : citation,
    }))),
    metadata: {
      source: 'knowledge_think',
      finding_count: findings.length,
    },
    createdByUserId: input.createdByUserId ?? null,
  })
  return claim.id
}

function confidenceFromTrust(trustLevel: string): number {
  if (trustLevel === 'l2_verified') return 0.99
  if (trustLevel === 'system') return 0.93
  if (trustLevel === 'operator_approved') return 0.86
  if (trustLevel === 'observed') return 0.72
  return 0.55
}

function modeLabel(mode: NonNullable<KnowledgeThinkInput['mode']>): string {
  if (mode === 'decision') return 'Decision synthesis'
  if (mode === 'risk') return 'Risk synthesis'
  if (mode === 'compare') return 'Comparison synthesis'
  return 'Knowledge synthesis'
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function dedupeFindings(findings: KnowledgeThinkResult['findings']): KnowledgeThinkResult['findings'] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.title}:${finding.body}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
