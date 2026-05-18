import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json({
    error: 'Org template catalog authoring has been retired. Create or update Lucid Pack templates through /api/agent-ops/packs.',
  }, { status: 410 })
}
