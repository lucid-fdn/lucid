import type {
  ExternalKnowledgeClient,
  ExternalKnowledgeClientSetup,
  ExternalKnowledgeClientManifest,
} from '@contracts/knowledge-auth'
import { redactExternalKnowledgeToken } from './token-issuer'
import { listExternalClientAllowedKnowledgeOperations } from './auth-scopes'

export function buildExternalKnowledgeClientSetup(input: {
  client: ExternalKnowledgeClient
  token?: string | null
  origin: string
}): ExternalKnowledgeClientSetup {
  const origin = input.origin.replace(/\/+$/, '')
  const endpointUrl = `${origin}/api/knowledge/external/operations`
  const mcpEndpointUrl = `${origin}/api/knowledge/mcp`
  const token = input.token ?? null
  const authorization = `Bearer ${token ?? '<LUCID_KNOWLEDGE_TOKEN>'}`
  const manifest = toExternalKnowledgeClientManifest(input.client)
  return {
    schemaVersion: '2026-05-07.external-knowledge-client-setup.v1',
    manifest,
    endpointUrl,
    mcpEndpointUrl,
    tokenPreview: redactExternalKnowledgeToken(token),
    token,
    scopes: input.client.scopes,
    allowedOperations: listExternalClientAllowedKnowledgeOperations(input.client),
    mcpConfig: {
      mcpServers: {
        lucid_knowledge: {
          url: mcpEndpointUrl,
          headers: {
            Authorization: authorization,
          },
        },
      },
    },
    curlExample: [
      'curl',
      '-X POST',
      JSON.stringify(endpointUrl),
      '-H',
      JSON.stringify('Content-Type: application/json'),
      '-H',
      JSON.stringify(`Authorization: ${authorization}`),
      '-d',
      JSON.stringify(JSON.stringify({
        operation: 'knowledge.retrieve_context',
        input: {
          query: 'What should this agent know before continuing?',
        },
      })),
    ].join(' '),
  }
}

export function toExternalKnowledgeClientManifest(client: ExternalKnowledgeClient): ExternalKnowledgeClientManifest {
  return {
    schemaVersion: '2026-05-07.external-knowledge-client.v1',
    clientId: client.id,
    orgId: client.orgId,
    projectId: client.projectId,
    teamId: client.teamId,
    name: client.name,
    scopes: client.scopes,
    expiresAt: client.expiresAt,
    metadata: client.metadata,
  }
}
