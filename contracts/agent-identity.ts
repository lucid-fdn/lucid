import { z } from 'zod'

export const AgentIdentityDocumentTypeSchema = z.enum([
  'SOUL',
  'USER',
  'HEARTBEAT',
  'MEMORY_POLICY',
  'ACCESS_POLICY',
  'TOOL_POLICY',
  'CURRENT_CONTEXT',
])

export type AgentIdentityDocumentType = z.infer<typeof AgentIdentityDocumentTypeSchema>

export const AgentIdentityDocumentStatusSchema = z.enum(['draft', 'active', 'superseded', 'archived'])
export type AgentIdentityDocumentStatus = z.infer<typeof AgentIdentityDocumentStatusSchema>

export const AgentIdentityDocumentSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  agent_id: z.string().uuid(),
  document_type: AgentIdentityDocumentTypeSchema,
  version: z.number().int().min(1),
  status: AgentIdentityDocumentStatusSchema,
  content: z.record(z.string(), z.unknown()),
  passport_id: z.string().nullable(),
  wallet_address: z.string().nullable(),
  identity_anchor: z.record(z.string(), z.unknown()),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  supersedes_document_id: z.string().uuid().nullable(),
})

export type AgentIdentityDocument = z.infer<typeof AgentIdentityDocumentSchema>

export const CreateAgentIdentityDocumentSchema = z.object({
  document_type: AgentIdentityDocumentTypeSchema,
  status: AgentIdentityDocumentStatusSchema.default('active'),
  content: z.record(z.string(), z.unknown()),
})

export type CreateAgentIdentityDocumentInput = z.infer<typeof CreateAgentIdentityDocumentSchema>

export const UpdateAgentIdentityDocumentSchema = z.object({
  status: AgentIdentityDocumentStatusSchema.optional(),
  content: z.record(z.string(), z.unknown()).optional(),
})

export type UpdateAgentIdentityDocumentInput = z.infer<typeof UpdateAgentIdentityDocumentSchema>

export interface AgentIdentityPackage {
  agentId: string
  workspaceId: string
  projectId: string | null
  web3Identity?: {
    passportId: string | null
    walletAddress: string | null
    anchor: Record<string, unknown>
  } | null
  documents: Partial<Record<AgentIdentityDocumentType, AgentIdentityDocument>>
  compiledPromptSections: string[]
}
