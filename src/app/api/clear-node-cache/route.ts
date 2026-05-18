import { NextResponse } from 'next/server'
import { clearNodesCache } from '@/lib/lucid-l2/node-service'
import { timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'

function hasInternalAuth(request: Request): boolean {
  const secrets = [
    process.env.WORKER_TRIGGER_SECRET,
    process.env.INTERNAL_SERVICE_SECRET,
  ].flatMap((value) => {
    const trimmed = value?.trim()
    return trimmed ? [trimmed] : []
  })
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  if (secrets.length === 0 || !token) return false

  const actual = Buffer.from(token)
  return secrets.some((secret) => {
    const expected = Buffer.from(secret)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  })
}

export async function POST(request: Request) {
  if (!hasInternalAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  clearNodesCache()
  return NextResponse.json({ success: true, message: 'Node cache cleared' })
}
