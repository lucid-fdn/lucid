import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { FEATURES } from '@/lib/features'
import { getTemplateBySlug } from '@/lib/retail'
import {
  provisionRetailAgent,
  RetailWorkspaceUnavailableError,
} from '@/lib/retail/provision'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(60).optional(),
  goal: z.string().max(1000).optional(),
})

/**
 * Retail funnel — create an agent from a template.
 *
 * Thin HTTP adapter over `provisionRetailAgent`. This handler only owns:
 *   - feature flag gate
 *   - auth
 *   - rate limit
 *   - Zod input validation
 *   - template lookup
 *   - response shaping + error mapping
 *
 * Everything else (org provisioning, workspace resolution, create,
 * cost cap wiring, passport provisioning, telemetry) lives in
 * `@/lib/retail/provision` so it's testable without HTTP mocks.
 */
export const POST = withCSRF(async (req: NextRequest) => {
  if (!FEATURES.retailFunnel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Distributed rate limit — 10 agent creations per minute per user.
    // Upstash sliding window in prod, in-memory fallback for local dev.
    const rl = await checkRateLimit(
      `retail-create:${userId}`,
      RateLimitPresets.STANDARD,
    )
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    const validated = createSchema.parse(body)

    const template = getTemplateBySlug(validated.slug)
    if (!template) {
      return NextResponse.json(
        { error: 'Unknown template' },
        { status: 404 },
      )
    }

    const { assistantId } = await provisionRetailAgent({
      userId,
      template,
      nameOverride: validated.name,
      goal: validated.goal,
    })

    return NextResponse.json(
      { id: assistantId, slug: template.slug },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof RetailWorkspaceUnavailableError) {
      return NextResponse.json(
        { error: 'Workspace does not have a project yet' },
        { status: 500 },
      )
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/retail/agents', method: 'POST' },
      tags: { layer: 'api', route: 'retail-agents' },
    })
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 },
    )
  }
})
