import { z } from 'zod'

import {
  KnowledgeClaimEvidenceSchema,
  KnowledgeClaimHolderTypeSchema,
  KnowledgeClaimResolvedOutcomeSchema,
  KnowledgeClaimStatusSchema,
  KnowledgeClaimTypeSchema,
} from '@contracts/knowledge-claims'
import {
  KnowledgeImportCommitRequestSchema,
  KnowledgeImportModeSchema,
  KnowledgeImportPayloadItemSchema,
  KnowledgeImportSourceTypeSchema,
  KnowledgeImportStatusSchema,
} from '@contracts/knowledge-imports'

const uuidSchema = z.string().uuid()
const nullableUuidSchema = uuidSchema.nullable().optional()

const knowledgeLayerSchema = z.enum([
  'session',
  'assistant_memory',
  'team_brain',
  'project_brain',
  'org_brain',
  'claims',
  'rag',
  'evidence',
  'l2',
])

const evidenceSchema = z.object({
  kind: z.enum(['run', 'channel_event', 'message', 'file', 'url', 'screenshot', 'transcript', 'diff', 'log', 'approval', 'l2_proof', 'commerce_event']),
  runId: z.string().nullable().optional(),
  channelEventId: z.string().nullable().optional(),
  messageId: z.string().nullable().optional(),
  artifactId: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  l2ReceiptId: z.string().nullable().optional(),
  commerceEventId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
})

const sourceSchema = z.object({
  type: z.enum(['channel', 'file', 'repo', 'url', 'run', 'manual', 'project', 'team', 'org', 'engine_home', 'agent_ops', 'agent_commerce', 'board_memory']).default('manual'),
  label: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  visibility: z.enum(['private', 'team', 'project', 'org', 'federated']).optional(),
  trust_level: z.enum(['unverified', 'observed', 'operator_approved', 'system', 'l2_verified']).optional(),
  federation_policy: z.enum(['isolated', 'source_scoped', 'org_federated']).optional(),
  retention_policy: z.enum(['ephemeral', 'standard', 'audit', 'legal_hold']).optional(),
})

const entityTypeSchema = z.enum([
  'person',
  'company',
  'project',
  'repo',
  'pull_request',
  'channel',
  'url',
  'agent',
  'decision',
  'integration',
  'topic',
])

