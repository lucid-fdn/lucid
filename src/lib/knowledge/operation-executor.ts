import 'server-only'

import {
  createBoardMemory,
  createKnowledgeClaim,
  createKnowledgeImportJob,
  findKnowledgeImportItemsByContentHashes,
  deleteBoardMemory,
  explainKnowledge,
  findKnowledgeEntities,
  getKnowledgeGraphNeighbors,
  getKnowledgeImportJob,
  listKnowledgeImportItems,
  listKnowledgeClaims,
  listKnowledgeImportJobs,
  listKnowledgeSources,
  upsertKnowledgeImportItems,
  updateKnowledgeImportItemStatus,
  updateKnowledgeImportJob,
  updateKnowledgeClaimStatus,
  updateKnowledgeMaintenanceEventStatus,
  updateKnowledgeSourcePolicy,
  writeProjectKnowledge,
  writeTeamKnowledge,
} from '@/lib/db'
import type {
  KnowledgeOperationId,
  KnowledgeOperationInput,
} from '@/lib/knowledge/operations'
import { queryBrain } from '@/lib/brain/query'
import {
  buildKnowledgeImportClaimInput,
  buildKnowledgeImportPreviewPlan,
  hashImportContent,
  parseKnowledgeImportPayload,
} from '@/lib/knowledge/imports'
import { assertKnowledgeSourceUrlSafe } from '@/lib/knowledge/source-safety'
import { thinkWithKnowledge } from '@/lib/knowledge/think'
import type { KnowledgeSource } from '@/lib/knowledge/types'

