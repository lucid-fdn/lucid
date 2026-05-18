import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeById, updateRuntimeL2Ownership } from '@/lib/db/mission-control'
import { getL2BaseUrl, isL2Available } from '@/lib/deployment-mode'
import { ErrorService } from '@/lib/errors/error-service'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'

export const dynamic = 'force-dynamic'

const claimSchema = z.object({
  owner: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
  signatureEncoding: z.enum(['base64', 'base58']).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = claimSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 })
    }

    const { id } = await params
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    if (!runtime.l2PassportId) {
      return NextResponse.json({ error: 'Runtime has no L2 passport to claim' }, { status: 400 })
    }
    if (!isL2Available()) {
      return NextResponse.json({ error: 'L2 Gateway is disabled for this environment' }, { status: 503 })
    }

    const l2Base = getL2BaseUrl()
    if (!l2Base) return NextResponse.json({ error: 'L2 Gateway base URL is not configured' }, { status: 503 })

    const response = await fetch(
      `${l2Base}/v1/passports/${encodeURIComponent(runtime.l2PassportId)}/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getL2AdminAuthHeaders(),
        },
        body: JSON.stringify({
          owner: parsed.data.owner,
          message: parsed.data.message,
          signature: parsed.data.signature,
          signature_encoding: parsed.data.signatureEncoding ?? 'base64',
          current_owner: runtime.l2PassportOwner ?? undefined,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(
        { error: body?.error ?? 'Failed to claim passport', details: body?.details },
        { status: response.status },
      )
    }

    await updateRuntimeL2Ownership(id, orgId, {
      passportOwner: parsed.data.owner,
      ownerMode: 'user_wallet',
      claimStatus: 'claimed',
      claimedByUserId: userId,
      claimedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      owner: parsed.data.owner,
      ownerMode: 'user_wallet',
      claimStatus: 'claimed',
      passport: body?.passport ?? null,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/passport-claim POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
