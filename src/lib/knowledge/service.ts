import {
  buildKnowledgePromptPacket,
} from './prompt-packet'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getBoardMemories } from '@/lib/db/board-memory'
import { searchAssistantMemoriesForKnowledge } from '@/lib/db/assistant-memory'
import { findKnowledgeEntities, getKnowledgeGraphNeighbors } from '@/lib/db/knowledge-graph'
import {
  explainKnowledge as explainKnowledgeDb,
  listKnowledgePages,
  listKnowledgeSources,
  writeProjectKnowledge as writeProjectKnowledgeDb,
  writeTeamKnowledge as writeTeamKnowledgeDb,
} from '@/lib/db/knowledge'
import { listKnowledgeClaims } from '@/lib/db/knowledge-claims'
import { recordKnowledgeRetrievalCapture } from '@/lib/db/knowledge-retrieval-evals'
import { retrieveContext } from '@/lib/rag/retrieve'
import { fuseKnowledgeCandidates, keywordScore, type KnowledgeFusionCandidate } from './hybrid-retrieval'
import type { GraphExpansionCandidate } from './graph'
import { evaluateKnowledgeSourcePolicy } from './source-policy'
import { knowledgeFeatureFlags } from './feature-flags'
import type {
  ExplainKnowledgeInput,
  KnowledgeEvidence,
  KnowledgeLayer,
  KnowledgePromptPacket,
  KnowledgeSource,
  RememberForAssistantInput,
  RetrieveKnowledgeContextInput,
  WriteScopedKnowledgeInput,
} from './types'

const DEFAULT_READ_CACHE_TTL_MS = 15_000
const MAX_READ_CACHE_ENTRIES = 500

type CacheEntry<T> = {
  expiresAt: number
  promise: Promise<T>
}

const readCache = new Map<string, CacheEntry<unknown>>()

