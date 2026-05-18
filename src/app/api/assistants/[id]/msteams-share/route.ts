import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(_request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Microsoft Teams share toggles are no longer supported. Use Install on Microsoft Teams directly.',
    },
    { status: 410 },
  )
}