export async function executeKnowledgeOperation(
  operationId: KnowledgeOperationId,
  input: KnowledgeOperationInput,
  actorUserId: string | null,
): Promise<unknown> {
  switch (operationId) {
    case 'knowledge.retrieve_context': {
      const value = input as KnowledgeOperationInput<'knowledge.retrieve_context'>
      const result = await queryBrain({
        org_id: value.org_id,
        project_id: value.project_id,
        team_id: value.team_id,
        assistant_id: value.assistant_id,
        scoped_user_id: value.scoped_user_id,
        query: value.query,
        mode: value.mode,
        budget: {
          max_latency_ms: value.budget?.max_latency_ms,
          max_prompt_tokens: value.budget?.max_prompt_tokens,
          max_items_per_layer: value.budget?.max_items_per_layer,
        },
        actorUserId,
        surface: 'external_agent',
        audit: false,
        knowledgeLayers: value.layers,
        proofMode: value.proof_mode,
      })
      return result.packet
    }
    case 'knowledge.think': {
      const value = input as KnowledgeOperationInput<'knowledge.think'>
      return thinkWithKnowledge({
        orgId: value.org_id,
        projectId: value.project_id,
        teamId: value.team_id,
        assistantId: value.assistant_id,
        scopedUserId: value.scoped_user_id,
        query: value.query,
        mode: value.mode,
        persistClaim: value.persist_claim,
        createdByUserId: actorUserId,
      })
    }
    case 'knowledge.explain': {
      const value = input as KnowledgeOperationInput<'knowledge.explain'>
      return explainKnowledge({
        orgId: value.org_id,
        knowledgeId: value.knowledge_id,
        includeTimeline: value.include_timeline,
        includeProofs: value.include_proofs,
      })
    }
    case 'knowledge.claims.list': {
      const value = input as KnowledgeOperationInput<'knowledge.claims.list'>
      return {
        claims: await listKnowledgeClaims({
          orgId: value.org_id,
          projectId: value.project_id,
          teamId: value.team_id,
          assistantId: value.assistant_id,
          query: value.query,
          status: value.status,
          claimType: value.claim_type,
          limit: value.limit,
        }),
      }
    }
    case 'knowledge.claims.create': {
      const value = input as KnowledgeOperationInput<'knowledge.claims.create'>
      return createKnowledgeClaim({
        orgId: value.org_id,
        projectId: value.project_id ?? null,
        teamId: value.team_id ?? null,
        assistantId: value.assistant_id ?? null,
        sourceId: value.source_id ?? null,
        pageId: value.page_id ?? null,
        claimType: value.claim_type,
        subject: value.subject,
        claim: value.claim,
        holderType: value.holder_type,
        holderId: value.holder_id ?? null,
        confidence: value.confidence,
        weight: value.weight,
        status: value.status,
        validFrom: value.valid_from ?? null,
        validUntil: value.valid_until ?? null,
        evidence: value.evidence,
        metadata: value.metadata,
        createdByUserId: actorUserId,
      })
    }
    case 'knowledge.claims.update': {
      const value = input as KnowledgeOperationInput<'knowledge.claims.update'>
      return updateKnowledgeClaimStatus({
        orgId: value.org_id,
        claimId: value.claim_id,
        status: value.status,
        outcome: value.outcome,
        summary: value.summary,
        actorUserId,
      })
    }
    case 'knowledge.write_project': {
      const value = input as KnowledgeOperationInput<'knowledge.write_project'>
      return writeProjectKnowledge({
        orgId: value.org_id,
        projectId: value.project_id,
        source: buildKnowledgeSource(value.org_id, value.project_id, null, value.source, 'project'),
        subject: value.subject,
        compiledTruthPatch: value.compiled_truth,
        event: {
          type: value.event_type ?? 'created',
          summary: value.event_summary ?? 'Knowledge operation wrote project knowledge.',
          confidence: value.confidence ?? 0.9,
        },
        evidence: value.evidence,
      })
    }
    case 'knowledge.write_team': {
      const value = input as KnowledgeOperationInput<'knowledge.write_team'>
      return writeTeamKnowledge({
        orgId: value.org_id,
        projectId: value.project_id,
        teamId: value.team_id,
        source: buildKnowledgeSource(value.org_id, value.project_id, value.team_id, value.source, 'team'),
        subject: value.subject,
        compiledTruthPatch: value.compiled_truth,
        event: {
          type: value.event_type ?? 'created',
          summary: value.event_summary ?? 'Knowledge operation wrote team knowledge.',
          confidence: value.confidence ?? 0.9,
        },
        evidence: value.evidence,
      })
    }
    case 'knowledge.remember_org': {
      const value = input as KnowledgeOperationInput<'knowledge.remember_org'>
      if (!actorUserId) throw new Error('actorUserId is required for org memory writes')
      return createBoardMemory(value.org_id, actorUserId, {
        content: value.content,
        category: value.category,
        importance: value.importance,
        source: 'operator',
      })
    }
    case 'knowledge.forget_org': {
      const value = input as KnowledgeOperationInput<'knowledge.forget_org'>
      return { success: await deleteBoardMemory(value.org_id, value.memory_id) }
    }
    case 'knowledge.list_sources': {
      const value = input as KnowledgeOperationInput<'knowledge.list_sources'>
      return {
        sources: await listKnowledgeSources({
          orgId: value.org_id,
          projectId: value.project_id,
          teamId: value.team_id,
          includeArchived: value.include_archived,
          dueForRefreshOnly: value.due_for_refresh_only,
          limit: value.limit,
        }),
      }
    }
    case 'knowledge.imports.list': {
      const value = input as KnowledgeOperationInput<'knowledge.imports.list'>
      return {
        jobs: await listKnowledgeImportJobs({
          orgId: value.org_id,
          projectId: value.project_id,
          teamId: value.team_id,
          status: value.status,
          limit: value.limit,
        }),
      }
    }
    case 'knowledge.imports.create': {
      const value = input as KnowledgeOperationInput<'knowledge.imports.create'>
      return createKnowledgeImportJob({
        orgId: value.org_id,
        projectId: value.project_id ?? null,
        teamId: value.team_id ?? null,
        sourceType: value.source_type,
        mode: value.mode,
        status: value.status,
        metadata: value.metadata,
        createdByUserId: actorUserId,
      })
    }
    case 'knowledge.imports.preview': {
      const value = input as KnowledgeOperationInput<'knowledge.imports.preview'>
      return previewKnowledgeImportOperation(value)
    }
    case 'knowledge.imports.commit': {
      const value = input as KnowledgeOperationInput<'knowledge.imports.commit'>
      return commitKnowledgeImportOperation(value, actorUserId)
    }
    case 'knowledge.update_source': {
      const value = input as KnowledgeOperationInput<'knowledge.update_source'>
      return updateKnowledgeSourcePolicy({
        orgId: value.org_id,
        sourceId: value.source_id,
        label: value.label,
        visibility: value.visibility,
        trustLevel: value.trust_level,
        federationPolicy: value.federation_policy,
        retentionPolicy: value.retention_policy,
        status: value.status,
        includeInRetrieval: value.include_in_retrieval,
        refreshPolicy: value.refresh_policy,
        refreshIntervalSeconds: value.refresh_interval_seconds,
        staleAfter: value.stale_after,
      })
    }
    case 'knowledge.list_entities': {
      const value = input as KnowledgeOperationInput<'knowledge.list_entities'>
      return {
        entities: await findKnowledgeEntities({
          orgId: value.org_id,
          projectId: value.project_id,
          teamId: value.team_id,
          query: value.query,
          types: value.types,
          limit: value.limit,
        }),
      }
    }
    case 'knowledge.graph_neighbors': {
      const value = input as KnowledgeOperationInput<'knowledge.graph_neighbors'>
      return {
        neighbors: await getKnowledgeGraphNeighbors({
          orgId: value.org_id,
          entityId: value.entity_id,
          limit: value.limit,
        }),
      }
    }
    case 'knowledge.update_maintenance_event': {
      const value = input as KnowledgeOperationInput<'knowledge.update_maintenance_event'>
      return updateKnowledgeMaintenanceEventStatus({
        orgId: value.org_id,
        eventId: value.event_id,
        status: value.status,
      })
    }
  }
}

