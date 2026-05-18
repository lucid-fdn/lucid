import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { simulateRoutine } from '@/lib/routines/service'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    if (!body?.org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const simulation = await simulateRoutine(body)
    return NextResponse.json({ simulation })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/simulate POST' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