export async function retrieveKnowledgeContext(
  input: RetrieveKnowledgeContextInput,
): Promise<KnowledgePromptPacket> {
  const startedAt = Date.now()
  const layers = new Set<KnowledgeLayer>(input.layers ?? [
    'assistant_memory',
    'team_brain',
    'project_brain',
    'org_brain',
    'claims',
    'rag',
  ])
  const errors: string[] = []
  const needsAssistantEmbedding = layers.has('assistant_memory') && Boolean(input.assistantId && input.scopedUserId)
  const needsRagEmbedding = layers.has('rag')
  const queryEmbeddingPromise: Promise<number[] | null> = input.query.trim() && (needsAssistantEmbedding || needsRagEmbedding)
    ? generateEmbedding(input.query)
        .then((result) => result.embedding)
        .catch(() => {
          errors.push('embedding_unavailable')
          return null
        })
    : Promise.resolve(null)

  const [sources, pageCandidates, claimCandidates, ragCandidates, assistantCandidates, boardCandidates] = await Promise.all([
    cachedListKnowledgeSources({
      orgId: input.orgId,
      sourceId: input.sourceId ?? undefined,
      sourceKey: input.sourceKey ?? undefined,
      includeArchived: true,
      limit: 200,
    }).catch(() => []),
    retrieveCompiledTruthCandidates(input, layers).catch(() => {
      errors.push('compiled_truth_unavailable')
      return []
    }),
    layers.has('claims')
      ? retrieveClaimCandidates(input).catch(() => {
          errors.push('claims_unavailable')
          return []
        })
      : Promise.resolve([]),
    needsRagEmbedding
      ? queryEmbeddingPromise.then((queryEmbedding) => queryEmbedding
          ? retrieveRagCandidates(input, queryEmbedding).catch(() => {
              errors.push('rag_unavailable')
              return []
            })
          : [])
      : Promise.resolve([]),
    needsAssistantEmbedding
      ? queryEmbeddingPromise.then((queryEmbedding) => queryEmbedding
          ? retrieveAssistantMemoryCandidates(input, queryEmbedding).catch(() => {
              errors.push('assistant_memory_unavailable')
              return []
            })
          : [])
      : Promise.resolve([]),
    layers.has('org_brain')
      ? retrieveBoardMemoryCandidates(input).catch(() => {
          errors.push('board_memory_unavailable')
          return []
        })
      : Promise.resolve([]),
  ])

  const sourceMap = new Map(sources.map((source) => [source.id, source]))
  const governedPages = pageCandidates.filter((candidate) => {
    const sourceId = typeof candidate.metadata?.sourceId === 'string' ? candidate.metadata.sourceId : null
    if (!sourceId) return true
    const source = sourceMap.get(sourceId)
    if (!source) return true
    const decision = evaluateKnowledgeSourcePolicy(source)
    if (!decision.eligible) return false
    candidate.sourcePolicyMultiplier = decision.scoreMultiplier
    candidate.freshness = decision.freshness
    return true
  })

  const fusion = fuseKnowledgeCandidates([
    ...assistantCandidates,
    ...governedPages,
    ...claimCandidates,
    ...ragCandidates,
    ...boardCandidates,
  ], {
    limit: input.budget?.maxItemsPerLayer ? input.budget.maxItemsPerLayer * layers.size : 12,
    graphExpansions: layers.has('evidence')
      ? await retrieveGraphExpansions(input).catch(() => [])
      : [],
  })

  const packet = buildKnowledgePromptPacket(input, fusion.items, {
    durationMs: Date.now() - startedAt,
    fallbackUsed: errors.length > 0,
    timedOut: false,
    retrievalCounts: fusion.telemetry.layerCounts,
  })

  if (shouldCaptureRetrievalEval(input)) {
    void recordKnowledgeRetrievalCapture({
      packet,
      query: input.query,
      evalCaseId: input.evalCapture?.caseId,
      actorUserId: input.evalCapture?.actorUserId,
      surface: input.evalCapture?.surface,
      expectedItemIds: input.evalCapture?.expectedItemIds,
      expectedCitationKeys: input.evalCapture?.expectedCitationKeys,
      metadata: {
        ...(input.evalCapture?.metadata ?? {}),
        fallbackUsed: errors.length > 0,
        errors,
      },
    })
  }

  return packet
}

async function retrieveClaimCandidates(
  input: RetrieveKnowledgeContextInput,
): Promise<KnowledgeFusionCandidate[]> {
  const claims = await cachedListKnowledgeClaims({
    orgId: input.orgId,
    projectId: input.projectId,
    teamId: input.teamId,
    assistantId: input.assistantId,
    query: input.query,
    status: 'active',
    limit: Math.max(input.budget?.maxItemsPerLayer ?? 8, 12),
  })

  return claims.map((claim) => {
    const content = `${claim.claimType}: ${claim.subject}\n${claim.claim}`
    const score = keywordScore(input.query, content)
    const confidenceScore = claim.confidence * 0.7 + claim.weight * 0.3
    return {
      id: claim.id,
      layer: 'claims',
      content,
      score: Math.max(score, confidenceScore),
      citations: claim.evidence.map((evidence) => ({
        kind: evidence.kind,
        runId: evidence.runId ?? null,
        messageId: evidence.messageId ?? null,
        artifactId: evidence.artifactId ?? null,
        url: evidence.url ?? null,
        label: evidence.label ?? `Claim evidence: ${claim.subject}`,
      })),
      trustLevel: claim.confidence >= 0.85 ? 'operator_approved' : 'observed',
      freshness: claim.validUntil && Date.parse(claim.validUntil) < Date.now() ? 'stale' : 'unknown',
      tokenCost: estimateTokenCost(content),
      retrievalSource: 'claims',
      keywordScore: score,
      metadata: {
        claimId: claim.id,
        claimType: claim.claimType,
        holderType: claim.holderType,
        holderId: claim.holderId,
        status: claim.status,
        weight: claim.weight,
        confidence: claim.confidence,
        dedupKey: `knowledge_claim:${claim.id}`,
      },
    }
  })
}

