import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildRegisteredCapabilityResourceId, buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'

const REGISTERED_KINDS = new Set<LucidPackManagedResource['resourceKind']>([
  'workflow',
  'routine',
  'knowledge_source',
  'browser_procedure',
  'host_playbook',
  'skill',
  'doc',
  'channel_command',
])

export async function registerResource(
  context: CapabilityTemplateProvisionContext,
  resource: LucidPackManagedResource,
  desired: LucidPackManifest['resources'][number],
): Promise<CapabilityTemplateProvisionResult> {
  const resourceId = resource.resourceId ?? buildRegisteredCapabilityResourceId({
    installId: context.install.id,
    resourceKey: resource.resourceKey,
  })
  const needsSetup = readRequiredSetup(desired.spec)
  const status = needsSetup.length > 0 ? 'needs_setup' : 'registered'
  const message = needsSetup.length > 0
    ? `Registered, but setup is required: ${needsSetup.join(', ')}.`
    : 'Registered as a capability-template resource.'

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId,
    metadata: buildProvisioningMetadata({
      status,
      message,
      resourceId,
      spec: {
        ...desired.spec,
        capability_template_resource_kind: desired.kind,
      },
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status,
    resourceId,
    message,
  }
}

export function canRegisterResourceKind(kind: LucidPackManagedResource['resourceKind']): boolean {
  return REGISTERED_KINDS.has(kind)
}

function readRequiredSetup(spec: Record<string, unknown>): string[] {
  const value = spec.required_setup
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
