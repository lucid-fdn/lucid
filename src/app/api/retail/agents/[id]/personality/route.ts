import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { FEATURES } from '@/lib/features'
import { updateRetailAgentPersonality } from '@/lib/retail/personality'
import { RETAIL_SOUL_MAX_LENGTH } from '@/lib/retail/soul-presets'

export const dynamic = 'force-dynamic'

/**
 * Exactly one of `presetId` / `content` must be provided. Zod's refine
 * gives the client a readable error message instead of a cryptic union
 * failure.
 */
const updateSchema = z
  .object({
    presetId: z.string().min(1).max(50).optional(),
    content: z.string().max(RETAIL_SOUL_MAX_LENGTH).optional(),
  })
  .refine(
    (v) => (v.presetId ? 1 : 0) + (v.content !== undefined ? 1 : 0) === 1,
    { message: 'Provide exactly one of `presetId` or `content`.' },
  )

/**
 * Retail funnel — update an agent's personality.
 *
 * Thin HTTP adapter over `updateRetailAgentPersonality`. The service
 * function owns ownership guard, preset lookup, free-text cap, and DB
 * write; this handler owns feature flag, auth, rate limit, Zod, and
 * mapping service errors to HTTP status codes.
 */
export const POST = withCSRF(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    if (!FEATURES.retailFunnel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const userId = await getUserId()
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Distributed rate limit — 20 updates/min/user. Comfortably above
      // any legitimate UI flow (preset tap + optional free-text save),
      // well below a script.
      const rl = await checkRateLimit(
        `retail-personality:${userId}`,
        RateLimitPresets.RELAXED,
      )
      if (!rl.success) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a moment and try again.' },
          { status: 429 },
        )
      }

      const { id } = await ctx.params
      const body = await req.json()
      const validated = updateSchema.parse(body)

      const result = await updateRetailAgentPersonality({
        userId,
        assistantId: id,
        presetId: validated.presetId,
        content: validated.content,
      })

      if (!result.ok) {
        switch (result.reason) {
          case 'invalid_id':
          case 'not_found':
            // Collapse both to 404 — never leak "this agent exists but
            // isn't yours" to a guess-based probe.
            return NextResponse.json(
              { error: 'Not found' },
              { status: 404 },
            )
          case 'invalid_preset':
            return NextResponse.json(
              { error: 'Unknown personality preset' },
              { status: 400 },
            )
          case 'too_long':
            return NextResponse.json(
              {
                error: `Personality content must be ${RETAIL_SOUL_MAX_LENGTH} characters or fewer`,
              },
              { status: 400 },
            )
        }
      }

      return NextResponse.json({
        id: result.assistantId,
        soulContent: result.soulContent,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: error.issues },
          { status: 400 },
        )
      }
      ErrorService.captureException(error as Error, {
        severity: 'error',
        context: {
          endpoint: '/api/retail/agents/[id]/personality',
          method: 'POST',
        },
        tags: { layer: 'api', route: 'retail-agent-personality' },
      })
      return NextResponse.json(
        { error: 'Failed to update personality' },
        { status: 500 },
      )
    }
  },
)
