import 'server-only'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { createRoutine } from '@/lib/routines/service'
import type { CapabilityTemplateProvisionContext, CapabilityTemplateProvisionResult } from './types'
import { buildProvisioningMetadata } from './resource-registry'
import { updateLucidPackManagedResourceProvisioning } from './provisioning-store'

export async function provisionRoutineResource(
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
      message: 'Routine already provisioned.',
    }
  }

  const spec = desired.spec
  if (spec.disabled_by_default !== false) {
    return markNeedsSetup(context, resource, desired, 'Routine registered but left disabled until an operator enables recurrence.')
  }

  const assistantId = readString(spec.assistant_id) ?? findProvisionedAgentId(context)
  if (!assistantId) {
    return markNeedsSetup(context, resource, desired, 'Routine needs a provisioned agent before it can be scheduled.')
  }

  const cronExpression = readString(spec.cron_expression)
    ?? convertSimpleRruleToCron(readString(spec.cadence))
  if (!cronExpression) {
    return markNeedsSetup(context, resource, desired, 'Routine cadence is not cron-compatible yet.')
  }

  const routine = await createRoutine({
    assistant_id: assistantId,
    org_id: context.orgId,
    name: desired.name,
    description: readString(spec.description) ?? desired.name,
    task_prompt: readString(spec.prompt)
      ?? `Run capability-template routine ${desired.name} for workflow ${readString(spec.workflow_id) ?? desired.key}.`,
    cron_expression: cronExpression,
    timezone: readString(spec.timezone) === 'workspace' ? 'UTC' : readString(spec.timezone) ?? 'UTC',
    idempotency_key: `capability-template:${context.install.id}:${resource.resourceKey}`,
    source_kind: 'pack',
    target_type: 'assistant',
    task_kind: 'assistant_run',
    runtime_selector: { nativeScheduler: 'disabled' },
  }, context.userId ?? null)

  if (!routine?.id) {
    return markNeedsSetup(context, resource, desired, 'Routine could not be created.')
  }

  await updateLucidPackManagedResourceProvisioning({
    orgId: context.orgId,
    installId: context.install.id,
    resourceKey: resource.resourceKey,
    resourceId: routine.id,
    metadata: buildProvisioningMetadata({
      status: 'provisioned',
      message: 'Routine created in the Routine Kernel.',
      resourceId: routine.id,
      provider: 'routine-kernel',
      spec: {
        ...spec,
        cron_expression: cronExpression,
        assistant_id: assistantId,
      },
    }),
  })

  return {
    resourceKey: resource.resourceKey,
    resourceKind: resource.resourceKind,
    status: 'provisioned',
    resourceId: routine.id,
    message: 'Routine created in the Routine Kernel.',
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
      provider: 'routine-kernel',
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

function findProvisionedAgentId(context: CapabilityTemplateProvisionContext): string | null {
  return context.resources.find((candidate) => (
    candidate.resourceKind === 'agent'
    && candidate.status === 'active'
    && typeof candidate.resourceId === 'string'
    && candidate.resourceId.length > 0
  ))?.resourceId ?? null
}

function convertSimpleRruleToCron(cadence: string | null): string | null {
  if (!cadence) return null
  const normalized = cadence.trim().toUpperCase()
  if (/^FREQ=HOURLY(?:;INTERVAL=1)?$/.test(normalized)) return '0 * * * *'
  if (/^FREQ=DAILY(?:;INTERVAL=1)?$/.test(normalized)) return '0 9 * * *'
  if (/^FREQ=WEEKLY(?:;INTERVAL=1)?$/.test(normalized)) return '0 9 * * 1'
  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