export const knowledgeOperationSchemas = {
  'knowledge.retrieve_context': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    assistant_id: nullableUuidSchema,
    scoped_user_id: z.string().nullable().optional(),
    query: z.string().min(1).max(4000),
    layers: z.array(knowledgeLayerSchema).optional(),
    mode: z.enum(['summary', 'evidence', 'full']).optional(),
    proof_mode: z.enum(['off', 'optional', 'required']).optional(),
    budget: z.object({
      max_latency_ms: z.number().int().positive().max(5000).optional(),
      max_prompt_tokens: z.number().int().positive().max(20000).optional(),
      max_items_per_layer: z.number().int().positive().max(50).optional(),
    }).optional(),
  }),
  'knowledge.think': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    assistant_id: nullableUuidSchema,
    scoped_user_id: z.string().nullable().optional(),
    query: z.string().min(1).max(4000),
    mode: z.enum(['answer', 'compare', 'decision', 'risk']).optional(),
    persist_claim: z.boolean().optional(),
  }),
  'knowledge.explain': z.object({
    org_id: uuidSchema,
    knowledge_id: uuidSchema,
    include_timeline: z.boolean().optional(),
    include_proofs: z.boolean().optional(),
  }),
  'knowledge.claims.list': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    assistant_id: nullableUuidSchema,
    query: z.string().max(500).nullable().optional(),
    status: KnowledgeClaimStatusSchema.optional(),
    claim_type: KnowledgeClaimTypeSchema.optional(),
    limit: z.number().int().positive().max(200).optional(),
  }),
  'knowledge.claims.create': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    assistant_id: nullableUuidSchema,
    source_id: nullableUuidSchema,
    page_id: nullableUuidSchema,
    claim_type: KnowledgeClaimTypeSchema.default('claim'),
    subject: z.string().min(1).max(240),
    claim: z.string().min(1).max(8000),
    holder_type: KnowledgeClaimHolderTypeSchema.default('agent'),
    holder_id: z.string().max(240).nullable().optional(),
    confidence: z.number().min(0).max(1).default(0.7),
    weight: z.number().min(0).max(1).default(0.5),
    status: KnowledgeClaimStatusSchema.default('active'),
    valid_from: z.string().datetime().nullable().optional(),
    valid_until: z.string().datetime().nullable().optional(),
    evidence: z.array(KnowledgeClaimEvidenceSchema).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  'knowledge.claims.update': z.object({
    org_id: uuidSchema,
    claim_id: uuidSchema,
    status: KnowledgeClaimStatusSchema,
    outcome: KnowledgeClaimResolvedOutcomeSchema.nullable().optional(),
    summary: z.string().max(2000).optional(),
  }),
  'knowledge.write_project': z.object({
    org_id: uuidSchema,
    project_id: uuidSchema,
    subject: z.string().min(1).max(240),
    compiled_truth: z.string().min(1).max(20000),
    event_type: z.enum(['created', 'updated', 'corrected', 'superseded', 'archived']).optional(),
    event_summary: z.string().min(1).max(4000).optional(),
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.array(evidenceSchema).optional().default([]),
    source: sourceSchema.optional(),
  }),
  'knowledge.write_team': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: uuidSchema,
    subject: z.string().min(1).max(240),
    compiled_truth: z.string().min(1).max(20000),
    event_type: z.enum(['created', 'updated', 'corrected', 'superseded', 'archived']).optional(),
    event_summary: z.string().min(1).max(4000).optional(),
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.array(evidenceSchema).optional().default([]),
    source: sourceSchema.optional(),
  }),
  'knowledge.remember_org': z.object({
    org_id: uuidSchema,
    content: z.string().min(1).max(10000),
    category: z.enum(['insight', 'policy', 'alert', 'context']).optional(),
    importance: z.number().min(0).max(1).optional(),
  }),
  'knowledge.forget_org': z.object({
    org_id: uuidSchema,
    memory_id: uuidSchema,
  }),
  'knowledge.list_sources': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    include_archived: z.boolean().optional(),
    due_for_refresh_only: z.boolean().optional(),
    limit: z.number().int().positive().max(200).optional(),
  }),
  'knowledge.imports.list': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    status: KnowledgeImportStatusSchema.optional(),
    limit: z.number().int().positive().max(200).optional(),
  }),
  'knowledge.imports.create': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    source_type: KnowledgeImportSourceTypeSchema,
    mode: KnowledgeImportModeSchema.default('preview'),
    status: KnowledgeImportStatusSchema.default('queued'),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  'knowledge.imports.preview': z.object({
    org_id: uuidSchema,
    import_job_id: uuidSchema,
    raw_text: z.string().min(1).max(500_000).optional(),
    items: z.array(KnowledgeImportPayloadItemSchema).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  'knowledge.imports.commit': KnowledgeImportCommitRequestSchema.extend({
    import_job_id: uuidSchema,
  }),
  'knowledge.update_source': z.object({
    org_id: uuidSchema,
    source_id: uuidSchema,
    label: z.string().min(1).max(240).nullable().optional(),
    visibility: z.enum(['private', 'team', 'project', 'org', 'federated']).optional(),
    trust_level: z.enum(['unverified', 'observed', 'operator_approved', 'system', 'l2_verified']).optional(),
    federation_policy: z.enum(['isolated', 'source_scoped', 'org_federated']).optional(),
    retention_policy: z.enum(['ephemeral', 'standard', 'audit', 'legal_hold']).optional(),
    status: z.enum(['active', 'paused', 'stale', 'errored', 'archived']).optional(),
    include_in_retrieval: z.boolean().optional(),
    refresh_policy: z.enum(['manual', 'on_change', 'scheduled']).optional(),
    refresh_interval_seconds: z.number().int().min(300).nullable().optional(),
    stale_after: z.string().datetime().nullable().optional(),
  }),
  'knowledge.list_entities': z.object({
    org_id: uuidSchema,
    project_id: nullableUuidSchema,
    team_id: nullableUuidSchema,
    query: z.string().max(240).optional(),
    types: z.array(entityTypeSchema).optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
  'knowledge.graph_neighbors': z.object({
    org_id: uuidSchema,
    entity_id: uuidSchema,
    limit: z.number().int().positive().max(100).optional(),
  }),
  'knowledge.update_maintenance_event': z.object({
    org_id: uuidSchema,
    event_id: uuidSchema,
    status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']),
  }),
} as const

export type KnowledgeOperationId = keyof typeof knowledgeOperationSchemas
export type KnowledgeOperationInput<T extends KnowledgeOperationId = KnowledgeOperationId> = z.infer<(typeof knowledgeOperationSchemas)[T]>
export type KnowledgeOperationSurface = 'app_api' | 'mission_control' | 'worker_tool' | 'mcp' | 'agent_ops' | 'external_agent'
export type KnowledgeOperationMutationClass = 'read' | 'write' | 'governance'

export interface KnowledgeOperationDefinition {
  id: KnowledgeOperationId
  title: string
  description: string
  mutation: KnowledgeOperationMutationClass
  requiresRole: 'member' | 'admin'
  latencyClass: 'hot_path' | 'interactive' | 'background'
  returns: string
  mcpName: string
  agentOpsAction: string | null
}

export interface KnowledgeOperationEnvelope<T = unknown> {
  ok: boolean
  operation: KnowledgeOperationId | string | null
  requestId: string
  durationMs: number
  result?: T
  error?: {
    code: 'validation_failed' | 'unauthorized' | 'forbidden' | 'not_found' | 'operation_failed'
    message: string
    details?: unknown
  }
}

export const KNOWLEDGE_OPERATIONS: readonly KnowledgeOperationDefinition[] = [
  {
    id: 'knowledge.retrieve_context',
    title: 'Retrieve Knowledge Context',
    description: 'Return a bounded KnowledgePromptPacket for one query, scope, runtime, and proof mode.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'hot_path',
    returns: 'KnowledgePromptPacket',
    mcpName: 'lucid_knowledge_retrieve_context',
    agentOpsAction: 'knowledge.lookup',
  },
  {
    id: 'knowledge.think',
    title: 'Think With Knowledge',
    description: 'Synthesize scoped Knowledge, claims, search matches, and citations into a structured answer.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge Think result',
    mcpName: 'lucid_knowledge_think',
    agentOpsAction: 'knowledge.think',
  },
  {
    id: 'knowledge.explain',
    title: 'Explain Knowledge',
    description: 'Explain why Lucid believes a Knowledge page, including source, evidence, versions, and timeline.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge explanation',
    mcpName: 'lucid_knowledge_explain',
    agentOpsAction: 'knowledge.explain',
  },
  {
    id: 'knowledge.claims.list',
    title: 'List Knowledge Claims',
    description: 'List durable facts, claims, risks, decisions, hunches, bets, and preferences for a scoped brain.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge claims',
    mcpName: 'lucid_knowledge_claims_list',
    agentOpsAction: 'knowledge.claims.list',
  },
  {
    id: 'knowledge.claims.create',
    title: 'Create Knowledge Claim',
    description: 'Create a scoped, evidence-backed Knowledge claim with provenance and confidence.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge claim',
    mcpName: 'lucid_knowledge_claims_create',
    agentOpsAction: 'knowledge.claims.create',
  },
  {
    id: 'knowledge.claims.update',
    title: 'Update Knowledge Claim',
    description: 'Resolve, dismiss, archive, or supersede the lifecycle status of a Knowledge claim.',
    mutation: 'governance',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge claim',
    mcpName: 'lucid_knowledge_claims_update',
    agentOpsAction: 'knowledge.claims.update',
  },
  {
    id: 'knowledge.write_project',
    title: 'Write Project Knowledge',
    description: 'Write or correct a versioned project-brain compiled truth with evidence.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge page',
    mcpName: 'lucid_knowledge_write_project',
    agentOpsAction: 'knowledge.promote_to_project',
  },
  {
    id: 'knowledge.write_team',
    title: 'Write Team Knowledge',
    description: 'Write or correct a versioned team-brain compiled truth with evidence.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge page',
    mcpName: 'lucid_knowledge_write_team',
    agentOpsAction: 'knowledge.promote_to_team',
  },
  {
    id: 'knowledge.remember_org',
    title: 'Remember Organization Context',
    description: 'Store lightweight org-wide board memory for policy, context, alerts, or insights.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Board memory',
    mcpName: 'lucid_knowledge_remember_org',
    agentOpsAction: 'knowledge.remember_org',
  },
  {
    id: 'knowledge.forget_org',
    title: 'Forget Organization Context',
    description: 'Remove obsolete org board memory.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Delete confirmation',
    mcpName: 'lucid_knowledge_forget_org',
    agentOpsAction: 'knowledge.forget_org',
  },
  {
    id: 'knowledge.list_sources',
    title: 'List Knowledge Sources',
    description: 'List source governance state, freshness, trust, and retrieval inclusion.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge sources',
    mcpName: 'lucid_knowledge_list_sources',
    agentOpsAction: 'knowledge.source_inventory',
  },
  {
    id: 'knowledge.imports.list',
    title: 'List Knowledge Imports',
    description: 'List transcript, artifact, document, and session import jobs for a scoped brain.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge import jobs',
    mcpName: 'lucid_knowledge_imports_list',
    agentOpsAction: 'knowledge.imports.list',
  },
  {
    id: 'knowledge.imports.create',
    title: 'Create Knowledge Import',
    description: 'Create a probe, preview, commit, or incremental Knowledge import job.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge import job',
    mcpName: 'lucid_knowledge_imports_create',
    agentOpsAction: 'knowledge.imports.create',
  },
  {
    id: 'knowledge.imports.preview',
    title: 'Preview Knowledge Import',
    description: 'Parse transcripts, artifacts, documents, or sessions, secret-scan them, and prepare redacted preview items without committing Knowledge.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Redacted import preview items and dedupe summary',
    mcpName: 'lucid_knowledge_imports_preview',
    agentOpsAction: 'knowledge.imports.preview',
  },
  {
    id: 'knowledge.imports.commit',
    title: 'Commit Knowledge Import',
    description: 'Commit previewed and redacted Knowledge import items as evidence-backed claims.',
    mutation: 'write',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Committed claim references and import summary',
    mcpName: 'lucid_knowledge_imports_commit',
    agentOpsAction: 'knowledge.imports.commit',
  },
  {
    id: 'knowledge.update_source',
    title: 'Update Knowledge Source Policy',
    description: 'Pause, archive, trust, federate, retain, or exclude one Knowledge source.',
    mutation: 'governance',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge source',
    mcpName: 'lucid_knowledge_update_source',
    agentOpsAction: 'knowledge.source_policy',
  },
  {
    id: 'knowledge.list_entities',
    title: 'List Knowledge Entities',
    description: 'List graph entities for a scope, query, or entity type.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge entities',
    mcpName: 'lucid_knowledge_list_entities',
    agentOpsAction: 'knowledge.graph_lookup',
  },
  {
    id: 'knowledge.graph_neighbors',
    title: 'Get Graph Neighbors',
    description: 'Return capped graph neighbors for one entity.',
    mutation: 'read',
    requiresRole: 'member',
    latencyClass: 'interactive',
    returns: 'Knowledge graph neighbors',
    mcpName: 'lucid_knowledge_graph_neighbors',
    agentOpsAction: 'knowledge.graph_expand',
  },
  {
    id: 'knowledge.update_maintenance_event',
    title: 'Update Brain Ops Finding',
    description: 'Acknowledge, resolve, dismiss, or reopen one Brain Ops maintenance finding.',
    mutation: 'governance',
    requiresRole: 'admin',
    latencyClass: 'interactive',
    returns: 'Knowledge maintenance event',
    mcpName: 'lucid_knowledge_update_maintenance_event',
    agentOpsAction: 'knowledge.brain_ops_triage',
  },
] as const

const operationById = new Map(KNOWLEDGE_OPERATIONS.map((operation) => [operation.id, operation]))

export function getKnowledgeOperation(id: string): KnowledgeOperationDefinition | null {
  return operationById.get(id as KnowledgeOperationId) ?? null
}

export function listKnowledgeOperations(): KnowledgeOperationDefinition[] {
  return [...KNOWLEDGE_OPERATIONS]
}

export function validateKnowledgeOperationInput<T extends KnowledgeOperationId>(
  operationId: T,
  input: unknown,
): KnowledgeOperationInput<T> {
  return knowledgeOperationSchemas[operationId].parse(input) as KnowledgeOperationInput<T>
}

export function getKnowledgeOperationOrgId(input: KnowledgeOperationInput): string {
  return (input as { org_id: string }).org_id
}

export function toMcpToolDefinitions() {
  return KNOWLEDGE_OPERATIONS.map((operation) => ({
    name: operation.mcpName,
    description: operation.description,
    operationId: operation.id,
    requiresRole: operation.requiresRole,
    mutation: operation.mutation,
    latencyClass: operation.latencyClass,
  }))
}

export function toWorkerToolDefinitions() {
  return KNOWLEDGE_OPERATIONS.map((operation) => ({
    id: operation.id,
    name: operation.mcpName,
    title: operation.title,
    description: operation.description,
    safeForHotPath: operation.latencyClass === 'hot_path' && operation.mutation === 'read',
    requiresRole: operation.requiresRole,
  }))
}

export function toAgentOpsActionDefinitions() {
  return KNOWLEDGE_OPERATIONS
    .filter((operation) => operation.agentOpsAction)
    .map((operation) => ({
      action: operation.agentOpsAction,
      operationId: operation.id,
      title: operation.title,
      mutation: operation.mutation,
      requiresRole: operation.requiresRole,
    }))
}