function shouldCaptureRetrievalEval(input: RetrieveKnowledgeContextInput): boolean {
  return Boolean(input.evalCapture?.enabled || knowledgeFeatureFlags.retrievalEvalCapture)
}

async function retrieveGraphExpansions(input: RetrieveKnowledgeContextInput): Promise<GraphExpansionCandidate[]> {
  const seedEntities = await cachedFindKnowledgeEntities({
    orgId: input.orgId,
    projectId: input.projectId,
    teamId: input.teamId,
    sourceId: input.sourceId ?? undefined,
    query: input.query,
    limit: 5,
  })
  const expansions: GraphExpansionCandidate[] = []

  for (const entity of seedEntities.slice(0, 5)) {
    const neighbors = await cachedGetKnowledgeGraphNeighbors({
      orgId: input.orgId,
      entityId: entity.id,
      limit: 8,
    })
    expansions.push({
      entityId: entity.id,
      entityType: entity.type,
      canonicalName: entity.canonicalName,
      relationshipCount: neighbors.length,
      confidence: entity.confidence,
    })
    for (const neighbor of neighbors.slice(0, 4)) {
      expansions.push({
        entityId: neighbor.entity.id,
        entityType: neighbor.entity.type,
        canonicalName: neighbor.entity.canonicalName,
        relationshipCount: 1,
        confidence: Math.min(neighbor.entity.confidence, neighbor.relationship.confidence),
      })
    }
  }

  return expansions.slice(0, 25)
}

export async function rememberForAssistant(_input: RememberForAssistantInput): Promise<{
  status: 'deferred'
  reason: string
}> {
  return {
    status: 'deferred',
    reason: 'assistant memory writes still use the existing extraction pipeline until durable Knowledge writes are enabled',
  }
}

export async function writeProjectKnowledge(input: WriteScopedKnowledgeInput): Promise<{
  status: 'written'
  knowledgeId: string
  subject: string
  evidence: KnowledgeEvidence[]
}> {
  const page = await writeProjectKnowledgeDb(input)
  return {
    status: 'written',
    knowledgeId: page.id,
    subject: page.subject,
    evidence: page.evidence,
  }
}

export async function writeTeamKnowledge(input: WriteScopedKnowledgeInput): Promise<{
  status: 'written'
  knowledgeId: string
  subject: string
  evidence: KnowledgeEvidence[]
}> {
  const page = await writeTeamKnowledgeDb(input)
  return {
    status: 'written',
    knowledgeId: page.id,
    subject: page.subject,
    evidence: page.evidence,
  }
}

export async function explainKnowledge(input: ExplainKnowledgeInput): Promise<{
  status: 'available'
  result: Awaited<ReturnType<typeof explainKnowledgeDb>>
}> {
  return {
    status: 'available',
    result: await explainKnowledgeDb(input),
  }
}

async function retrieveCompiledTruthCandidates(
  input: RetrieveKnowledgeContextInput,
  layers: Set<KnowledgeLayer>,
): Promise<KnowledgeFusionCandidate[]> {
  const lookups: Array<Promise<Awaited<ReturnType<typeof listKnowledgePages>>>> = []
  if (layers.has('project_brain') && input.projectId) {
    lookups.push(cachedListKnowledgePages({
      orgId: input.orgId,
      projectId: input.projectId,
      sourceId: input.sourceId ?? undefined,
      scopeType: 'project',
      limit: 40,
    }))
  }
  if (layers.has('team_brain') && input.teamId) {
    lookups.push(cachedListKnowledgePages({
      orgId: input.orgId,
      teamId: input.teamId,
      sourceId: input.sourceId ?? undefined,
      scopeType: 'team',
      limit: 40,
    }))
  }
  if (layers.has('org_brain')) {
    lookups.push(cachedListKnowledgePages({
      orgId: input.orgId,
      sourceId: input.sourceId ?? undefined,
      scopeType: 'org',
      limit: 20,
    }))
  }

  const pages = (await Promise.all(lookups)).flat()
  return pages.map((page) => {
    const score = keywordScore(input.query, `${page.subject}\n${page.compiledTruth}`)
    const layer: KnowledgeLayer = page.scopeType === 'team'
      ? 'team_brain'
      : page.scopeType === 'project'
        ? 'project_brain'
        : 'org_brain'
    return {
      id: page.id,
      layer,
      content: `${page.subject}: ${page.compiledTruth}`,
      source: undefined,
      score: Math.max(score, page.confidence * 0.5),
      citations: page.evidence,
      trustLevel: page.trustLevel,
      freshness: 'unknown',
      tokenCost: estimateTokenCost(`${page.subject}: ${page.compiledTruth}`),
      retrievalSource: 'compiled_truth',
      keywordScore: score,
      metadata: {
        pageId: page.id,
        sourceId: page.sourceId,
        scopeType: page.scopeType,
        version: page.version,
        dedupKey: `knowledge_page:${page.id}`,
      },
    }
  })
}

