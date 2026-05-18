import { NextRequest, NextResponse } from 'next/server'
import { proxyToL2 } from '../../_l2-proxy'
import { ErrorService } from '@/lib/errors/error-service'
import { updateEnvSchema } from '@/lib/mission-control/schemas'

export const dynamic = 'force-dynamic'

// PUT /api/runtimes/[id]/env?org_id=xxx
// Body: { vars: { KEY: "value", SECRET: null } }
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
    const parsed = updateEnvSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id } = await params

    const result = await proxyToL2({
      runtimeId: id,
      orgId,
      path: 'env',
      method: 'PUT',
      body: parsed.data,
    })

    if (!result.ok) return result.response

    return NextResponse.json({ success: true, message: 'Environment variables updated' })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/env PUT' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
