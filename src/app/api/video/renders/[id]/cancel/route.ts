import { NextRequest, NextResponse } from 'next/server'
import { requireServerAuth, requireOrgContext } from '@/lib/auth/server-utils'
import { isInternalOrg } from '@/lib/auth/internal'

export const dynamic = 'force-dynamic'

const VIDEO_ENGINE_URL = process.env.VIDEO_ENGINE_URL || 'http://localhost:4040'
const VIDEO_ENGINE_API_KEY = process.env.VIDEO_ENGINE_API_KEY || ''

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireServerAuth()
  const orgId = await requireOrgContext()

  if (!isInternalOrg(orgId)) {
    return NextResponse.json({ error: 'Video Studio is not available.' }, { status: 403 })
  }

  const { id } = await params

  const res = await fetch(`${VIDEO_ENGINE_URL}/v1/render/${id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VIDEO_ENGINE_API_KEY}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