async function retrieveRagCandidates(
  input: RetrieveKnowledgeContextInput,
  queryEmbedding: number[] | null,
): Promise<KnowledgeFusionCandidate[]> {
  const result = await retrieveContext({
    orgId: input.orgId,
    projectId: input.projectId ?? undefined,
    query: input.query,
    queryEmbedding: queryEmbedding ?? undefined,
    topK: input.budget?.maxItemsPerLayer ?? 8,
  })

  return result.chunks.map((chunk) => ({
    id: chunk.id,
    layer: 'rag',
    content: chunk.content,
    score: chunk.similarity,
    citations: [{
      kind: 'file',
      artifactId: chunk.documentId,
      label: chunk.documentTitle,
    }],
    trustLevel: 'observed',
    freshness: 'unknown',
    tokenCost: estimateTokenCost(chunk.content),
    retrievalSource: 'rag_hybrid',
    keywordScore: keywordScore(input.query, chunk.content),
    metadata: {
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      sourceType: chunk.sourceType,
      dedupKey: `rag_chunk:${chunk.id}`,
    },
  }))
}

async function retrieveAssistantMemoryCandidates(
  input: RetrieveKnowledgeContextInput,
  queryEmbedding: number[],
): Promise<KnowledgeFusionCandidate[]> {
  if (!input.assistantId || !input.scopedUserId) return []
  const memories = await searchAssistantMemoriesForKnowledge({
    assistantId: input.assistantId,
    scopedUserId: input.scopedUserId,
    queryEmbedding,
    orgId: input.orgId,
    projectId: input.projectId,
    channelType: input.contextLadder?.channelType,
    conversationId: input.contextLadder?.conversationId,
    limit: input.budget?.maxItemsPerLayer ?? 8,
  })

  return memories
    .filter((memory) => memory.fact_text.trim().length > 0 && memory.redaction_state === 'none')
    .map((memory) => {
      const citations: KnowledgeEvidence[] = []
      if (memory.source_run_id) citations.push({ kind: 'run', runId: memory.source_run_id, label: 'Source run' })
      if (memory.source_evidence_handle) citations.push({ kind: 'message', messageId: memory.source_evidence_handle, label: 'Source evidence' })
      return {
        id: memory.id,
        layer: 'assistant_memory',
        content: memory.fact_text,
        score: memory.similarity,
        citations,
        trustLevel: 'observed',
        freshness: 'unknown',
        tokenCost: estimateTokenCost(memory.fact_text),
        retrievalSource: 'assistant_semantic',
        keywordScore: keywordScore(input.query, memory.fact_text),
        metadata: {
          memoryId: memory.id,
          category: memory.category,
          redactionState: memory.redaction_state,
          dedupKey: `assistant_memory:${memory.id}`,
        },
      }
    })
}

