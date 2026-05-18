import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { AGENT_OPS_OPERATOR_PROFILE_TYPES } from '@/lib/agent-ops/design-ops'
import {
  isUserOrgMember,
  listAgentOpsOperatorProfiles,
  upsertAgentOpsOperatorProfile,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  profileType: z.enum(AGENT_OPS_OPERATOR_PROFILE_TYPES).optional(),
})

const patchSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  profile_type: z.enum(AGENT_OPS_OPERATOR_PROFILE_TYPES),
  declared: z.record(z.string(), z.unknown()).optional(),
  inferred: z.record(z.string(), z.unknown()).optional(),
  confidence: z.record(z.string(), z.unknown()).optional(),
  decay_policy: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: parseNullableParam(req.nextUrl.searchParams.get('project_id')),
      profileType: req.nextUrl.searchParams.get('profile_type') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const profiles = await listAgentOpsOperatorProfiles({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      userId,
      profileType: parsed.data.profileType,
      limit: 50,
    })

    return NextResponse.json({ profiles })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/operator-profiles', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list operator profiles' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = patchSchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const profile = await upsertAgentOpsOperatorProfile({
      orgId: body.org_id,
      userId,
      projectId: body.project_id ?? null,
      profileType: body.profile_type,
      declared: body.declared ?? {},
      inferred: body.inferred ?? {},
      confidence: body.confidence ?? {},
      decayPolicy: body.decay_policy ?? {},
    })
    if (!profile) {
      return NextResponse.json({ error: 'Failed to update operator profile' }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/operator-profiles', method: 'PATCH' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update operator profile' }, { status: 500 })
  }
})

function parseNullableParam(value: string | null): string | null | undefined {
  if (value === null) return undefined
  if (value === 'null' || value === '') return null
  return value
}
