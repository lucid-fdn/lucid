import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getBoardMemories,
  createBoardMemory,
  deleteBoardMemory,
  isUserOrgMember,
  getOrgMemberRole,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = ['insight', 'policy', 'alert', 'context'] as const
const WRITE_ROLES = new Set(['owner', 'admin'])

const createSchema = z.object({
  content: z.string().min(1).max(10000),
  category: z.enum(VALID_CATEGORIES).optional(),
  importance: z.number().min(0).max(1).optional(),
  source: z.enum(['operator', 'agent', 'system']).optional(),
  source_agent_id: z.string().uuid().nullable().optional(),
})

const deleteSchema = z.object({
  memoryId: z.string().uuid(),
})

/**
 * GET /api/orgs/[id]/board-memory
 * List board memories for the org. Any member can read.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
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

    const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20
    const category = req.nextUrl.searchParams.get('category') ?? undefined

    const memories = await getBoardMemories(orgId, { limit, category })

    return NextResponse.json({ memories })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/board-memory', method: 'GET' },
      tags: { layer: 'api', route: 'board-memory' },
    })
    return NextResponse.json({ error: 'Failed to load board memories' }, { status: 500 })
  }
}

/**
 * POST /api/orgs/[id]/board-memory
 * Create a board memory entry. Requires admin or owner role.
 */
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await (ctx as { params: Promise<{ id: string }> }).params

    // Board memory mutations require admin+ role — shared prompt content is org-critical
    const role = await getOrgMemberRole(userId, orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const body = await req.json()
    const validated = createSchema.parse(body)

    const memory = await createBoardMemory(orgId, userId, validated)

    if (!memory) {
      return NextResponse.json(
        { error: 'Failed to create board memory. It may be a duplicate.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ memory }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/board-memory', method: 'POST' },
      tags: { layer: 'api', route: 'board-memory' },
    })
    return NextResponse.json({ error: 'Failed to create board memory' }, { status: 500 })
  }
})

/**
 * DELETE /api/orgs/[id]/board-memory
 * Delete a board memory entry. Requires admin or owner role.
 * Body: { memoryId: string }
 */
export const DELETE = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await (ctx as { params: Promise<{ id: string }> }).params

    const role = await getOrgMemberRole(userId, orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const body = await req.json()
    const validated = deleteSchema.parse(body)

    const success = await deleteBoardMemory(orgId, validated.memoryId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete board memory' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/board-memory', method: 'DELETE' },
      tags: { layer: 'api', route: 'board-memory' },
    })
    return NextResponse.json({ error: 'Failed to delete board memory' }, { status: 500 })
  }
})
