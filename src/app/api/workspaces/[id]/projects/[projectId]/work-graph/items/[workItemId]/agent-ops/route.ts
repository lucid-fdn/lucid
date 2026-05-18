import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { startAgentOpsRun } from '@/lib/agent-ops'
import {
  AGENT_OPS_RUN_MODES,
  AGENT_OPS_WORKFLOW_IDS,
} from '@/lib/agent-ops/workflow-types'
import {
  appendAgentOpsRunLink,
  recordAgentOpsProjectTimelineEvent,
  supabaseAgentOpsRunModeRecorder,
  supabaseAgentOpsRunStore,
} from '@/lib/db/agent-ops'
import { supabaseAgentOpsDagOrchestrationAdapter } from '@/lib/db/agent-ops-orchestration'
import { supabaseAgentOpsRuntimeSelector } from '@/lib/db/agent-ops-runtime-selector'
import { supabaseAgentOpsSpecialistTelemetryProvider } from '@/lib/db/agent-ops-product'
import { supabaseAgentOpsTeamPolicyGate } from '@/lib/db/agent-ops-team-policy-gate'
import {
  attachAgentOpsRunToCheckout,
  attachWorkArtifactLink,
  createWorkItemCheckout,
  getWorkItemGraphContext,
  releaseWorkItemCheckout,
} from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../../../_auth'

export const dynamic = 'force-dynamic'

const capabilitySchema = z.union([
  z.string().min(1).max(160).transform((capability_id) => ({ capability_id, required: true })),
  z.object({
    capability_id: z.string().min(1).max(160),
    required: z.boolean().default(true),
    reason: z.string().max(500).optional(),
  }),
])

