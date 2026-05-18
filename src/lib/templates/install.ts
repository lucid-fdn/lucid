import 'server-only'

import type { LucidPack, LucidPackInstall, LucidPackManagedResource } from '@contracts/lucid-pack'
import { DeployTemplateResultSchema, type DeployTemplateResult } from '@contracts/template'
import {
  installLucidPack,
  listLucidPackManagedResources,
} from '@/lib/db'
import {
  provisionTemplatePackInstall,
  type CapabilityTemplateProvisionReport,
} from '@/lib/templates/capabilities/provisioners'

export interface InstallTemplatePackInput {
  orgId: string
  projectId?: string | null
  packId: string
  userId: string
  config?: Record<string, unknown>
}

export interface InstallTemplatePackResult {
  install: LucidPackInstall
  resources: LucidPackManagedResource[]
  provisioning: CapabilityTemplateProvisionReport | null
}

export async function installTemplatePack(input: InstallTemplatePackInput): Promise<InstallTemplatePackResult> {
  const install = await installLucidPack({
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    packId: input.packId,
    config: input.config ?? {},
    installedByUserId: input.userId,
  })
  const provisioning = await provisionTemplatePackInstall({
    orgId: input.orgId,
    installId: install.id,
    userId: input.userId,
  })
  const resources = await listLucidPackManagedResources({
    orgId: input.orgId,
    installId: install.id,
    limit: 500,
  })

  return { install, resources, provisioning }
}

export function templatePackInstallToDeployResult(input: {
  pack: LucidPack
  install: LucidPackInstall
  resources?: LucidPackManagedResource[]
  provisioning: CapabilityTemplateProvisionReport | null
}): DeployTemplateResult | null {
  const templateType = input.pack.manifest.metadata?.template_type
  if (templateType !== 'agent' && templateType !== 'team') return null

  const matchingResult = input.provisioning?.results.find((result) => {
    if (templateType === 'agent') return result.resourceKind === 'agent' && result.status === 'provisioned'
    return result.resourceKind === 'team' && result.status === 'provisioned'
  })
  const deploymentResult = matchingResult?.details?.deploymentResult
  if (deploymentResult) return deploymentResult

  const matchingResource = input.resources?.find((resource) => {
    if (templateType === 'agent') return resource.resourceKind === 'agent' && resource.resourceId
    return resource.resourceKind === 'team' && resource.resourceId
  })
  const storedDeploymentResult = readStoredDeploymentResult(matchingResource)
  if (storedDeploymentResult) return storedDeploymentResult

  if (!matchingResult?.resourceId) return null
  return {
    deployment_id: input.install.id,
    kind: templateType,
    ...(templateType === 'agent'
      ? { assistant_id: matchingResult.resourceId }
      : { crew_id: matchingResult.resourceId }),
  }
}

function readStoredDeploymentResult(resource?: LucidPackManagedResource): DeployTemplateResult | null {
  const provisionedSpec = resource?.metadata?.provisioned_spec
  if (!provisionedSpec || typeof provisionedSpec !== 'object' || Array.isArray(provisionedSpec)) return null
  const deploymentResult = (provisionedSpec as Record<string, unknown>).deployment_result
  const parsed = DeployTemplateResultSchema.safeParse(deploymentResult)
  return parsed.success ? parsed.data : null
}
