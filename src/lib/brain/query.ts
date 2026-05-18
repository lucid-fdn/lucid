import 'server-only'

import { resolveSharedContext } from '@/lib/db/shared-context'
import { retrieveKnowledgeContext } from '@/lib/knowledge/service'
import type { KnowledgeLayer, KnowledgePromptPacket, RetrieveKnowledgeContextInput } from '@/lib/knowledge/types'
import { recordKnowledgeOperationEvent } from '@/lib/db/knowledge-operation-events'
import type { KnowledgeOperationSurface } from '@/lib/knowledge/operations'
import type { BrainLayer, BrainQueryRequest } from './schemas'
import { resolveBrainSource, type BrainSourceRoute } from './source-routing'

type BrainOperationSurface = KnowledgeOperationSurface | 'runtime'

export interface BrainQueryResult {
  brainId: string
  source: BrainSourceRoute
  packet: KnowledgePromptPacket
  guidance: Awaited<ReturnType<typeof resolveSharedContext>>
  telemetry: {
    durationMs: number
    sourceScoped: boolean
    layers: BrainLayer[]
  }
}

export async function queryBrain(input: BrainQueryRequest & {
  actorUserId?: string | null
  surface?: BrainOperationSurface
  audit?: boolean
  knowledgeLayers?: KnowledgeLayer[]
  proofMode?: RetrieveKnowledgeContextInput['proofMode']
  contextLadder?: RetrieveKnowledgeContextInput['contextLadder']
  evalCapture?: RetrieveKnowledgeContextInput['evalCapture']
}): Promise<BrainQueryResult> {
  const startedAt = Date.now()
  const layers = input.layers ?? ['facts', 'guidance', 'documents', 'graph', 'evidence']
  const surface = normalizeBrainSurface(input.surface)
  const source = await resolveBrainSource({
    orgId: input.org_id,
    sourceId: input.source_id ?? null,
    sourceKey: input.source_key ?? null,
    projectId: input.project_id ?? null,
    teamId: input.team_id ?? null,
  })

  const [packet, guidance] = await Promise.all([
    retrieveKnowledgeContext({
      orgId: input.org_id,
      projectId: input.project_id ?? null,
      teamId: input.team_id ?? null,
      assistantId: input.assistant_id ?? null,
      scopedUserId: input.scoped_user_id ?? input.actorUserId ?? null,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
      query: input.query,
      mode: input.mode === 'context_packet' ? 'full' : input.mode ?? 'evidence',
      layers: input.knowledgeLayers ?? mapBrainLayersToKnowledgeLayers(layers),
      budget: {
        maxLatencyMs: input.budget?.max_latency_ms,
        maxPromptTokens: input.budget?.max_prompt_tokens,
        maxItemsPerLayer: input.budget?.max_items_per_layer,
      },
      proofMode: input.proofMode ?? 'optional',
      contextLadder: input.contextLadder,
      evalCapture: input.evalCapture ?? {
        enabled: input.eval_capture?.enabled,
        surface,
        caseId: input.eval_capture?.case_id ?? null,
        expectedItemIds: input.eval_capture?.expected_item_ids,
        expectedCitationKeys: input.eval_capture?.expected_citation_keys,
        actorUserId: input.actorUserId ?? null,
        metadata: {
          ...(input.eval_capture?.metadata ?? {}),
          brainId: input.org_id,
          sourceId: source.sourceId,
          sourceKey: source.sourceKey,
          brainRuntime: '2026-05-11.brain-query.v1',
        },
      },
    }),
    resolveSharedContext({
      workspaceId: input.org_id,
      projectId: input.project_id ?? null,
      teamId: input.team_id ?? null,
      agentId: input.assistant_id ?? null,
      userId: input.scoped_user_id ?? input.actorUserId ?? null,
    }),
  ])

  const durationMs = Date.now() - startedAt
  if (input.audit !== false) {
    void recordKnowledgeOperationEvent({
      orgId: input.org_id,
      actorUserId: input.actorUserId ?? null,
      operationId: 'brain.query',
      surface,
      success: true,
      durationMs,
      input: {
        query: input.query,
        projectId: input.project_id ?? null,
        teamId: input.team_id ?? null,
        assistantId: input.assistant_id ?? null,
        sourceId: source.sourceId,
        sourceKey: source.sourceKey,
        layers,
        knowledgeLayers: input.knowledgeLayers,
      },
      outputSummary: `${packet.items.length} packet items, ${guidance.records.length} guidance records`,
      metadata: {
        brainRuntime: '2026-05-11.brain-query.v1',
        sourceId: source.sourceId,
        sourceKey: source.sourceKey,
        packetTelemetry: packet.telemetry,
      },
    })
  }

  return {
    brainId: input.org_id,
    source,
    packet,
    guidance,
    telemetry: {
      durationMs,
      sourceScoped: Boolean(source.sourceId),
      layers,
    },
  }
}

function normalizeBrainSurface(surface: BrainOperationSurface | undefined): KnowledgeOperationSurface {
  return surface === 'runtime' ? 'external_agent' : surface ?? 'app_api'
}

function mapBrainLayersToKnowledgeLayers(layers: BrainLayer[]): KnowledgeLayer[] {
  const mapped = new Set<KnowledgeLayer>()
  if (layers.includes('facts')) {
    mapped.add('org_brain')
    mapped.add('project_brain')
    mapped.add('team_brain')
    mapped.add('claims')
  }
  if (layers.includes('documents')) mapped.add('rag')
  if (layers.includes('graph')) mapped.add('evidence')
  if (layers.includes('evidence')) {
    mapped.add('evidence')
    mapped.add('l2')
  }
  if (mapped.size === 0) {
    mapped.add('org_brain')
    mapped.add('rag')
  }
  return Array.from(mapped)
}
