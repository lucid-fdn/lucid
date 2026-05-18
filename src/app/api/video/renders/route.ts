import { NextRequest, NextResponse } from 'next/server'
import { requireServerAuth } from '@/lib/auth/server-utils'
import { isInternalOrg } from '@/lib/auth/internal'
import { isUserOrgMember } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const VIDEO_ENGINE_URL = process.env.VIDEO_ENGINE_URL || 'http://localhost:4040'
const VIDEO_ENGINE_API_KEY = process.env.VIDEO_ENGINE_API_KEY || ''

const videoRenderRequestSchema = z.record(z.string(), z.unknown())

async function requireVideoStudioOrgAccess(request: NextRequest): Promise<
  | { ok: true; orgId: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireServerAuth()
  const orgId =
    request.nextUrl.searchParams.get('org_id') ??
    (request.method !== 'GET'
      ? await request
          .clone()
          .json()
          .then((body) => (typeof body?.org_id === 'string' ? body.org_id : null))
          .catch(() => null)
      : null)

  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'org_id required' }, { status: 400 }),
    }
  }

  const isMember = await isUserOrgMember(auth.userId, orgId)
  if (!isMember) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (!isInternalOrg(orgId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Video Studio is not available.' }, { status: 403 }),
    }
  }

  return { ok: true, orgId }
}

export async function GET(request: NextRequest) {
  const access = await requireVideoStudioOrgAccess(request)
  if (!access.ok) {
    return access.response
  }

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '50'

  const res = await fetch(`${VIDEO_ENGINE_URL}/v1/renders?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${VIDEO_ENGINE_API_KEY}`,
    },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(request: NextRequest) {
  const access = await requireVideoStudioOrgAccess(request)
  if (!access.ok) {
    return access.response
  }

  const parsedBody = videoRenderRequestSchema.safeParse(await request.json())
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Invalid render payload', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const res = await fetch(`${VIDEO_ENGINE_URL}/v1/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VIDEO_ENGINE_API_KEY}`,
    },
    body: JSON.stringify(parsedBody.data),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
