import { NextResponse } from 'next/server'
import { ensureProviders, listProviders } from '@/lib/payments'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureProviders()
  return NextResponse.json({ providers: listProviders() })
}
