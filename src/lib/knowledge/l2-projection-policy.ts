import crypto from 'node:crypto'

import type {
  KnowledgeSource,
  KnowledgeTrustLevel,
  KnowledgeVisibility,
} from './types'

export type KnowledgeL2ResourceType =
  | 'assistant_memory'
  | 'team_brain'
  | 'project_brain'
  | 'org_brain'
  | 'evidence'
  | 'run_receipt'
  | 'knowledge_page'
  | 'knowledge_event'

export type KnowledgeL2ProjectionPolicy =
  | 'disabled'
  | 'commitment_only'
  | 'encrypted_payload'
  | 'public_payload'

export interface ResolveKnowledgeL2ProjectionPolicyInput {
  enabled?: boolean
  resourceType: KnowledgeL2ResourceType
  visibility?: KnowledgeVisibility | null
  trustLevel?: KnowledgeTrustLevel | null
  federationPolicy?: KnowledgeSource['federationPolicy'] | null
  retentionPolicy?: KnowledgeSource['retentionPolicy'] | null
  allowPublicPayload?: boolean
  hasEncryptedPayload?: boolean
}

export interface KnowledgeL2IdentityInput {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
  agentPassportId?: string | null
  channelType?: string | null
  channelId?: string | null
  conversationId?: string | null
}

export interface KnowledgeL2ProjectionIdentity {
  namespace: string
  scopedUserId: string | null
  agentPassportId: string | null
  channelType: string | null
  channelId: string | null
  conversationId: string | null
}

export function resolveKnowledgeL2ProjectionPolicy(
  input: ResolveKnowledgeL2ProjectionPolicyInput,
): KnowledgeL2ProjectionPolicy {
  if (!input.enabled) return 'disabled'
  if (input.retentionPolicy === 'ephemeral') return 'disabled'

  const visibility = input.visibility ?? 'private'
  const trustLevel = input.trustLevel ?? 'unverified'
  const isPrivateScope = visibility === 'private' || visibility === 'team' || visibility === 'project'
  const isHighTrust = trustLevel === 'operator_approved' || trustLevel === 'system' || trustLevel === 'l2_verified'
  const canFederate = input.federationPolicy === 'org_federated' || visibility === 'federated'

  if (input.hasEncryptedPayload && isHighTrust) return 'encrypted_payload'

  if (
    input.allowPublicPayload
    && !isPrivateScope
    && canFederate
    && (visibility === 'org' || visibility === 'federated')
    && isHighTrust
  ) {
    return 'public_payload'
  }

  return 'commitment_only'
}

export function mapKnowledgeScopeToL2ResourceType(input: {
  scopeType?: 'project' | 'team' | 'org' | null
}): KnowledgeL2ResourceType {
  if (input.scopeType === 'team') return 'team_brain'
  if (input.scopeType === 'org') return 'org_brain'
  return 'project_brain'
}

export function buildKnowledgeL2Namespace(input: KnowledgeL2IdentityInput & {
  resourceType?: KnowledgeL2ResourceType
}): string {
  const parts = [`org:${input.orgId}`]
  if (input.projectId) parts.push(`project:${input.projectId}`)
  if (input.teamId) parts.push(`team:${input.teamId}`)
  if (input.assistantId) parts.push(`assistant:${input.assistantId}`)
  if (input.resourceType) parts.push(input.resourceType)
  return parts.join(':')
}

export function resolveKnowledgeL2Identity(
  input: KnowledgeL2IdentityInput & { resourceType?: KnowledgeL2ResourceType },
): KnowledgeL2ProjectionIdentity {
  return {
    namespace: buildKnowledgeL2Namespace(input),
    scopedUserId: input.scopedUserId ?? null,
    agentPassportId: input.agentPassportId ?? null,
    channelType: input.channelType ?? null,
    channelId: input.channelId ?? null,
    conversationId: input.conversationId ?? null,
  }
}

export function hashKnowledgeL2Content(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

export function buildRedactedKnowledgeL2Payload(input: {
  resourceType: KnowledgeL2ResourceType
  subject?: string | null
  scopeType?: string | null
  source?: KnowledgeSource | null
  eventSummary?: string | null
  evidenceCount?: number
  trustLevel?: KnowledgeTrustLevel | null
  visibility?: KnowledgeVisibility | null
  contentHash: string
}): Record<string, unknown> {
  return {
    resourceType: input.resourceType,
    subject: input.subject ?? null,
    scopeType: input.scopeType ?? null,
    sourceType: input.source?.type ?? null,
    sourceLabel: input.source?.label ?? null,
    visibility: input.visibility ?? input.source?.visibility ?? null,
    trustLevel: input.trustLevel ?? input.source?.trustLevel ?? null,
    eventSummary: input.eventSummary ?? null,
    evidenceCount: input.evidenceCount ?? 0,
    contentHash: input.contentHash,
  }
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}
