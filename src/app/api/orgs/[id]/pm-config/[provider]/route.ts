/**
 * GET    /api/orgs/[id]/pm-config/[provider]  — single config (public — no secret)
 * DELETE /api/orgs/[id]/pm-config/[provider]  — soft-disable (admin/owner)
 *
 * Per-provider CRUD surface. Paired with the collection route for list + upsert.
 * Note: DELETE is a soft disable (clears enabled + is_primary), keeps the row
 * + webhook secret so quick re-enable preserves history.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  isUserOrgMember,
  getOrgMemberRole,
  getOrgPmConfig,
  disableOrgPmConfig,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  checkRateLimit,
  getRequestIdentifier,
  RateLimitPresets,
} from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { PM_PROVIDERS, type PmProvider } from '@contracts/pm-adapter'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

function isValidProvider(p: string): p is PmProvider {
  return (PM_PROVIDERS as readonly string[]).includes(p)
}

/**
 * GET — fetch one provider's config. Any member. Secret never returned.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; provider: string }> },
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

    const { id: orgId, provider } = await params
    if (!isValidProvider(provider)) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await getOrgPmConfig(orgId, provider)
    if (!config) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ config })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/orgs/[id]/pm-config/[provider]',
        method: 'GET',
      },
      tags: { layer: 'api', route: 'pm-config-provider' },
    })
    return NextResponse.json(
      { error: 'Failed to load PM config' },
      { status: 500 },
    )
  }
}

/**
 * DELETE — soft-disable the provider (enabled=false, is_primary=false).
 * Admin/owner only. Keeps the row + secret for quick re-enable.
 */
export const DELETE = withCSRF(async (req: NextRequest, ctx: unknown) => {
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

    const { id: orgId, provider } = await (
      ctx as { params: Promise<{ id: string; provider: string }> }
    ).params
    if (!isValidProvider(provider)) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
    }

    const role = await getOrgMemberRole(userId, orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json(
        { error: 'Admin or owner role required' },
        { status: 403 },
      )
    }

    const success = await disableOrgPmConfig(orgId, provider)
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to disable PM config' },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/orgs/[id]/pm-config/[provider]',
        method: 'DELETE',
      },
      tags: { layer: 'api', route: 'pm-config-provider' },
    })
    return NextResponse.json(
      { error: 'Failed to disable PM config' },
      { status: 500 },
    )
  }
})
