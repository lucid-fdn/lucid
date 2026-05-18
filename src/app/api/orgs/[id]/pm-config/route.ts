/**
 * GET  /api/orgs/[id]/pm-config      — list all PM provider configs (public — no secrets)
 * POST /api/orgs/[id]/pm-config      — upsert a provider config (admin/owner)
 *
 * Org-level CRUD surface for external PM adapter configuration (Linear,
 * Asana, Trello, Monday). Paired with `[provider]/route.ts` for single-
 * provider GET/PATCH/DELETE.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  isUserOrgMember,
  getOrgMemberRole,
  listOrgPmConfigs,
  setOrgPmConfig,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  checkRateLimit,
  getRequestIdentifier,
  RateLimitPresets,
} from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { PM_PROVIDERS } from '@contracts/pm-adapter'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const upsertSchema = z.object({
  provider: z.enum(PM_PROVIDERS as readonly [string, ...string[]]),
  enabled: z.boolean(),
  isPrimary: z.boolean(),
  nangoConnectionId: z.string().min(1).max(200),
  config: z.record(z.string(), z.unknown()),
  webhookSecret: z.string().min(8).max(256).nullable().optional(),
})

/**
 * GET — list all configured providers for the org. Any member. No secrets.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(
      getRequestIdentifier(req),
      RateLimitPresets.RELAXED,
    )
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params
    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const configs = await listOrgPmConfigs(orgId)
    return NextResponse.json({ configs })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/pm-config', method: 'GET' },
      tags: { layer: 'api', route: 'pm-config' },
    })
    return NextResponse.json(
      { error: 'Failed to list PM configs' },
      { status: 500 },
    )
  }
}

/**
 * POST — upsert a provider config. Admin/owner only.
 */
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(
      getRequestIdentifier(req),
      RateLimitPresets.STANDARD,
    )
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await (ctx as { params: Promise<{ id: string }> })
      .params

    const role = await getOrgMemberRole(userId, orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json(
        { error: 'Admin or owner role required' },
        { status: 403 },
      )
    }

    const body = await req.json()
    const validated = upsertSchema.parse(body)

    const config = await setOrgPmConfig({
      orgId,
      provider: validated.provider as (typeof PM_PROVIDERS)[number],
      enabled: validated.enabled,
      isPrimary: validated.isPrimary,
      nangoConnectionId: validated.nangoConnectionId,
      config: validated.config,
      webhookSecret: validated.webhookSecret ?? null,
      createdBy: userId,
    })

    if (!config) {
      return NextResponse.json(
        { error: 'Failed to save PM config' },
        { status: 500 },
      )
    }

    return NextResponse.json({ config }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/pm-config', method: 'POST' },
      tags: { layer: 'api', route: 'pm-config' },
    })
    return NextResponse.json(
      { error: 'Failed to save PM config' },
      { status: 500 },
    )
  }
})