async function retrieveBoardMemoryCandidates(
  input: RetrieveKnowledgeContextInput,
): Promise<KnowledgeFusionCandidate[]> {
  const limit = input.budget?.maxItemsPerLayer ?? 8
  const memories = await cachedGetBoardMemories(input.orgId, limit)
  return memories.map((memory) => {
    const score = keywordScore(input.query, memory.content)
    return {
      id: memory.id,
      layer: 'org_brain',
      content: memory.content,
      source: {
        type: 'board_memory',
        orgId: input.orgId,
        label: `Board memory: ${memory.category}`,
        visibility: 'org',
        trustLevel: memory.source === 'system' ? 'system' : 'observed',
        federationPolicy: 'org_federated',
        retentionPolicy: 'standard',
      } satisfies KnowledgeSource,
      score: Math.max(score, Number(memory.importance) * 0.75),
      citations: [{ kind: 'message', messageId: memory.id, label: `Board memory ${memory.category}` }],
      trustLevel: memory.source === 'system' ? 'system' : 'observed',
      freshness: 'unknown',
      tokenCost: estimateTokenCost(memory.content),
      retrievalSource: 'board_memory',
      keywordScore: score,
      metadata: {
        boardMemoryId: memory.id,
        category: memory.category,
        dedupKey: `board_memory:${memory.id}`,
      },
    }
  })
}

function estimateTokenCost(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

function cachedListKnowledgeSources(input: Parameters<typeof listKnowledgeSources>[0]): ReturnType<typeof listKnowledgeSources> {
  return cachedKnowledgeRead(['sources', input], () => listKnowledgeSources(input))
}

function cachedListKnowledgePages(input: Parameters<typeof listKnowledgePages>[0]): ReturnType<typeof listKnowledgePages> {
  return cachedKnowledgeRead(['pages', input], () => listKnowledgePages(input))
}

function cachedListKnowledgeClaims(input: Parameters<typeof listKnowledgeClaims>[0]): ReturnType<typeof listKnowledgeClaims> {
  return cachedKnowledgeRead(['claims', input], () => listKnowledgeClaims(input))
}

function cachedFindKnowledgeEntities(input: Parameters<typeof findKnowledgeEntities>[0]): ReturnType<typeof findKnowledgeEntities> {
  return cachedKnowledgeRead(['entities', input], () => findKnowledgeEntities(input))
}

function cachedGetKnowledgeGraphNeighbors(input: Parameters<typeof getKnowledgeGraphNeighbors>[0]): ReturnType<typeof getKnowledgeGraphNeighbors> {
  return cachedKnowledgeRead(['neighbors', input], () => getKnowledgeGraphNeighbors(input))
}

function cachedGetBoardMemories(orgId: string, limit: number): ReturnType<typeof getBoardMemories> {
  return cachedKnowledgeRead(['board_memory', orgId, limit], () => getBoardMemories(orgId, { limit }))
}

function cachedKnowledgeRead<T>(keyParts: unknown[], loader: () => Promise<T>): Promise<T> {
  const ttlMs = getReadCacheTtlMs()
  if (ttlMs <= 0) return loader()

  const now = Date.now()
  const key = JSON.stringify(keyParts)
  const existing = readCache.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > now) return existing.promise

  if (readCache.size >= MAX_READ_CACHE_ENTRIES) pruneReadCache(now)

  const promise = loader().catch((error) => {
    readCache.delete(key)
    throw error
  })
  readCache.set(key, { expiresAt: now + ttlMs, promise })
  return promise
}

function pruneReadCache(now: number): void {
  for (const [key, entry] of readCache) {
    if (entry.expiresAt <= now || readCache.size >= MAX_READ_CACHE_ENTRIES) {
      readCache.delete(key)
    }
    if (readCache.size < MAX_READ_CACHE_ENTRIES) break
  }
}

function getReadCacheTtlMs(): number {
  const raw = Number.parseInt(process.env.LUCID_KNOWLEDGE_READ_CACHE_TTL_MS ?? '', 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_READ_CACHE_TTL_MS
}
