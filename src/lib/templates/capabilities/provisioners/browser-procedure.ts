import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import {
  createAgentOpsBrowserProcedure,
  createAgentOpsBrowserProcedureVersion,
  listAgentOpsBrowserProcedures,
} from '@/lib/db'
import {
  normalizeBrowserProcedureSlug,
  type AgentOpsBrowserProcedureRiskLevel,
  type AgentOpsBrowserProcedureType,
} from '@/lib/agent-ops/browser-procedures'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'

export async function provisionBrowserProcedureResource(
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
      message: 'Browser procedure already provisioned.',
    }
  }

  const spec = desired.spec
  const scope = spec.scope === 'org' || !context.install.projectId ? 'org' : 'project'
  const projectId = scope === 'project' ? context.install.projectId ?? null : null
  const slug = normalizeBrowserProcedureSlug(readString(spec.slug) ?? desired.name)
  const existing = (await listAgentOpsBrowserProcedures({
    orgId: context.orgId,
    projectId,
    limit: 200,
  })).find((procedure) => procedure.slug === slug)

  const procedure = existing ?? await createAgentOpsBrowserProcedure({
    orgId: context.orgId,
    projectId,
    hostPattern: readString(spec.host_pattern) ?? readString(spec.hostPattern) ?? '*',
    name: desired.name,
    slug,
    description: readString(spec.description) ?? desired.name,
    intentTriggers: readStringArray(spec.intent_triggers ?? spec.intentTriggers),
    procedureType: readProcedureType(spec.procedure_type ?? spec.procedureType),
    scope,
    trustState: spec.trust_state === 'active' ? 'active' : 'draft',
    createdByUserId: context.userId ?? null,
    metadata: {
      capability_template: {
        install_id: context.install.id,
        pack_id: context.pack.id,
        pack_key: context.pack.packKey,
        resource_key: resource.resourceKey,
      },
      spec,
    },
  })

  if (!existing) {
    await createAgentOpsBrowserProcedureVersion({
      procedureId: procedure.id,
      definitionKind: readDefinitionKind(spec.definition_kind ?? spec.definitionKind),
      definition: readRecord(spec.definition) ?? {
        steps: readArray(spec.steps),
        objective: readString(spec.objective) ?? desired.name,
      },
      testDefinition: readRecord(spec.test_definition ?? spec.testDefinition) ?? {},
      capabilities: readStringArray(spec.capabilities ?? spec.capability_keys),
      riskLevel: readRiskLevel(spec.risk_level ?? spec.riskLevel),
      approvalPolicy: readRecord(spec.approval_policy ?? spec.approvalPolicy) ?? {},
      createdByUserId: context.userId ?? null,
    })
  }

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: procedure.id,
    metadata: buildProvisioningMetadata({
      status: 'provisioned',
      message: existing
        ? 'Existing Browser Operator procedure reused.'
        : 'Browser Operator procedure created.',
      resourceId: procedure.id,
      provider: 'browser-operator',
      spec,
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'provisioned',
    resourceId: procedure.id,
    message: existing
      ? 'Existing Browser Operator procedure reused.'
      : 'Browser Operator procedure created.',
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readProcedureType(value: unknown): AgentOpsBrowserProcedureType {
  return value === 'mutating'
    || value === 'monitoring'
    || value === 'qa'
    || value === 'design'
    || value === 'devex'
    ? value
    : 'read_only'
}

function readDefinitionKind(value: unknown) {
  return value === 'playwright_plan' || value === 'natural_language_playbook'
    ? value
    : 'browser_operator_plan'
}

function readRiskLevel(value: unknown): AgentOpsBrowserProcedureRiskLevel {
  return value === 'high' || value === 'medium' ? value : 'low'
}
