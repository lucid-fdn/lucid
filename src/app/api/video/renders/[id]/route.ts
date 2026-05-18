import { NextRequest, NextResponse } from 'next/server'
import { requireServerAuth, requireOrgContext } from '@/lib/auth/server-utils'
import { isInternalOrg } from '@/lib/auth/internal'
import { getVideoPresignedUrl } from '@/lib/storage/r2'

export const dynamic = 'force-dynamic'

const VIDEO_ENGINE_URL = process.env.VIDEO_ENGINE_URL || 'http://localhost:4040'
const VIDEO_ENGINE_API_KEY = process.env.VIDEO_ENGINE_API_KEY || ''

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireServerAuth()
  const orgId = await requireOrgContext()

  if (!isInternalOrg(orgId)) {
    return NextResponse.json(
      { error: 'Video Studio is not available.' },
      { status: 403 }
    )
  }

  const { id } = await params

  const res = await fetch(`${VIDEO_ENGINE_URL}/v1/render/${id}`, {
    headers: { Authorization: `Bearer ${VIDEO_ENGINE_API_KEY}` },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Render not found' }, { status: res.status })
  }

  const render = await res.json()

  // Generate presigned URL if video is completed
  if (render.video_url && render.status === 'completed') {
    try {
      render.playback_url = await getVideoPresignedUrl(render.video_url)
    } catch {
      // R2 not configured — return raw URL as fallback
    }
  }

  return NextResponse.json(render)
}
