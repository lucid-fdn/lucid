import 'server-only'

import {
  getLucidPack,
  getLucidPackInstall,
  listLucidPackManagedResources,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getManifestResource, shouldSkipProvisioning } from './resource-registry'
import { provisionAgentResource } from './agent'
import { provisionBrowserProcedureResource } from './browser-procedure'
import { provisionKnowledgeSourceResource } from './knowledge-source'
import { provisionPolicyResource } from './policy'
import { provisionRoutineResource } from './routine'
import { provisionTeamResource } from './team'
import { canRegisterResourceKind, registerResource } from './register'
import type {
  CapabilityTemplateProvisionContext,
  CapabilityTemplateProvisionReport,
  CapabilityTemplateProvisionResult,
  CapabilityTemplateProvisionSummary,
} from './types'

export async function provisionTemplatePackInstall(input: {
  orgId: string
  installId: string
  userId?: string | null
}): Promise<CapabilityTemplateProvisionReport | null> {
  const install = await getLucidPackInstall({ orgId: input.orgId, installId: input.installId })
  if (!install) return null

  const pack = await getLucidPack({ orgId: input.orgId, packId: install.packId })
  if (!pack) return null

  const resources = await listLucidPackManagedResources({
    orgId: input.orgId,
    installId: input.installId,
    limit: 500,
  })

  const context: CapabilityTemplateProvisionContext = {
    orgId: input.orgId,
    install,
    pack,
    manifest: pack.manifest,
    resources,
    userId: input.userId ?? null,
  }

  const results: CapabilityTemplateProvisionResult[] = []
  for (const resource of resources) {
    const skipReason = shouldSkipProvisioning(resource)
    if (skipReason) {
      results.push({
        resourceKey: resource.resourceKey,
        resourceKind: resource.resourceKind,
        status: 'skipped',
        resourceId: resource.resourceId ?? null,
        message: skipReason,
      })
      continue
    }

    const desired = getManifestResource(pack.manifest, resource.resourceKey)
    if (!desired) {
      results.push({
        resourceKey: resource.resourceKey,
        resourceKind: resource.resourceKind,
        status: 'skipped',
        resourceId: resource.resourceId ?? null,
        message: 'Resource is no longer declared by the capability template manifest.',
      })
      continue
    }

    try {
      let result: CapabilityTemplateProvisionResult
      if (resource.resourceKind === 'agent') {
        result = await provisionAgentResource(context, resource, desired)
      } else if (resource.resourceKind === 'team') {
        result = await provisionTeamResource(context, resource, desired)
      } else if (resource.resourceKind === 'browser_procedure') {
        result = await provisionBrowserProcedureResource(context, resource, desired)
      } else if (resource.resourceKind === 'knowledge_source') {
        result = await provisionKnowledgeSourceResource(context, resource, desired)
      } else if (resource.resourceKind === 'policy') {
        result = await provisionPolicyResource(context, resource, desired)
      } else if (resource.resourceKind === 'routine') {
        result = await provisionRoutineResource(context, resource, desired)
      } else if (canRegisterResourceKind(resource.resourceKind)) {
        result = await registerResource(context, resource, desired)
      } else {
        result = {
          resourceKey: resource.resourceKey,
          resourceKind: resource.resourceKind,
          status: 'needs_setup',
          resourceId: resource.resourceId ?? null,
          message: `No provisioner is registered for ${resource.resourceKind}.`,
        }
      }
      if (result.resourceId) resource.resourceId = result.resourceId
      results.push(result)
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'warning',
        context: {
          orgId: input.orgId,
          installId: input.installId,
          resourceKey: resource.resourceKey,
          resourceKind: resource.resourceKind,
          operation: 'provisionCapabilityTemplateInstall.resource',
        },
        tags: { layer: 'templates', route: 'capability-provisioner' },
      })
      results.push({
        resourceKey: resource.resourceKey,
        resourceKind: resource.resourceKind,
        status: 'failed',
        resourceId: resource.resourceId ?? null,
        message: error instanceof Error ? error.message : 'Provisioning failed.',
      })
    }
  }

  return {
    install,
    pack,
    results,
    summary: summarize(results),
  }
}

export async function provisionCapabilityTemplateInstall(input: {
  orgId: string
  installId: string
  userId?: string | null
}): Promise<CapabilityTemplateProvisionReport | null> {
  return provisionTemplatePackInstall(input)
}

function summarize(results: CapabilityTemplateProvisionResult[]): CapabilityTemplateProvisionSummary {
  return {
    provisioned: results.filter((result) => result.status === 'provisioned').length,
    registered: results.filter((result) => result.status === 'registered').length,
    needsSetup: results.filter((result) => result.status === 'needs_setup').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
  }
}
