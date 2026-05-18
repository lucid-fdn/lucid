import 'server-only'

import type { PmWebhookEvent, PmProviderDbValue } from '@contracts/pm-adapter'
import type { OrgPmProviderConfig } from '@contracts/pm-adapter'
import type { WorkItemExternalRef } from '@/lib/db/pm-external-refs'
import {
  appendWorkGraphEvent,
  attachWorkArtifactLink,
  getWorkItemGraphContext,
} from '@/lib/work-graph/db'
import {
  isWorkGraphPmProviderSupported,
  resolveWorkGraphPmFederationConfig,
  unsupportedProviderNotes,
} from './config'
import { decideInboundPmPatch } from './field-authority'
import type { WorkGraphPmInboundDecision, WorkGraphPmProviderStatus } from './types'

function projectIdFromContext(
  explicitProjectId: string | null | undefined,
  context: Awaited<ReturnType<typeof getWorkItemGraphContext>>,
): string | null {
  if (explicitProjectId) return explicitProjectId
  const externalMirror = context?.workItem.external_mirror
  if (externalMirror && typeof externalMirror === 'object') {
    const value = (externalMirror as Record<string, unknown>).project_id
    if (typeof value === 'string') return value
  }
  return null
}

export function projectPmConfigToWorkGraphStatus(
  config: OrgPmProviderConfig & { provider: PmProviderDbValue },
): WorkGraphPmProviderStatus {
  const workGraphConfig = resolveWorkGraphPmFederationConfig(config)
  const supported = isWorkGraphPmProviderSupported(config.provider)
  return {
    provider: config.provider,
    enabled: config.enabled,
    isPrimary: config.isPrimary,
    supported,
    mode: workGraphConfig.mode,
    conflictState: workGraphConfig.conflict_state,
    fieldAuthority: workGraphConfig.field_authority,
    providerProjectRef: workGraphConfig.provider_project_ref ?? null,
    providerBoardRef: workGraphConfig.provider_board_ref ?? null,
    providerTeamRef: workGraphConfig.provider_team_ref ?? null,
    notes: unsupportedProviderNotes(config.provider),
    updatedAt: config.updatedAt,
  }
}

export async function projectExternalPmRefToWorkGraph(input: {
  orgId: string
  projectId?: string | null
  ref: WorkItemExternalRef
  provider: PmProviderDbValue
  eventType?: string
  summary?: string | null
}): Promise<void> {
  const context = await getWorkItemGraphContext(input.orgId, input.ref.work_item_id)
  const projectId = projectIdFromContext(input.projectId, context)

  await Promise.all([
    attachWorkArtifactLink(input.orgId, {
      project_id: projectId,
      work_item_id: input.ref.work_item_id,
      artifact_type: 'external_pm_ref',
      label: `${input.provider} mirror`,
      url: input.ref.external_url,
      ref_table: 'work_item_external_refs',
      ref_id: input.ref.id,
      summary: input.summary ?? `External PM mirror for ${input.provider}.`,
      metadata: {
        provider: input.provider,
        external_id: input.ref.external_id,
        event_type: input.eventType ?? null,
      },
    }, { actorKind: 'external_sync' }),
    appendWorkGraphEvent({
      orgId: input.orgId,
      projectId,
      workItemId: input.ref.work_item_id,
      actorKind: 'external_sync',
      actorExternalProvider: isWorkGraphPmProviderSupported(input.provider) ? input.provider : undefined,
      eventType: input.eventType ?? 'external_pm.ref_projected',
      payload: {
        provider: input.provider,
        external_ref_id: input.ref.id,
        external_id: input.ref.external_id,
        external_url: input.ref.external_url,
      },
    }),
  ])
}

export async function projectInboundPmEventToWorkGraph(input: {
  orgId: string
  projectId?: string | null
  config: OrgPmProviderConfig
  event: PmWebhookEvent
  ref: WorkItemExternalRef
}): Promise<WorkGraphPmInboundDecision> {
  const workGraphConfig = resolveWorkGraphPmFederationConfig(input.config)
  const decision = decideInboundPmPatch({
    config: workGraphConfig,
    patch: input.event.patch ?? null,
    eventType: input.event.type,
  })
  const context = await getWorkItemGraphContext(input.orgId, input.ref.work_item_id)
  const projectId = projectIdFromContext(input.projectId, context)

  await Promise.all([
    projectExternalPmRefToWorkGraph({
      orgId: input.orgId,
      projectId,
      ref: input.ref,
      provider: input.config.provider,
      eventType: `external_pm.${input.event.type}`,
      summary: decision.reason,
    }),
    appendWorkGraphEvent({
      orgId: input.orgId,
      projectId,
      workItemId: input.ref.work_item_id,
      actorKind: 'external_sync',
      actorExternalProvider: isWorkGraphPmProviderSupported(input.config.provider) ? input.config.provider : undefined,
      eventType: 'external_pm.inbound_decision',
      payload: {
        provider: input.config.provider,
        external_id: input.event.externalId,
        pm_event_type: input.event.type,
        mode: decision.mode,
        conflict_state: decision.conflictState,
        apply_patch: decision.applyPatch,
        needs_review: decision.needsReview,
        fields: decision.fields,
      },
    }),
  ])

  return decision
}
