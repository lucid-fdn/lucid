/**
 * POST /api/templates/[id]/deploy
 * Deploy a Lucid Pack-backed template.
 * Body: { params?: Record<string, string>, name_override?: string }
 * Requires auth + org membership. Returns DeployTemplateResult.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getLucidPack, getLucidPackByPackKey, isUserOrgMember } from '@/lib/db'
import { installTemplatePack, templatePackInstallToDeployResult } from '@/lib/templates/install'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const MAX_DEPLOY_BODY_LENGTH = 20_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const templateRouteParamsSchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/i),
})

const deploySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  params: z
    .record(
      z.string().regex(/^[A-Z0-9_]{1,64}$/),
      z.string().min(1).max(1000).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), {
        message: 'Param values contain invalid control characters',
      }),
    )
    .optional()
    .default({})
    .superRefine((value, ctx) => {
      if (Object.keys(value).length > 25) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A maximum of 25 template params is allowed',
        })
      }
    }),
  name_override: z.string().min(1).max(100).optional(),
})

export const POST = withCSRF(async (req: NextRequest, ctx: unknown): Promise<NextResponse> => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { params: routeParams } = ctx as { params: Promise<{ id: string }> }
    const { id } = templateRouteParamsSchema.parse(await routeParams)

    const rawBody = await req.text()
    if (rawBody.length > MAX_DEPLOY_BODY_LENGTH) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
    }

    const body = rawBody ? JSON.parse(rawBody) : {}
    const validated = deploySchema.parse(body)

    const isMember = await isUserOrgMember(userId, validated.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pack = UUID_RE.test(id)
      ? await getLucidPack({ packId: id, orgId: validated.org_id })
      : await getLucidPackByPackKey({ packKey: id, orgId: validated.org_id })
    const templateType = pack?.manifest.metadata?.template_type
    if (pack && (templateType === 'agent' || templateType === 'team')) {
      const installResult = await installTemplatePack({
        orgId: validated.org_id,
        projectId: validated.project_id ?? null,
        packId: pack.id,
        userId,
        config: {
          template_params: validated.params,
          ...(validated.name_override ? { name_override: validated.name_override } : {}),
        },
      })
      const deployResult = templatePackInstallToDeployResult({
        pack,
        install: installResult.install,
        resources: installResult.resources,
        provisioning: installResult.provisioning,
      })
      if (!deployResult) {
        return NextResponse.json({
          error: 'Template pack installed, but no deployable agent or team was provisioned',
          install: installResult.install,
          resources: installResult.resources,
          provisioning: installResult.provisioning,
        }, { status: 409 })
      }

      return NextResponse.json({
        ...deployResult,
        install_id: installResult.install.id,
        pack_id: pack.id,
        resources: installResult.resources,
        provisioning: installResult.provisioning,
      }, { status: 201 })
    }

    return NextResponse.json({ error: `Template not found: ${id}` }, { status: 404 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Failed to deploy template'
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('Missing required template params') || message.includes('Unknown template param')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    if (message.includes('exceeds 1000 characters')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    if (
      message.includes('Template plugin setup failed')
      || message.includes('Template skill setup failed')
      || message.includes('Failed to create crew for team template')
      || message.includes('Failed to record template deployment')
    ) {
      return NextResponse.json({ error: message }, { status: 500 })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/templates/[id]/deploy', method: 'POST' },
      tags: { layer: 'api', route: 'templates' },
    })
    return NextResponse.json({ error: 'Failed to deploy template' }, { status: 500 })
  }
})
