/**
 * Agent Avatar Upload
 *
 * POST /api/launchpad/agents/[slug]/avatar
 *
 * Accepts multipart form data with an image file.
 * Uploads to Supabase Storage and updates the agent's avatar_url.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth/session'
import { getLaunchedAgentBySlug, updateLaunchedAgent } from '@/lib/db/launchpad'
import { uploadFile, deleteFile } from '@/lib/uploads/storage'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getServerSession()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const agent = await getLaunchedAgentBySlug(slug)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('avatar') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Delete old avatar if one exists
    if (agent.avatar_url) {
      await deleteFile(agent.avatar_url)
    }

    // Upload new avatar (reuse existing storage utility)
    const publicUrl = await uploadFile(file, 'avatars', `agents/${agent.id}`)

    // Update agent record
    await updateLaunchedAgent(agent.id, { avatar_url: publicUrl })

    return NextResponse.json({ avatar_url: publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
