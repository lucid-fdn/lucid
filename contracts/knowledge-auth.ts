import { z } from 'zod'

export const KnowledgeAuthScopeSchema = z.enum([
  'knowledge:read',
  'knowledge:write',
  'knowledge:governance',
  'knowledge:sources',
  'knowledge:claims',
  'knowledge:evals',
  'agent_ops:launch',
  'agent_ops:read',
  'agent_ops:governance',
])

export type KnowledgeAuthScope = z.infer<typeof KnowledgeAuthScopeSchema>

export const ExternalKnowledgeClientManifestSchema = z.object({
  schemaVersion: z.literal('2026-05-07.external-knowledge-client.v1'),
  clientId: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  scopes: z.array(KnowledgeAuthScopeSchema).min(1),
  expiresAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type ExternalKnowledgeClientManifest = z.infer<typeof ExternalKnowledgeClientManifestSchema>

export const ExternalKnowledgeClientSchema = ExternalKnowledgeClientManifestSchema.extend({
  id: z.string().uuid(),
  status: z.enum(['active', 'revoked', 'expired']),
  lastUsedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ExternalKnowledgeClient = z.infer<typeof ExternalKnowledgeClientSchema>

export const ExternalKnowledgeClientSetupSchema = z.object({
  schemaVersion: z.literal('2026-05-07.external-knowledge-client-setup.v1'),
  manifest: ExternalKnowledgeClientManifestSchema,
  endpointUrl: z.string().url(),
  mcpEndpointUrl: z.string().url(),
  tokenPreview: z.string(),
  token: z.string().nullable(),
  scopes: z.array(KnowledgeAuthScopeSchema),
  allowedOperations: z.array(z.string()),
  mcpConfig: z.object({
    mcpServers: z.object({
      lucid_knowledge: z.object({
        url: z.string().url(),
        headers: z.object({
          Authorization: z.string(),
        }),
      }),
    }),
  }),
  curlExample: z.string(),
})

export type ExternalKnowledgeClientSetup = z.infer<typeof ExternalKnowledgeClientSetupSchema>
