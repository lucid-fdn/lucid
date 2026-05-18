import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth/session'
import { getCanvasConfig, updateCanvasConfig, type CanvasConfig } from '@/lib/db/organizations'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyMembership(orgId: string, userId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single()
  return !!data
}

/**
 * GET /api/organizations/[orgId]/canvas-config
 * Returns canvas positions + groups for the workspace.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await ctx.params
  if (!(await verifyMembership(orgId, session.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const config = await getCanvasConfig(orgId)
  return NextResponse.json(config)
}

/**
 * PUT /api/organizations/[orgId]/canvas-config
 * Saves canvas positions + groups for the workspace.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await ctx.params
  if (!(await verifyMembership(orgId, session.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as CanvasConfig

  // Basic validation
  if (!body || typeof body.positions !== 'object' || !Array.isArray(body.groups)) {
    return NextResponse.json({ error: 'Invalid canvas config' }, { status: 400 })
  }

  await updateCanvasConfig(orgId, {
    positions: body.positions,
    groups: body.groups,
  })

  return NextResponse.json({ success: true })
}
