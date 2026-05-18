import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { deployResolvedTemplate } from '@/lib/templates/deploy'
import { packBackedTemplateToCatalogEntry } from '@/lib/templates/pack-adapter'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'
import { readTemplateResourceInstallConfig } from './template-install-config'

export async function provisionTeamResource(
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
      message: 'Team already provisioned.',
    }
  }

  if (!context.userId) {
    await markNeedsSetup(context, resource, 'A user context is required before this Pack-backed team template can be deployed.')
    return {
      resourceKey: resource.resourceKey,
      resourceKind: resource.resourceKind,
      status: 'needs_setup',
      resourceId: null,
      message: 'A user context is required before this Pack-backed team template can be deployed.',
    }
  }

  const packTemplate = packBackedTemplateToCatalogEntry(context.pack)
  if (packTemplate?.spec.kind !== 'team' || !desired.spec.template_spec) {
    await markNeedsSetup(context, resource, 'Team resources currently require a Pack-backed team template_spec.')
    return {
      resourceKey: resource.resourceKey,
      resourceKind: resource.resourceKind,
      status: 'needs_setup',
      resourceId: null,
      message: 'Team resources currently require a Pack-backed team template_spec.',
    }
  }

  const config = readTemplateResourceInstallConfig(context.install)
  const deploymentResult = await deployResolvedTemplate(
    packTemplate,
    context.orgId,
    context.userId,
    config.params,
    {
      nameOverride: config.nameOverride,
      scope: context.install.projectId ? { projectId: context.install.projectId } : undefined,
      selectedConnectionIdsByProvider: config.selectedConnectionIdsByProvider,
    },
  )
  const crewId = deploymentResult.crew_id ?? null
  if (!crewId) {
    throw new Error('Pack-backed team template did not return a crew id')
  }

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: crewId,
    metadata: buildProvisioningMetadata({
      status: 'provisioned',
      message: 'Team created from Lucid Pack template.',
      resourceId: crewId,
      spec: {
        ...desired.spec,
        deployment_result: deploymentResult,
      },
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'provisioned',
    resourceId: crewId,
    message: 'Team created from Lucid Pack template.',
    details: { deploymentResult },
  }
}

async function markNeedsSetup(
  context: CapabilityTemplateProvisionContext,
  resource: LucidPackManagedResource,
  message: string,
): Promise<void> {
  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: null,
    metadata: buildProvisioningMetadata({
      status: 'needs_setup',
      message,
    }),
  })
}
