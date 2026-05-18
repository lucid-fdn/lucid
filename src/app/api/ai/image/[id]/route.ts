export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  return NextResponse.json(
    {
      error: 'Image prediction polling is no longer available.',
      code: 'image_prediction_polling_retired',
      id: id || null,
      replacement: '/api/ai/image',
    },
    { status: 410 },
  )
}
