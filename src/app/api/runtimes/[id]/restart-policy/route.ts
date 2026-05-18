import { NextRequest, NextResponse } from 'next/server'
import { proxyToL2 } from '../../_l2-proxy'
import { ErrorService } from '@/lib/errors/error-service'
import { updateRestartPolicySchema } from '@/lib/mission-control/schemas'

export const dynamic = 'force-dynamic'

// PUT /api/runtimes/[id]/restart-policy?org_id=xxx
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = updateRestartPolicySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid restart policy', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id } = await params
    const result = await proxyToL2({
      runtimeId: id,
      orgId,
      path: 'restart-policy',
      method: 'PUT',
      body: parsed.data,
    })
    if (!result.ok) return result.response

    return NextResponse.json({ success: true, message: `Restart policy set to ${parsed.data.policy}` })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/restart-policy PUT' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