async function previewKnowledgeImportOperation(
  value: KnowledgeOperationInput<'knowledge.imports.preview'>,
) {
  const job = await getKnowledgeImportJob({
    orgId: value.org_id,
    importJobId: value.import_job_id,
  })
  if (!job) throw new KnowledgeOperationExecutionError('Import job not found', 404)
  if (job.status === 'committed' || job.status === 'cancelled') {
    throw new KnowledgeOperationExecutionError(`Cannot preview a ${job.status} import job`, 409)
  }

  const parsedItems = parseKnowledgeImportPayload({
    sourceType: job.sourceType,
    rawText: value.raw_text,
    items: value.items,
    metadata: value.metadata,
  })
  if (parsedItems.length === 0) {
    throw new KnowledgeOperationExecutionError('No importable content found', 400)
  }

  await updateKnowledgeImportJob({
    orgId: value.org_id,
    importJobId: value.import_job_id,
    status: 'running',
    errorMessage: null,
    metadata: {
      ...job.metadata,
      ...value.metadata,
      preview_started_at: new Date().toISOString(),
    },
  })

  const contentHashes = parsedItems.map((item) => hashImportContent(item.content))
  const existingItems = await findKnowledgeImportItemsByContentHashes({
    orgId: value.org_id,
    contentHashes,
    excludeImportJobId: value.import_job_id,
    limit: contentHashes.length,
  })
  const plan = buildKnowledgeImportPreviewPlan({
    sourceType: job.sourceType,
    items: parsedItems,
    existingContentHashes: new Set(existingItems.map((item) => item.contentHash)),
  })
  const items = await upsertKnowledgeImportItems({
    orgId: value.org_id,
    importJobId: value.import_job_id,
    items: plan.items,
  })
  const updatedJob = await updateKnowledgeImportJob({
    orgId: value.org_id,
    importJobId: value.import_job_id,
    status: 'preview_ready',
    itemCount: plan.itemCount,
    redactionCount: plan.redactionCount,
    errorMessage: null,
    metadata: {
      ...job.metadata,
      ...value.metadata,
      preview_generated_at: new Date().toISOString(),
      preview_item_count: plan.previewItemCount,
      skipped_item_count: plan.skippedItemCount,
    },
  })

  return {
    job: updatedJob,
    items,
    summary: {
      itemCount: plan.itemCount,
      previewItemCount: plan.previewItemCount,
      skippedItemCount: plan.skippedItemCount,
      redactionCount: plan.redactionCount,
    },
  }
}

