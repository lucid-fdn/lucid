import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

export const dynamic = 'force-dynamic'

function isTestAiRouteEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_AI_ROUTE === 'true'
}

export async function POST(request: NextRequest) {
  if (!isTestAiRouteEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (!isAuthorizedTestAiRoute(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return Response.json({ 
    success: true, 
    message: 'Test route works!' 
  })
}

export async function GET(request: NextRequest) {
  if (!isTestAiRouteEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (!isAuthorizedTestAiRoute(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return Response.json({ 
    success: true, 
    message: 'Test route works with GET too!' 
  })
}

function isAuthorizedTestAiRoute(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true

  const expected = process.env.TEST_AI_ROUTE_SECRET?.trim()
  if (!expected) return false

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!provided) return false

  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
