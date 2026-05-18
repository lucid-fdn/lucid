/**
 * GET    /api/orgs/[id]/linear-agent  — Linear agent connection status
 * POST   /api/orgs/[id]/linear-agent  — Store agent connection config
 * DELETE /api/orgs/[id]/linear-agent  — Remove agent connection config
 *
 * Manages the Linear Agents API integration connection state.
 * Stores `agentConnectionId` and `agentAppUserId` in `org_pm_config.config` JSONB
 * for the `linear` provider. Any member can read; admin/owner required for writes.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  isUserOrgMember,
  getOrgMemberRole,
  getOrgPmConfig,
} from '@/lib/db'
import { supabase, ErrorService } from '@/lib/db/client'
import {
  checkRateLimit,
  getRequestIdentifier,
  RateLimitPresets,
} from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const postSchema = z.object({
  connectionId: z.string().min(1).max(500),
  appUserId: z.string().min(1).max(500),
})

/**
 * GET — Linear agent connection status. Any member.
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

    const config = await getOrgPmConfig(orgId, 'linear')
    const agentConnectionId = config?.config?.agentConnectionId as string | undefined
    const agentAppUserId = config?.config?.agentAppUserId as string | undefined

    return NextResponse.json({
      connected: !!(agentConnectionId && agentAppUserId),
      appUserId: agentAppUserId ?? null,
      connectionId: agentConnectionId ?? null,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/linear-agent', method: 'GET' },
      tags: { layer: 'api', route: 'linear-agent' },
    })
    return NextResponse.json(
      { error: 'Failed to load Linear agent status' },
      { status: 500 },
    )
  }
}

/**
 * POST — Store agent connection config. Admin/owner only.
 * Merges agentConnectionId + agentAppUserId into existing config JSONB.
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
    const validated = postSchema.parse(body)

    // Load existing config to merge
    const existing = await getOrgPmConfig(orgId, 'linear')
    const existingConfig = existing?.config ?? {}
    const mergedConfig = {
      ...existingConfig,
      agentConnectionId: validated.connectionId,
      agentAppUserId: validated.appUserId,
    }

    // Update the config JSONB in-place
    const { error } = await supabase
      .from('org_pm_config')
      .update({ config: mergedConfig, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('provider', 'linear')

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { op: 'linear-agent.POST', org_id: orgId },
        tags: { layer: 'api', route: 'linear-agent' },
      })
      return NextResponse.json(
        { error: 'Failed to save Linear agent config' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/linear-agent', method: 'POST' },
      tags: { layer: 'api', route: 'linear-agent' },
    })
    return NextResponse.json(
      { error: 'Failed to save Linear agent config' },
      { status: 500 },
    )
  }
})

/**
 * DELETE — Remove agent connection config fields. Admin/owner only.
 * Strips agentConnectionId + agentAppUserId from config JSONB.
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

    const { id: orgId } = await (ctx as { params: Promise<{ id: string }> })
      .params

    const role = await getOrgMemberRole(userId, orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json(
        { error: 'Admin or owner role required' },
        { status: 403 },
      )
    }

    // Load existing config, remove agent fields
    const existing = await getOrgPmConfig(orgId, 'linear')
    const existingConfig = existing?.config ?? {}
    const { agentConnectionId: _a, agentAppUserId: _b, ...rest } =
      existingConfig as Record<string, unknown>

    const { error } = await supabase
      .from('org_pm_config')
      .update({ config: rest, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('provider', 'linear')

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { op: 'linear-agent.DELETE', org_id: orgId },
        tags: { layer: 'api', route: 'linear-agent' },
      })
      return NextResponse.json(
        { error: 'Failed to remove Linear agent config' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/linear-agent', method: 'DELETE' },
      tags: { layer: 'api', route: 'linear-agent' },
    })
    return NextResponse.json(
      { error: 'Failed to remove Linear agent config' },
      { status: 500 },
    )
  }
})