async function commitKnowledgeImportOperation(
  value: KnowledgeOperationInput<'knowledge.imports.commit'>,
  actorUserId: string | null,
) {
  const job = await getKnowledgeImportJob({
    orgId: value.org_id,
    importJobId: value.import_job_id,
  })
  if (!job) throw new KnowledgeOperationExecutionError('Import job not found', 404)
  if (job.status === 'committed' || job.status === 'cancelled') {
    throw new KnowledgeOperationExecutionError(`Cannot commit a ${job.status} import job`, 409)
  }
  if (job.status !== 'preview_ready') {
    throw new KnowledgeOperationExecutionError('Preview the import before committing it', 409)
  }

  const itemKeys = value.item_keys ? new Set(value.item_keys) : null
  const items = await listKnowledgeImportItems({
    orgId: value.org_id,
    importJobId: value.import_job_id,
    limit: 500,
  })
  const selectedItems = items.filter((item) => {
    if (item.status !== 'preview') return false
    return itemKeys ? itemKeys.has(item.itemKey) : true
  })
  if (selectedItems.length === 0) {
    throw new KnowledgeOperationExecutionError('No preview items are available to commit', 400)
  }

  await updateKnowledgeImportJob({
    orgId: value.org_id,
    importJobId: value.import_job_id,
    status: 'running',
    metadata: {
      ...job.metadata,
      ...value.metadata,
      commit_started_at: new Date().toISOString(),
      commit_target: value.target,
    },
  })

  let committed = 0
  let failed = 0
  const outputRefs: Array<Record<string, unknown>> = []
  for (const item of selectedItems) {
    try {
      const claim = await createKnowledgeClaim(buildKnowledgeImportClaimInput({
        job,
        item,
        actorUserId,
        metadata: value.metadata,
      }))
      const refs = [{ type: 'knowledge_claim', id: claim.id, subject: claim.subject }]
      await updateKnowledgeImportItemStatus({
        orgId: value.org_id,
        importJobId: value.import_job_id,
        itemId: item.id,
        status: 'committed',
        outputRefs: refs,
        metadata: {
          ...item.metadata,
          committed_at: new Date().toISOString(),
        },
      })
      committed += 1
      outputRefs.push(...refs)
    } catch (error) {
      failed += 1
      await updateKnowledgeImportItemStatus({
        orgId: value.org_id,
        importJobId: value.import_job_id,
        itemId: item.id,
        status: 'failed',
        outputRefs: [{ type: 'error', message: error instanceof Error ? error.message : 'Unknown commit error' }],
        metadata: {
          ...item.metadata,
          failed_at: new Date().toISOString(),
        },
      })
    }
  }

  const skipped = items.filter((item) => item.status === 'skipped').length
  const updatedJob = await updateKnowledgeImportJob({
    orgId: value.org_id,
    importJobId: value.import_job_id,
    status: committed > 0 ? 'committed' : 'failed',
    itemCount: items.length,
    redactionCount: items.reduce((sum, item) => sum + item.redactions.length, 0),
    errorMessage: committed > 0 ? null : 'No import items could be committed',
    metadata: {
      ...job.metadata,
      ...value.metadata,
      commit_finished_at: new Date().toISOString(),
      commit_target: value.target,
      committed_item_count: committed,
      failed_item_count: failed,
      skipped_item_count: skipped,
    },
  })

  return {
    job: updatedJob,
    summary: {
      committed,
      failed,
      skipped,
      outputRefs,
    },
  }
}

export class KnowledgeOperationExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'KnowledgeOperationExecutionError'
  }
}

export function dynamicAdminRequired(operationId: KnowledgeOperationId, input: KnowledgeOperationInput): boolean {
  if (operationId !== 'knowledge.think') return false
  return Boolean((input as KnowledgeOperationInput<'knowledge.think'>).persist_claim)
}

export function summarizeKnowledgeOperationResult(result: unknown): string | null {
  if (!result) return null
  if (typeof result === 'string') return result.slice(0, 1000)
  if (typeof result !== 'object') return String(result)
  const object = result as Record<string, unknown>
  if (Array.isArray(object.items)) return `${object.items.length} item(s)`
  if (Array.isArray(object.sources)) return `${object.sources.length} source(s)`
  if (Array.isArray(object.entities)) return `${object.entities.length} entity/entities`
  if (Array.isArray(object.neighbors)) return `${object.neighbors.length} graph neighbor(s)`
  if (object.subject) return String(object.subject)
  if (object.id) return `id=${String(object.id)}`
  return JSON.stringify(result).slice(0, 1000)
}

function buildKnowledgeSource(
  orgId: string,
  projectId: string | null | undefined,
  teamId: string | null | undefined,
  source: KnowledgeOperationInput<'knowledge.write_project'>['source'] | KnowledgeOperationInput<'knowledge.write_team'>['source'],
  visibility: 'project' | 'team',
): KnowledgeSource {
  assertKnowledgeSourceUrlSafe(source?.url)
  return {
    type: source?.type ?? 'manual',
    orgId,
    projectId: projectId ?? null,
    teamId: teamId ?? null,
    label: source?.label ?? 'Knowledge operation',
    url: source?.url ?? null,
    visibility: source?.visibility ?? visibility,
    trustLevel: source?.trust_level ?? 'operator_approved',
    federationPolicy: source?.federation_policy ?? 'source_scoped',
    retentionPolicy: source?.retention_policy ?? 'standard',
  }
}
