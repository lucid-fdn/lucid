import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { getOrgPmConfig, listOrgPmConfigs, setOrgPmConfig } from '@/lib/db'
import {
  projectPmConfigToWorkGraphStatus,
  serializeWorkGraphPmFederationConfigPatch,
} from '@/lib/work-graph/pm-federation'
import {
  WorkGraphFieldAuthoritySchema,
  WorkGraphProviderModeSchema,
} from '@contracts/work-graph'
import { PM_PROVIDERS, type PmProvider } from '@contracts/pm-adapter'
import { requireWorkGraphReadAccess, requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  provider: z.enum(PM_PROVIDERS as readonly [string, ...string[]]),
  mode: WorkGraphProviderModeSchema,
  field_authority: z.object({
    title: WorkGraphFieldAuthoritySchema.optional(),
    description: WorkGraphFieldAuthoritySchema.optional(),
    status: WorkGraphFieldAuthoritySchema.optional(),
    priority: WorkGraphFieldAuthoritySchema.optional(),
    assignee: WorkGraphFieldAuthoritySchema.optional(),
    labels: WorkGraphFieldAuthoritySchema.optional(),
    due_at: WorkGraphFieldAuthoritySchema.optional(),
    board_column: WorkGraphFieldAuthoritySchema.optional(),
  }).optional().default({}),
  provider_project_ref: z.string().max(300).nullable().optional(),
  provider_board_ref: z.string().max(300).nullable().optional(),
  provider_team_ref: z.string().max(300).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const configs = await listOrgPmConfigs(orgId)
  return NextResponse.json({
    providers: configs.map(projectPmConfigToWorkGraphStatus),
  })
}

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) => {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  try {
    const body = updateSchema.parse(await request.json())
    const existing = await getOrgPmConfig(orgId, body.provider as PmProvider)
    if (!existing) {
      return NextResponse.json({ error: 'PM provider is not configured for this organization' }, { status: 404 })
    }

    const config = await setOrgPmConfig({
      orgId,
      provider: existing.provider,
      enabled: existing.enabled,
      isPrimary: existing.isPrimary,
      nangoConnectionId: existing.nangoConnectionId,
      config: {
        ...existing.config,
        ...serializeWorkGraphPmFederationConfigPatch({
          mode: body.mode,
          fieldAuthority: body.field_authority,
          providerProjectRef: body.provider_project_ref,
          providerBoardRef: body.provider_board_ref,
          providerTeamRef: body.provider_team_ref,
          metadata: {
            ...body.metadata,
            project_id: projectId,
            updated_from: 'work_graph_pm_federation_api',
          },
        }),
      },
      createdBy: access.userId,
    })

    if (!config) return NextResponse.json({ error: 'Failed to update Work Graph PM federation config' }, { status: 500 })
    return NextResponse.json({ provider: projectPmConfigToWorkGraphStatus(config) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update Work Graph PM federation config' }, { status: 500 })
  }
})
