import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { getAgentOpsProjectPolicy, upsertAgentOpsProjectPolicy } from '@/lib/db'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildRegisteredCapabilityResourceId, buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'

export async function provisionPolicyResource(
  context: CapabilityTemplateProvisionContext,
  resource: LucidPackManagedResource,
  desired: LucidPackManifest['resources'][number],
): Promise<CapabilityTemplateProvisionResult> {
  const existing = await getAgentOpsProjectPolicy({
    orgId: context.orgId,
    projectId: context.install.projectId ?? null,
  })
  const resourceId = resource.resourceId ?? buildRegisteredCapabilityResourceId({
    installId: context.install.id,
    resourceKey: resource.resourceKey,
  })
  const metadata = {
    ...(existing?.metadata ?? {}),
    capability_template_policies: {
      ...readRecord(existing?.metadata?.capability_template_policies),
      [resource.resourceKey]: {
        pack_id: context.pack.id,
        pack_key: context.pack.packKey,
        resource_key: resource.resourceKey,
        name: desired.name,
        spec: desired.spec,
      },
    },
  }

  await upsertAgentOpsProjectPolicy({
    orgId: context.orgId,
    projectId: context.install.projectId ?? null,
    mode: (existing?.safetyMode ?? 'normal'),
    metadata,
    updatedBy: context.userId ?? null,
  })

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId,
    metadata: buildProvisioningMetadata({
      status: 'registered',
      message: 'Policy registered into Agent Ops project policy metadata.',
      resourceId,
      spec: desired.spec,
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'registered',
    resourceId,
    message: 'Policy registered into Agent Ops project policy metadata.',
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
