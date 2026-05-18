import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH() {
  return NextResponse.json(
    {
      error: 'Discord share toggles are deprecated. Use Install on Discord from the Channels panel.',
    },
    { status: 410 },
  )
}
