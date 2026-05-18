import { NextRequest, NextResponse } from 'next/server'
import { proxyToL2 } from '../../_l2-proxy'
import { ErrorService } from '@/lib/errors/error-service'
import { updateHealthcheckSchema } from '@/lib/mission-control/schemas'

export const dynamic = 'force-dynamic'

// PUT /api/runtimes/[id]/healthcheck?org_id=xxx
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
    const parsed = updateHealthcheckSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid healthcheck config', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id } = await params
    const result = await proxyToL2({
      runtimeId: id,
      orgId,
      path: 'healthcheck',
      method: 'PUT',
      body: parsed.data,
    })
    if (!result.ok) return result.response

    return NextResponse.json({ success: true, message: 'Healthcheck configuration updated' })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/healthcheck PUT' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
