import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { UpdateLucidPackInstallRequestSchema } from '@contracts/lucid-pack'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  forkLucidPackManagedResource,
  getLucidPackInstall,
  isUserOrgMember,
  listLucidPackManagedResources,
  reconcileLucidPackInstall,
  updateLucidPackInstallStatus,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { provisionTemplatePackInstall } from '@/lib/templates/capabilities/provisioners'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

export const PATCH = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ installId: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = UpdateLucidPackInstallRequestSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const { installId } = await ctx.params
    const existing = await getLucidPackInstall({ orgId: body.org_id, installId })
    if (!existing) return NextResponse.json({ error: 'Pack install not found' }, { status: 404 })

    if (body.action === 'reconcile') {
      const result = await reconcileLucidPackInstall({ orgId: body.org_id, installId })
      const provisioning = await provisionTemplatePackInstall({
        orgId: body.org_id,
        installId,
        userId,
      })
      const resources = await listLucidPackManagedResources({
        orgId: body.org_id,
        installId,
        limit: 500,
      })
      return NextResponse.json({ ...result, resources, provisioning })
    }

    if (body.action === 'fork_resource') {
      if (!body.resource_key) {
        return NextResponse.json({ error: 'resource_key is required for fork_resource' }, { status: 400 })
      }
      const resource = await forkLucidPackManagedResource({
        orgId: body.org_id,
        installId,
        resourceKey: body.resource_key,
        reason: body.reason ?? null,
      })
      const resources = await listLucidPackManagedResources({
        orgId: body.org_id,
        installId,
        limit: 500,
      })
      return NextResponse.json({ install: existing, resource, resources })
    }

    const install = await updateLucidPackInstallStatus({
      orgId: body.org_id,
      installId,
      status: body.action === 'archive' || body.action === 'uninstall'
        ? 'archived'
        : body.action === 'pause'
          ? 'paused'
          : 'active',
    })
    const resources = await listLucidPackManagedResources({
      orgId: body.org_id,
      installId,
      limit: 500,
    })
    return NextResponse.json({ install, resources })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/packs/install/[installId]', method: 'PATCH' },
      tags: { layer: 'api', route: 'lucid-packs' },
    })
    return NextResponse.json({ error: 'Failed to update pack install' }, { status: 500 })
  }
})
