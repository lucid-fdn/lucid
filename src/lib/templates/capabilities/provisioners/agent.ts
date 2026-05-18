import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { createAssistant } from '@/lib/db'
import { ErrorService, supabase } from '@/lib/db/client'
import { getDefaultEnvironmentForProject, getPrimaryProjectForWorkspace } from '@/lib/db/projects'
import { resolveAgentModel } from '@/lib/agents/model-resolution'
import { deployResolvedTemplate } from '@/lib/templates/deploy'
import { packBackedTemplateToCatalogEntry } from '@/lib/templates/pack-adapter'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'
import { readTemplateResourceInstallConfig } from './template-install-config'

export async function provisionAgentResource(
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
      message: 'Agent already provisioned.',
    }
  }

  const scope = await resolveProjectScope(context)
  if (!scope) {
    await updateLucidPackManagedResourceProvisioning({
      orgId: context.orgId,
      installId: context.install.id,
      resourceKey: resource.resourceKey,
      resourceId: null,
      metadata: buildProvisioningMetadata({
        status: 'needs_setup',
        message: 'A project and default environment are required before this agent can be created.',
      }),
    })
    return {
      resourceKey: resource.resourceKey,
      resourceKind: resource.resourceKind,
      status: 'needs_setup',
      resourceId: null,
      message: 'A project and default environment are required before this agent can be created.',
    }
  }

  const packTemplate = packBackedTemplateToCatalogEntry(context.pack)
  if (packTemplate?.spec.kind === 'agent' && desired.spec.template_spec) {
    if (!context.userId) {
      await updateLucidPackManagedResourceProvisioning({
        orgId: context.orgId,
        installId: context.install.id,
        resourceKey: resource.resourceKey,
        resourceId: null,
        metadata: buildProvisioningMetadata({
          status: 'needs_setup',
          message: 'A user context is required before this Pack-backed agent template can be deployed.',
        }),
      })
      return {
        resourceKey: resource.resourceKey,
        resourceKind: resource.resourceKind,
        status: 'needs_setup',
        resourceId: null,
        message: 'A user context is required before this Pack-backed agent template can be deployed.',
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
        scope,
        selectedConnectionIdsByProvider: config.selectedConnectionIdsByProvider,
      },
    )
    const assistantId = deploymentResult.assistant_id ?? null
    if (!assistantId) {
      throw new Error('Pack-backed agent template did not return an assistant id')
    }

    await updateLucidPackManagedResourceProvisioning({
      orgId: context.orgId,
      installId: context.install.id,
      resourceKey: resource.resourceKey,
      resourceId: assistantId,
      metadata: buildProvisioningMetadata({
        status: 'provisioned',
        message: 'Agent created from Lucid Pack template.',
        resourceId: assistantId,
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
      resourceId: assistantId,
      message: 'Agent created from Lucid Pack template.',
      details: { deploymentResult },
    }
  }

  const spec = desired.spec
  const assistant = await createAssistant({
    orgId: context.orgId,
    projectId: scope.projectId,
    envId: scope.envId,
    name: typeof spec.role === 'string' ? spec.role : desired.name,
    systemPrompt: typeof spec.system_prompt === 'string'
      ? spec.system_prompt
      : `You are ${desired.name}. Follow the capability template policy and report evidence before recommendations.`,
    lucidModel: resolveAgentModel(typeof spec.model_hint === 'string' ? spec.model_hint : undefined),
    memoryEnabled: spec.memory_enabled !== false,
  })

  const { error: descriptionError } = await supabase
    .from('ai_assistants')
    .update({
      description: typeof spec.description === 'string' ? spec.description : context.pack.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assistant.id)
  if (descriptionError) {
    ErrorService.captureException(descriptionError, {
      severity: 'warning',
      context: {
        orgId: context.orgId,
        assistantId: assistant.id,
        installId: context.install.id,
        resourceKey: resource.resourceKey,
        operation: 'provisionAgentResource.description',
      },
      tags: { layer: 'templates', route: 'capability-provisioner' },
    })
  }

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: assistant.id,
    metadata: buildProvisioningMetadata({
      status: 'provisioned',
      message: 'Agent created from capability template.',
      resourceId: assistant.id,
      spec,
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'provisioned',
    resourceId: assistant.id,
    message: 'Agent created from capability template.',
  }
}

async function resolveProjectScope(context: CapabilityTemplateProvisionContext): Promise<{ projectId: string; envId: string } | null> {
  const project = context.install.projectId
    ? { id: context.install.projectId }
    : await getPrimaryProjectForWorkspace(context.orgId)
  if (!project?.id) return null

  const env = await getDefaultEnvironmentForProject(project.id)
  if (!env?.id) return null

  return { projectId: project.id, envId: env.id }
}
