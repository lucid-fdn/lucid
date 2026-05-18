import 'server-only'

import { createBoardMemory, createKnowledgeSource } from '@/lib/db'
import { createSharedContextRecord } from '@/lib/db/shared-context'
import { recordKnowledgeOperationEvent } from '@/lib/db/knowledge-operation-events'
import { ingestDocument } from '@/lib/rag'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import type { SharedContextRecordType } from '@contracts/shared-context'
import type { KnowledgeOperationSurface } from '@/lib/knowledge/operations'
import type { BrainRememberRequest } from './schemas'
import { resolveBrainSource } from './source-routing'

type BrainOperationSurface = KnowledgeOperationSurface | 'runtime'

export interface BrainRememberResult {
  kind: BrainRememberRequest['kind']
  status: 'created' | 'skipped' | 'needs_upload'
  id: string | null
  message: string
}

export async function rememberBrain(input: BrainRememberRequest & {
  actorUserId: string
  surface?: BrainOperationSurface
}): Promise<BrainRememberResult> {
  const startedAt = Date.now()
  const surface = normalizeBrainSurface(input.surface)
  const source = await resolveBrainSource({
    orgId: input.org_id,
    sourceId: input.source_id ?? null,
    sourceKey: input.source_key ?? null,
    projectId: input.project_id ?? null,
    teamId: input.team_id ?? null,
  })

  let result: BrainRememberResult
  if (input.kind === 'fact') {
    const fact = await createBoardMemory(input.org_id, input.actorUserId, {
      content: input.body,
      category: input.metadata?.intakeKind === 'instruction' ? 'policy' : 'context',
      importance: input.confidence ?? 0.78,
      source: source.sourceKey || 'operator',
    })
    result = {
      kind: input.kind,
      status: fact ? 'created' : 'skipped',
      id: fact?.id ?? null,
      message: fact ? 'Fact added to Brain.' : 'Duplicate fact skipped.',
    }
  } else if (input.kind === 'guidance') {
    const record = await createSharedContextRecord(input.org_id, {
      project_id: input.project_id ?? null,
      agent_id: input.assistant_id ?? null,
      scope_type: input.assistant_id ? 'agent' : input.team_id ? 'team' : input.project_id ? 'project' : 'workspace',
      scope_id: input.assistant_id ?? input.team_id ?? input.project_id ?? input.org_id,
      record_type: mapGuidanceKind(input.guidance_kind),
      title: input.title,
      body: input.body,
      source_type: 'brain',
      source_id: source.sourceId,
      confidence: input.confidence ?? 0.82,
      status: 'active',
      metadata: {
        ...(input.metadata ?? {}),
        brainRuntime: '2026-05-11.brain-remember.v1',
        sourceKey: source.sourceKey,
        guidanceKind: input.guidance_kind ?? 'memory',
      },
      links: input.url ? [{
        target_type: 'external_signal',
        target_id: input.url,
        label: input.title,
        url: input.url,
        confidence: input.confidence ?? 0.82,
        metadata: {},
      }] : [],
    }, input.actorUserId)
    result = {
      kind: input.kind,
      status: record ? 'created' : 'skipped',
      id: record?.id ?? null,
      message: record ? 'Guidance added to Brain.' : 'Guidance was not saved.',
    }
  } else if (input.kind === 'source') {
    const knowledgeSource = await createKnowledgeSource({
      type: input.url ? 'url' : 'manual',
      orgId: input.org_id,
      projectId: input.project_id ?? null,
      teamId: input.team_id ?? null,
      assistantId: input.assistant_id ?? null,
      url: input.url ?? null,
      label: input.title,
      visibility: input.project_id ? 'project' : input.team_id ? 'team' : 'org',
      trustLevel: 'observed',
      federationPolicy: input.project_id || input.team_id ? 'source_scoped' : 'org_federated',
      retentionPolicy: 'standard',
      includeInRetrieval: true,
      refreshPolicy: input.url ? 'on_change' : 'manual',
    })
    result = {
      kind: input.kind,
      status: knowledgeSource ? 'created' : 'skipped',
      id: knowledgeSource?.id ?? null,
      message: knowledgeSource ? 'Source added to Brain.' : 'Source was not saved.',
    }
  } else if (input.kind === 'document') {
    const storageCheck = await evaluateEntitlement({ orgId: input.org_id, action: 'upload_file' })
    const storageGuard = guardEntitlement(storageCheck, { orgId: input.org_id, route: 'brain.remember' })
    if (storageGuard) {
      result = {
        kind: input.kind,
        status: 'skipped',
        id: null,
        message: 'Plan limit prevents document ingestion.',
      }
    } else {
      const document = await ingestDocument({
        orgId: input.org_id,
        projectId: input.project_id ?? undefined,
        userId: input.actorUserId,
        title: input.title,
        content: input.body,
        sourceType: input.file_name ? 'upload' : input.url ? 'url' : 'paste',
        sourceUrl: input.url ?? undefined,
        fileName: input.file_name ?? undefined,
        mimeType: input.mime_type ?? undefined,
        scope: 'org',
        metadata: {
          ...(input.metadata ?? {}),
          managedBy: 'brain_runtime',
          sourceId: source.sourceId,
          sourceKey: source.sourceKey,
          trustLevel: 'operator_approved',
        },
      })
      result = {
        kind: input.kind,
        status: document.status === 'error' ? 'skipped' : 'created',
        id: document.documentId ?? null,
        message: document.status === 'error' ? document.error ?? 'Document ingestion failed.' : 'Document ingested.',
      }
    }
  } else {
    result = {
      kind: input.kind,
      status: 'skipped',
      id: null,
      message: 'Recall tests are not stored as memory.',
    }
  }

  void recordKnowledgeOperationEvent({
    orgId: input.org_id,
    actorUserId: input.actorUserId,
    operationId: `brain.remember.${input.kind}`,
    surface,
    success: result.status === 'created',
    durationMs: Date.now() - startedAt,
    input: {
      kind: input.kind,
      title: input.title,
      projectId: input.project_id ?? null,
      teamId: input.team_id ?? null,
      assistantId: input.assistant_id ?? null,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
    },
    outputSummary: result.message,
    metadata: {
      brainRuntime: '2026-05-11.brain-remember.v1',
      resultId: result.id,
      status: result.status,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
    },
  })

  return result
}

function normalizeBrainSurface(surface: BrainOperationSurface | undefined): KnowledgeOperationSurface {
  return surface === 'runtime' ? 'external_agent' : surface ?? 'app_api'
}

function mapGuidanceKind(kind: BrainRememberRequest['guidance_kind'] | undefined): SharedContextRecordType {
  if (kind === 'policy' || kind === 'decision' || kind === 'risk' || kind === 'thesis' || kind === 'signal' || kind === 'open_question') {
    return kind
  }
  if (kind === 'preference' || kind === 'take' || kind === 'bet' || kind === 'hunch') return 'memory'
  return 'memory'
}
