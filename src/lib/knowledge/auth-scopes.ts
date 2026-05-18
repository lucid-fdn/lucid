import type { ExternalKnowledgeClient, KnowledgeAuthScope } from '@contracts/knowledge-auth'
import {
  getKnowledgeOperation,
  type KnowledgeOperationId,
  type KnowledgeOperationInput,
} from './operations'

export const KNOWLEDGE_AUTH_SCOPES: readonly KnowledgeAuthScope[] = [
  'knowledge:read',
  'knowledge:write',
  'knowledge:governance',
  'knowledge:sources',
  'knowledge:claims',
  'knowledge:evals',
  'agent_ops:launch',
  'agent_ops:read',
  'agent_ops:governance',
] as const

const KNOWLEDGE_OPERATION_ALIASES = new Map<string, KnowledgeOperationId>([
  ['knowledge.create_claim', 'knowledge.claims.create'],
  ['knowledge.list_claims', 'knowledge.claims.list'],
  ['knowledge.update_claim', 'knowledge.claims.update'],
  ['knowledge.list_sources', 'knowledge.list_sources'],
])

export function normalizeKnowledgeOperationId(operation: string): KnowledgeOperationId | null {
  const aliased = KNOWLEDGE_OPERATION_ALIASES.get(operation)
  if (aliased) return aliased
  return getKnowledgeOperation(operation)?.id ?? null
}

export function getKnowledgeAuthScopesForOperation(
  operationId: KnowledgeOperationId,
  input?: KnowledgeOperationInput,
): KnowledgeAuthScope[] {
  if (operationId === 'knowledge.retrieve_context') return ['knowledge:read']
  if (operationId === 'knowledge.think') {
    return (input as KnowledgeOperationInput<'knowledge.think'> | undefined)?.persist_claim
      ? ['knowledge:read', 'knowledge:claims']
      : ['knowledge:read']
  }
  if (operationId === 'knowledge.explain') return ['knowledge:read']
  if (operationId === 'knowledge.claims.list') return ['knowledge:read', 'knowledge:claims']
  if (operationId === 'knowledge.claims.create') return ['knowledge:claims']
  if (operationId === 'knowledge.claims.update') return ['knowledge:claims', 'knowledge:governance']
  if (operationId === 'knowledge.write_project' || operationId === 'knowledge.write_team') return ['knowledge:write']
  if (operationId === 'knowledge.remember_org' || operationId === 'knowledge.forget_org') return ['knowledge:write']
  if (operationId === 'knowledge.list_sources') return ['knowledge:read', 'knowledge:sources']
  if (operationId.startsWith('knowledge.imports.')) return ['knowledge:sources']
  if (operationId === 'knowledge.update_source') return ['knowledge:sources', 'knowledge:governance']
  if (operationId === 'knowledge.list_entities' || operationId === 'knowledge.graph_neighbors') return ['knowledge:read']
  if (operationId === 'knowledge.update_maintenance_event') return ['knowledge:governance']
  return ['knowledge:read']
}

export function hasKnowledgeAuthScopes(
  clientScopes: readonly KnowledgeAuthScope[],
  requiredScopes: readonly KnowledgeAuthScope[],
): boolean {
  const granted = new Set(clientScopes)
  return requiredScopes.every((scope) => granted.has(scope))
}

export function bindExternalKnowledgeInput(
  client: ExternalKnowledgeClient,
  input: unknown,
): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? { ...(input as Record<string, unknown>) }
    : {}

  record.org_id = client.orgId

  const requestedProjectId = readNullableString(record.project_id)
  const requestedTeamId = readNullableString(record.team_id)
  if (client.projectId && requestedProjectId && requestedProjectId !== client.projectId) {
    return { ok: false, error: 'External client is scoped to a different project' }
  }
  if (client.teamId && requestedTeamId && requestedTeamId !== client.teamId) {
    return { ok: false, error: 'External client is scoped to a different team' }
  }
  if (client.projectId && requestedProjectId == null) record.project_id = client.projectId
  if (client.teamId && requestedTeamId == null) record.team_id = client.teamId

  return { ok: true, input: record }
}

export function listExternalClientAllowedKnowledgeOperations(client: ExternalKnowledgeClient): KnowledgeOperationId[] {
  const allowed = new Set<KnowledgeOperationId>()
  const sampleInput = { persist_claim: false } as KnowledgeOperationInput
  for (const operation of getAllKnowledgeOperationIds()) {
    const scopes = getKnowledgeAuthScopesForOperation(operation, sampleInput)
    if (hasKnowledgeAuthScopes(client.scopes, scopes)) allowed.add(operation)
  }
  return [...allowed]
}

function getAllKnowledgeOperationIds(): KnowledgeOperationId[] {
  return [
    'knowledge.retrieve_context',
    'knowledge.think',
    'knowledge.explain',
    'knowledge.claims.list',
    'knowledge.claims.create',
    'knowledge.claims.update',
    'knowledge.write_project',
    'knowledge.write_team',
    'knowledge.remember_org',
    'knowledge.forget_org',
    'knowledge.list_sources',
    'knowledge.imports.list',
    'knowledge.imports.create',
    'knowledge.imports.preview',
    'knowledge.imports.commit',
    'knowledge.update_source',
    'knowledge.list_entities',
    'knowledge.graph_neighbors',
    'knowledge.update_maintenance_event',
  ]
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}