const launchAgentOpsBodySchema = z.object({
  workflow_id: z.enum(AGENT_OPS_WORKFLOW_IDS).default('investigate'),
  assistant_id: z.string().uuid().nullable().optional(),
  run_mode: z.enum(AGENT_OPS_RUN_MODES).optional().default('execute'),
  purpose: z.string().min(1).max(500).optional(),
  lease_seconds: z.number().int().positive().max(60 * 60 * 24 * 14).optional(),
  input: z.record(z.string(), z.unknown()).optional().default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  required_capabilities: z.array(capabilitySchema).optional().default([]),
})

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string; workItemId: string }> },
) => {
  const { id: orgId, projectId, workItemId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  try {
    const body = launchAgentOpsBodySchema.parse(await request.json())
    const context = await getWorkItemGraphContext(orgId, workItemId)
    if (!context) return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
    if (context.activeCheckout) {
      return NextResponse.json({
        error: 'Work item already has an active checkout',
        checkout: context.activeCheckout,
      }, { status: 409 })
    }

    const requiredCapabilities = mergeCapabilities([
      ...capabilitiesFromFacets(context.engineFacets),
      ...body.required_capabilities,
    ])
    const leaseExpiresAt = body.lease_seconds
      ? new Date(Date.now() + body.lease_seconds * 1000).toISOString()
      : null

    const checkoutResult = await createWorkItemCheckout(orgId, {
      project_id: projectId,
      work_item_id: workItemId,
      owner_kind: 'system',
      purpose: body.purpose ?? `Agent Ops ${body.workflow_id} execution`,
      lease_expires_at: leaseExpiresAt,
      required_capabilities: requiredCapabilities,
      metadata: {
        source: 'agent_ops_launch',
        workflow_id: body.workflow_id,
      },
    }, { actorKind: 'user', actorUserId: access.userId })

    if (!checkoutResult.checkout) {
      const status = checkoutResult.error === 'not_found' ? 404 : 409
      return NextResponse.json({ error: checkoutResult.error ?? 'Failed to create checkout' }, { status })
    }

    const checkout = checkoutResult.checkout
    try {
      const run = await startAgentOpsRun({
        orgId,
        projectId,
        assistantId: body.assistant_id ?? context.workItem.agent_id ?? null,
        requestedByUserId: access.userId,
        workflowId: body.workflow_id,
        runMode: body.run_mode,
        scope: {
          type: 'project',
          ref: workItemId,
          label: context.workItem.title,
          metadata: {
            source: 'work_graph',
            work_item_id: workItemId,
            checkout_id: checkout.id,
          },
        },
        input: {
          work_item: {
            id: context.workItem.id,
            title: context.workItem.title,
            description: context.workItem.description,
            priority: context.workItem.priority,
            status: context.workItem.status,
            labels: context.workItem.labels,
          },
          goals: context.goals.map((goal) => ({
            id: goal.id,
            title: goal.title,
            status: goal.status,
            priority: goal.priority,
          })),
          relations: {
            incoming: context.incomingRelations,
            outgoing: context.outgoingRelations,
          },
          ...body.input,
        },
        metadata: {
          ...body.metadata,
          launched_from: 'work_graph',
          work_graph: {
            goal_id: context.goals[0]?.id,
            work_item_id: workItemId,
            checkout_id: checkout.id,
            required_capabilities: requiredCapabilities
              .filter((capability) => capability.required !== false)
              .map((capability) => capability.capability_id),
            source: 'project_work',
          },
        },
      }, {
        runStore: supabaseAgentOpsRunStore,
        teamPolicyGate: supabaseAgentOpsTeamPolicyGate,
        specialistTelemetry: supabaseAgentOpsSpecialistTelemetryProvider,
        runtimeSelector: supabaseAgentOpsRuntimeSelector,
        runModeRecorder: supabaseAgentOpsRunModeRecorder,
        ...(body.assistant_id || context.workItem.agent_id ? { orchestration: supabaseAgentOpsDagOrchestrationAdapter } : {}),
      })

      if (run.status === 'blocked') {
        await releaseWorkItemCheckout(orgId, checkout.id, 'cancelled', {
          actorKind: 'system',
          actorUserId: access.userId,
        }).catch(() => null)
      }

      await Promise.all([
        run.status === 'blocked'
          ? Promise.resolve(null)
          : attachAgentOpsRunToCheckout(orgId, checkout.id, run.id, { actorKind: 'system' }),
        attachWorkArtifactLink(orgId, {
          project_id: projectId,
          work_item_id: workItemId,
          artifact_type: 'agent_ops_run',
          label: `${body.workflow_id} Agent Ops run`,
          ref_table: 'agent_ops_runs',
          ref_id: run.id,
          summary: run.errorMessage ?? `Agent Ops ${body.workflow_id} launched from Work Graph.`,
          metadata: {
            checkout_id: checkout.id,
            status: run.status,
          },
        }, { actorKind: 'system' }),
        appendAgentOpsRunLink({
          orgId,
          runId: run.id,
          linkType: 'human_work_item',
          refId: workItemId,
          label: context.workItem.title,
          metadata: {
            source: 'work_graph',
            checkout_id: checkout.id,
          },
        }).catch(() => null),
        recordAgentOpsProjectTimelineEvent({
          orgId,
          projectId,
          runId: run.id,
          eventType: 'agent_ops_run_started',
          title: `${body.workflow_id} started from Work Graph`,
          body: context.workItem.title,
          evidence: {
            work_item_id: workItemId,
            checkout_id: checkout.id,
            required_capabilities: requiredCapabilities,
          },
          metadata: { source: 'work_graph' },
          createdBy: access.userId,
        }).catch(() => null),
      ])

      return NextResponse.json({ run, checkout }, { status: 202 })
    } catch (error) {
      await releaseWorkItemCheckout(orgId, checkout.id, 'cancelled', {
        actorKind: 'system',
        actorUserId: access.userId,
      }).catch(() => null)
      throw error
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to launch Agent Ops from Work Graph' }, { status: 500 })
  }
})

function mergeCapabilities(
  values: Array<{ capability_id: string; required?: boolean; reason?: string }>,
) {
  const byId = new Map<string, { capability_id: string; required: boolean; reason?: string }>()
  for (const value of values) {
    const existing = byId.get(value.capability_id)
    byId.set(value.capability_id, {
      capability_id: value.capability_id,
      required: existing?.required ?? value.required ?? true,
      reason: existing?.reason ?? value.reason,
    })
  }
  return [...byId.values()].sort((a, b) => a.capability_id.localeCompare(b.capability_id))
}

function capabilitiesFromFacets(facets: Array<{ facet_key: string; facet_state: Record<string, unknown> }>) {
  const capabilities: Array<{ capability_id: string; required?: boolean; reason?: string }> = []
  for (const facet of facets) {
    if (facet.facet_key !== 'required_capabilities') continue
    const raw = facet.facet_state.capabilities
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      if (typeof item === 'string') {
        capabilities.push({ capability_id: item, required: true })
      } else if (item && typeof item === 'object' && typeof (item as { capability_id?: unknown }).capability_id === 'string') {
        const value = item as { capability_id: string; required?: boolean; reason?: string }
        capabilities.push({
          capability_id: value.capability_id,
          required: value.required ?? true,
          reason: value.reason,
        })
      }
    }
  }
  return capabilities
}
