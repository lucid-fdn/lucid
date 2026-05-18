import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import {
  getNativeMutationOpsSummary,
  getOrgNativeMutationCandidates,
  reviewNativeMutationCandidate,
} from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const MutationQueueQuerySchema = z.object({
  org_id: z.string().uuid(),
  status: z.enum(['pending', 'applying', 'approved', 'rejected', 'promoted']).optional(),
  mutation_kind: z.enum(['memory_write', 'skill_create', 'skill_update', 'skill_delete']).optional(),
  assistant_id: z.string().uuid().optional(),
  failures_only: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const MutationReviewSchema = z.object({
  candidateId: z.string().uuid(),
  assistantId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'promote']),
  reviewNotes: z.string().nullable().optional(),
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const parsedQuery = MutationQueueQuerySchema.safeParse({
      org_id: searchParams.get('org_id') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      mutation_kind: searchParams.get('mutation_kind') ?? undefined,
      assistant_id: searchParams.get('assistant_id') ?? undefined,
      failures_only: searchParams.get('failures_only') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 })
    }

    const { org_id: orgId, status, mutation_kind: mutationKind, assistant_id: assistantId } = parsedQuery.data

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const failuresOnly = parsedQuery.data.failures_only === 'true'
    const limit = parsedQuery.data.limit ?? 100

    const [summary, candidates] = await Promise.all([
      getNativeMutationOpsSummary(orgId),
      getOrgNativeMutationCandidates(orgId, {
        assistantId: assistantId || undefined,
        status,
        mutationKind,
        failuresOnly,
        limit,
      }),
    ])

    return NextResponse.json({ summary, candidates })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/native-mutations', method: 'GET' },
      tags: { layer: 'api', route: 'mission-control-native-mutations' },
    })
    return NextResponse.json({ error: 'Failed to load native mutation queue' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = MutationReviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const candidate = await reviewNativeMutationCandidate(
      parsed.data.assistantId,
      orgId,
      parsed.data.candidateId,
      {
        action: parsed.data.action,
        reviewerId: userId,
        reviewNotes: parsed.data.reviewNotes ?? null,
        promotionScope: parsed.data.promotionScope ?? null,
      },
    )

    if (!candidate) {
      return NextResponse.json({ error: 'Failed to review native mutation candidate' }, { status: 500 })
    }

    const expectedStatus =
      parsed.data.action === 'approve'
        ? 'approved'
        : parsed.data.action === 'reject'
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
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/native-mutations', method: 'PATCH' },
      tags: { layer: 'api', route: 'mission-control-native-mutations' },
    })
    return NextResponse.json({ error: 'Failed to review native mutation candidate' }, { status: 500 })
  }
})
