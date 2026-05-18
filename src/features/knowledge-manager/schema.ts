import { z } from 'zod'

export const knowledgeScopeTypeSchema = z.enum(['workspace', 'project', 'team', 'agent'])

export const createKnowledgeFactSchema = z.object({
  org_id: z.string().uuid(),
  scope_type: knowledgeScopeTypeSchema,
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  subject: z.string().min(1).max(240),
  truth: z.string().min(1).max(20_000),
  trust_level: z.enum(['observed', 'operator_approved', 'system', 'l2_verified']).optional(),
  evidence: z.array(z.object({
    kind: z.enum(['run', 'channel_event', 'message', 'file', 'url', 'screenshot', 'transcript', 'diff', 'log', 'approval', 'l2_proof']),
    runId: z.string().nullable().optional(),
    channelEventId: z.string().nullable().optional(),
    messageId: z.string().nullable().optional(),
    artifactId: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    l2ReceiptId: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
  })).optional().default([]),
})

export const updateKnowledgeFactSchema = z.object({
  org_id: z.string().uuid(),
  storage_type: z.enum(['board_memory', 'knowledge_page']),
  subject: z.string().min(1).max(240).optional(),
  truth: z.string().min(1).max(20_000).optional(),
  trust_level: z.enum(['observed', 'operator_approved', 'system', 'l2_verified']).optional(),
  archive: z.boolean().optional(),
})

export const createKnowledgeDocumentSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  source_type: z.enum(['file', 'url', 'paste', 'api']).default('paste'),
  source_url: z.string().url().nullable().optional(),
  file_name: z.string().nullable().optional(),
  file_size_bytes: z.number().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  visibility: z.enum(['private', 'team', 'project', 'org', 'federated']).optional(),
  trust_level: z.enum(['unverified', 'observed', 'operator_approved', 'system', 'l2_verified']).optional(),
  retention_policy: z.enum(['ephemeral', 'standard', 'audit', 'legal_hold']).optional(),
  refresh_policy: z.enum(['manual', 'on_change', 'scheduled']).optional(),
  idempotency_key: z.string().max(200).optional(),
})

export const createKnowledgeSourceSchema = z.object({
  org_id: z.string().uuid(),
  scope_type: knowledgeScopeTypeSchema,
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  type: z.enum(['channel', 'file', 'repo', 'url', 'run', 'manual', 'project', 'team', 'org', 'engine_home', 'agent_ops', 'board_memory']),
  label: z.string().min(1).max(240),
  url: z.string().url().nullable().optional(),
  source_ref: z.string().max(500).nullable().optional(),
  visibility: z.enum(['private', 'team', 'project', 'org', 'federated']).optional(),
  trust_level: z.enum(['unverified', 'observed', 'operator_approved', 'system', 'l2_verified']).optional(),
  federation_policy: z.enum(['isolated', 'source_scoped', 'org_federated']).optional(),
  retention_policy: z.enum(['ephemeral', 'standard', 'audit', 'legal_hold']).optional(),
  refresh_policy: z.enum(['manual', 'on_change', 'scheduled']).optional(),
})

export const testKnowledgeRecallSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  scoped_user_id: z.string().nullable().optional(),
  query: z.string().min(1).max(4000),
  channel_type: z.string().max(80).nullable().optional(),
  runtime: z.string().max(80).nullable().optional(),
  engine: z.string().max(80).nullable().optional(),
  proof_mode: z.enum(['off', 'optional', 'required']).optional(),
})

export type CreateKnowledgeFactInput = z.infer<typeof createKnowledgeFactSchema>
export type UpdateKnowledgeFactInput = z.infer<typeof updateKnowledgeFactSchema>
export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>
export type CreateKnowledgeSourceInput = z.infer<typeof createKnowledgeSourceSchema>
export type TestKnowledgeRecallInput = z.infer<typeof testKnowledgeRecallSchema>
