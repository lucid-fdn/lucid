import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ logs: [], message: 'Telegram logs endpoint - coming soon' })
}
