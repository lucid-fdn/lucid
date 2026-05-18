import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import {
  getAssistantNativeMutationCandidates,
  reviewNativeMutationCandidate,
} from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const reviewSchema = z.object({
  candidateId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'promote']),
  reviewNotes: z.string().max(2000).nullable().optional(),
  promotionScope: z.enum(['assistant_durable', 'org_durable']).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'promote' && !value.promotionScope) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['promotionScope'],
      message: 'promotionScope is required when action is promote',
    })
  }
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsedQuery = listQuerySchema.safeParse({
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedQuery.error.issues },
        { status: 400 },
      )
    }

    const limit = parsedQuery.data.limit ?? 50

    const candidates = await getAssistantNativeMutationCandidates(
      assistantId,
      assistant.org_id,
      limit,
    )

    return NextResponse.json({ candidates })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/native-mutation-candidates' },
      tags: { layer: 'api', route: 'assistant-native-mutation-candidates' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async (
  request: NextRequest,
  ctx: unknown,
) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await (ctx as { params: Promise<{ id: string }> }).params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const validated = reviewSchema.parse(await request.json())
    const candidate = await reviewNativeMutationCandidate(
      assistantId,
      assistant.org_id,
      validated.candidateId,
      {
        action: validated.action,
        reviewerId: userId,
        reviewNotes: validated.reviewNotes ?? null,
        promotionScope: validated.promotionScope ?? null,
      },
    )

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    const expectedStatus =
      validated.action === 'approve'
        ? 'approved'
        : validated.action === 'reject'
          ? 'rejected'
          : 'promoted'

    if (candidate.status !== expectedStatus) {
      return NextResponse.json(
        { error: 'Candidate is no longer pending', candidate },
        { status: 409 },
      )
    }

    return NextResponse.json({ candidate })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/native-mutation-candidates', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-native-mutation-candidates' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
