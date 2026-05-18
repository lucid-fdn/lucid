import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { createKnowledgeSource } from '@/lib/db'
import type { KnowledgeSourceType } from '@/lib/knowledge/types'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'

const KNOWLEDGE_SOURCE_TYPES = new Set<KnowledgeSourceType>([
  'channel',
  'file',
  'repo',
  'url',
  'run',
  'manual',
  'project',
  'team',
  'org',
  'engine_home',
  'agent_ops',
  'agent_commerce',
  'board_memory',
])

export async function provisionKnowledgeSourceResource(
  context: CapabilityTemplateProvisionContext,
  resource: LucidPackManagedResource,
  desired: LucidPackManifest['resources'][number],
): Promise<CapabilityTemplateProvisionResult> {
  if (resource.resourceId) {
    return {
      resourceKey: resource.resourceKey,
      resourceKind: resource.resourceKind,
      status: 'provisioned',
      resourceId: resource.resourceId,
      message: 'Knowledge source already provisioned.',
    }
  }

  const spec = desired.spec
  const requestedType = readString(spec.source_type) ?? readString(spec.type) ?? 'manual'
  const type = KNOWLEDGE_SOURCE_TYPES.has(requestedType as KnowledgeSourceType)
    ? requestedType as KnowledgeSourceType
    : 'manual'
  const source = await createKnowledgeSource({
    id: `capability-template:${context.install.id}:${resource.resourceKey}`,
    type,
    orgId: context.orgId,
    projectId: readScope(spec) === 'org' ? null : context.install.projectId ?? null,
    teamId: null,
    assistantId: null,
    url: type === 'url' ? readString(spec.url) : null,
    label: readString(spec.label) ?? desired.name,
    visibility: readVisibility(spec.visibility),
    trustLevel: readTrustLevel(spec.trust_level),
    federationPolicy: readFederationPolicy(spec.federation_policy),
    retentionPolicy: readRetentionPolicy(spec.retention_policy),
    includeInRetrieval: spec.include_in_retrieval !== false,
    refreshPolicy: readRefreshPolicy(spec.refresh_policy),
    refreshIntervalSeconds: readNumber(spec.refresh_interval_seconds),
  })

  if (!source) {
    return markNeedsSetup(context, resource, desired, 'Knowledge source could not be created.')
  }

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: source.id,
    metadata: buildProvisioningMetadata({
      status: 'provisioned',
      message: 'Knowledge source created in Lucid Knowledge.',
      resourceId: source.id,
      provider: 'lucid-knowledge',
      spec: {
        ...spec,
        requested_source_type: requestedType,
        materialized_source_type: type,
      },
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'provisioned',
    resourceId: source.id,
    message: 'Knowledge source created in Lucid Knowledge.',
  }
}

async function markNeedsSetup(
  context: CapabilityTemplateProvisionContext,
  resource: LucidPackManagedResource,
  desired: LucidPackManifest['resources'][number],
  message: string,
): Promise<CapabilityTemplateProvisionResult> {
  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: null,
    metadata: buildProvisioningMetadata({
      status: 'needs_setup',
      message,
      provider: 'lucid-knowledge',
      spec: desired.spec,
    }),
  })
  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'needs_setup',
    resourceId: null,
    message,
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function readScope(value: Record<string, unknown>): 'project' | 'org' {
  return value.scope === 'org' ? 'org' : 'project'
}

function readVisibility(value: unknown) {
  return value === 'private' || value === 'team' || value === 'project' || value === 'org' || value === 'federated'
    ? value
    : 'project'
}

function readTrustLevel(value: unknown) {
  return value === 'unverified' || value === 'observed' || value === 'operator_approved' || value === 'system' || value === 'l2_verified'
    ? value
    : 'observed'
}

function readFederationPolicy(value: unknown) {
  return value === 'isolated' || value === 'source_scoped' || value === 'org_federated'
    ? value
    : 'source_scoped'
}

function readRetentionPolicy(value: unknown) {
  return value === 'ephemeral' || value === 'standard' || value === 'audit' || value === 'legal_hold'
    ? value
    : 'standard'
}

function readRefreshPolicy(value: unknown) {
  return value === 'manual' || value === 'on_change' || value === 'scheduled'
    ? value
    : 'manual'
}
